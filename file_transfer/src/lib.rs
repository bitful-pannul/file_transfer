use kinode_process_lib::{
    await_message,
    http::{
        bind_http_path, bind_http_static_path, bind_ws_path, send_response, send_ws_push, serve_ui,
        HttpServerRequest, IncomingHttpRequest, StatusCode, WsMessageType,
    },
    our_capabilities, print_to_terminal, println, spawn,
    vfs::{create_drive, create_file, metadata, open_dir, Directory, FileType},
    Address, LazyLoadBlob, Message, OnExit, PackageId, ProcessId, Request, Response,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;

wit_bindgen::generate!({
    path: "wit",
    world: "process",
    exports: {
        world: Component,
    },
});

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferRequest {
    ListFiles,
    Download { name: String, target: Address },
    Progress { name: String, progress: u64 },
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferResponse {
    ListFiles(Vec<FileInfo>),
    Download { name: String, worker: Address },
    Done,
    Started,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum WorkerRequest {
    Initialize {
        name: String,
        target_worker: Option<Address>,
    },
}

fn ls_files(files_dir: &Directory) -> anyhow::Result<Vec<FileInfo>> {
    let entries = files_dir.read()?;
    let files: Vec<FileInfo> = entries
        .iter()
        .filter_map(|file| match file.file_type {
            FileType::File => match metadata(&file.path) {
                Ok(metadata) => Some(FileInfo {
                    name: file.path.clone(),
                    size: metadata.len,
                }),
                Err(_) => None,
            },
            _ => None,
        })
        .collect();

    Ok(files)
}

// fn parse_files_from_form(data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
//     let boundary = Multipart::boundary_from_content_type("multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW")
//         .ok_or("Failed to get boundary")?;

//     let mut multipart = Multipart::with_body(data, boundary);

//     while let Some(mut field) = multipart.read_entry()? {
//         if let Some(filename) = field.headers.filename.clone() {
//             let mut buffer = Vec::new();
//             field.data.read_to_end(&mut buffer)?;
//             println!(format!("Received file {} with size {}", filename, buffer.len()).as_str());
//         }
//     }

//     Ok(())
// }

fn handle_transfer_request(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    files_dir: &Directory,
    channel_id: &mut u32,
) -> anyhow::Result<()> {
    println!("file_transfer: got transfer request");
    let transfer_request = serde_json::from_slice::<TransferRequest>(body)?;

    match transfer_request {
        TransferRequest::ListFiles => {
            let files = ls_files(files_dir)?;

            Response::new()
                .body(serde_json::to_vec(&TransferResponse::ListFiles(files))?)
                .send()?;
        }
        TransferRequest::Download { name, target } => {
            // spin up a worker, initialize based on whether it's a downloader or a sender.
            let our_worker = spawn(
                None,
                &format!("{}/pkg/worker.wasm", our.package_id()),
                OnExit::None,
                our_capabilities(),
                vec![],
                false,
            )?;

            let our_worker_address = Address {
                node: our.node.clone(),
                process: our_worker,
            };

            match source.node == our.node {
                true => {
                    // we want to download a file
                    let _resp = Request::new()
                        .body(serde_json::to_vec(&WorkerRequest::Initialize {
                            name: name.clone(),
                            target_worker: None,
                        })?)
                        .target(&our_worker_address)
                        .send_and_await_response(5)??;

                    // send our initialized worker address to the other node
                    Request::new()
                        .body(serde_json::to_vec(&TransferRequest::Download {
                            name: name.clone(),
                            target: our_worker_address,
                        })?)
                        .target(&target)
                        .send()?;
                }
                false => {
                    // they want to download a file
                    Request::new()
                        .body(serde_json::to_vec(&WorkerRequest::Initialize {
                            name: name.clone(),
                            target_worker: Some(target),
                        })?)
                        .target(&our_worker_address)
                        .send()?;
                }
            }
        }
        TransferRequest::Progress { name, progress } => {
            // print out in terminal and pipe to UI via websocket
            println!("file: {} progress: {}%", name, progress);
            let ws_blob = LazyLoadBlob {
                mime: Some("application/json".to_string()),
                bytes: serde_json::json!({
                    "Progress": {
                        "name": name,
                        "progress": progress,
                    }
                })
                .to_string()
                .as_bytes()
                .to_vec(),
            };
            send_ws_push(
                our.node.clone(),
                channel_id.clone(),
                WsMessageType::Text,
                ws_blob,
            )?;
        }
    }

    Ok(())
}

fn handle_http_request(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    files_dir: &Directory,
    our_channel_id: &mut u32,
) -> anyhow::Result<()> {
    println!("file_transfer: got http request");
    let http_request = serde_json::from_slice::<HttpServerRequest>(body)?;

    match http_request {
        HttpServerRequest::Http(request) => {
            match request.method()?.as_str() {
                "GET" => {
                    // /?node=akira.os
                    if let Some(remote_node) = request.query_params().get("node") {
                        let remote_node = Address {
                            node: remote_node.clone(),
                            process: our.process.clone(),
                        };

                        let resp = Request::new()
                            .body(serde_json::to_vec(&TransferRequest::ListFiles)?)
                            .target(&remote_node)
                            .send_and_await_response(5)??;

                        handle_transfer_response(source, &resp.body().to_vec(), true)?;
                    }

                    let files = ls_files(files_dir)?;
                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());

                    let body = serde_json::to_vec(&TransferResponse::ListFiles(files))?;

                    send_response(StatusCode::OK, Some(headers), body)?;
                }
                "POST" => {
                    // upload a file
                    if source.node != our.node {
                        println!("file_transfer: error: cannot upload file from another node");
                        return Ok(());
                    }
                }
                _ => {}
            }
        }
        HttpServerRequest::WebSocketClose(_) => {}
        HttpServerRequest::WebSocketOpen { path, channel_id } => {
            *our_channel_id = channel_id;
        }
        HttpServerRequest::WebSocketPush {
            channel_id,
            message_type,
        } => {
            handle_transfer_request(our, source, &body, files_dir, our_channel_id)?;
        }
    }
    Ok(())
}

fn handle_transfer_response(source: &Address, body: &Vec<u8>, is_http: bool) -> anyhow::Result<()> {
    println!("file_transfer: got transfer response");

    let transfer_response = serde_json::from_slice::<TransferResponse>(body)?;

    match transfer_response {
        TransferResponse::ListFiles(files) => {
            println!("got files from node: {:?} ,files: {:?}", source, files);

            if is_http {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());

                let body = serde_json::to_vec(&TransferResponse::ListFiles(files))?;

                send_response(StatusCode::OK, Some(headers), body)?;
            }
        }
        _ => {}
    }

    Ok(())
}

fn handle_message(
    our: &Address,
    files_dir: &Directory,
    channel_id: &mut u32,
) -> anyhow::Result<()> {
    println!("file_transfer: got message");

    let message = await_message()?;

    let http_server_address = ProcessId::from_str("http_server:distro:sys").unwrap();

    match message {
        Message::Response {
            ref source,
            ref body,
            ..
        } => {
            handle_transfer_response(source, body, false)?;
        }
        Message::Request {
            ref source,
            ref body,
            ..
        } => {
            if source.process == http_server_address {
                handle_http_request(&our, source, body, files_dir, channel_id)?;
            }
            handle_transfer_request(&our, source, body, files_dir, channel_id)?;
        }
    };

    Ok(())
}

/// step 1. bind http path / central UI
/// UI makes /GET request to get list of files
/// optional get list of files from another node
///     app_url/node_id   
///     ...
/// List<Download>
///    GET /download?name=foo&target=app_url
/// Progress %, pipe request through to frontend
/// POST upload file ()

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("file_transfer: begin");

        let our = Address::from_str(&our).unwrap();

        let drive_path = create_drive(our.package_id(), "files").unwrap();
        let files_dir = open_dir(&drive_path, false).unwrap();

        serve_ui(&our, &"ui").unwrap();
        bind_http_path("/files", false, true).unwrap();
        bind_ws_path("/", false, false).unwrap();

        let mut channel_id: u32 = 69;

        loop {
            match handle_message(&our, &files_dir, &mut channel_id) {
                Ok(()) => {}
                Err(e) => {
                    println!("file_transfer: error: {:?}", e);
                }
            };
        }
    }
}
