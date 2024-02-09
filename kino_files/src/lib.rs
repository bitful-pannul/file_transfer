use kinode::process::standard::get_blob;
use kinode_process_lib::{
    await_message, get_state, http::{
        bind_http_path, bind_ws_path, send_response, send_ws_push, serve_ui, HttpServerRequest,
        StatusCode, WsMessageType,
    }, our_capabilities, print_to_terminal, println, set_state, spawn, vfs::{
        create_drive, create_file, metadata, open_dir, open_file, remove_file,
        Directory, File, FileType
    }, Address, LazyLoadBlob, Message, OnExit, ProcessId, Request, Response
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Cursor, Read};
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
    Delete { name: String },
    CreateDir { name: String },
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
    pub dir: Option<Vec<FileInfo>>,
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
                    dir: None,
                }),
                Err(_) => None,
            },
            FileType::Directory => Some(FileInfo {
                name: file.path.clone(),
                size: 0,
                dir: Some(ls_files(&open_dir(&file.path, false).unwrap()).unwrap()),
            }),
            _ => None,
        })
        .collect();

    Ok(files)
}

fn handle_transfer_request(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    files_dir: &Directory,
    channel_id: &mut u32,
) -> anyhow::Result<()> {
    let Ok(transfer_request) = serde_json::from_slice::<TransferRequest>(body) else {
        // surfacing these quietly for now.
        print_to_terminal(2, "kino_files: error: failed to parse transfer request");
        return Ok(());
    };

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
                    "kind": "progress",
                    "data": {
                        "name": name,
                        "progress": progress,
                    }
                })
                .to_string()
                .as_bytes()
                .to_vec(),
            };
            send_ws_push(
                channel_id.clone(),
                WsMessageType::Text,
                ws_blob,
            );
        }
        TransferRequest::Delete { name } => {
            if source.node != our.node {
                return Ok(());
            }
            println!("deleting file: {}", name);
            remove_file(&name)?;
            push_file_update_via_ws(channel_id);
        }
        TransferRequest::CreateDir { name } => {
            if source.node != our.node {
                return Ok(());
            }
            let path = format!("{}/{}", files_dir.path, name);
            println!("creating directory: {}", path);
            open_dir(&path, true)?;
            push_file_update_via_ws(channel_id);
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

                        match serde_json::from_slice::<FileTransferState>(&get_state().unwrap()) {
                            Ok(state) => {
                                if !state.known_nodes.contains(&remote_node) {
                                    let mut state = state;
                                    state.known_nodes.push(remote_node.clone());
                                    set_state(&serde_json::to_vec(&state)?);
                                }
                            }
                            Err(_) => {
                                let state = FileTransferState {
                                    known_nodes: vec![remote_node.clone()],
                                };
                                set_state(&serde_json::to_vec(&state)?);
                            }
                        }
                       
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

                    send_response(StatusCode::OK, Some(headers), body);
                }
                "POST" => {
                    // upload files from UI
                    let headers = request.headers();
                    let content_type = headers
                        .get("Content-Type")
                        .ok_or_else(|| anyhow::anyhow!("upload, Content-Type header not found"))?
                        .to_str()
                        .map_err(|_| anyhow::anyhow!("failed to convert Content-Type to string"))?;

                    let body = get_blob()
                        .ok_or_else(|| anyhow::anyhow!("failed to get blob"))?
                        .bytes;

                    let boundary_parts: Vec<&str> = content_type.split("boundary=").collect();
                    let boundary = match boundary_parts.get(1) {
                        Some(boundary) => boundary,
                        None => {
                            return Err(anyhow::anyhow!(
                                "upload fail, no boundary found in POST content type"
                            ));
                        }
                    };

                    let data = Cursor::new(body.clone());

                    let mut multipart = multipart::server::Multipart::with_body(data, *boundary);
                    while let Some(mut field) = multipart.read_entry()? {
                        if let Some(filename) = field.headers.filename.clone() {
                            let mut buffer = Vec::new();
                            field.data.read_to_end(&mut buffer)?;
                            println!("uploaded file {} with size {}", filename, buffer.len());
                            let file_path = format!("{}/{}", files_dir.path, filename);
                            let file = create_file(&file_path)?;
                            file.write(&buffer)?;

                            let ws_blob = LazyLoadBlob {
                                mime: Some("application/json".to_string()),
                                bytes: serde_json::json!({
                                    "kind": "uploaded",
                                    "data": {
                                        "name": filename,
                                        "size": buffer.len(),
                                    }
                                })
                                .to_string()
                                .as_bytes()
                                .to_vec(),
                            };

                            send_ws_push(
                                our_channel_id.clone(),
                                WsMessageType::Text,
                                ws_blob,
                            );
                        }
                    }

                    let mut headers = HashMap::new();
                    headers.insert("Content-Type".to_string(), "application/json".to_string());
                    send_response(StatusCode::OK, Some(headers), vec![]);
                }
                _ => {}
            }
        }
        HttpServerRequest::WebSocketClose(_) => {}
        HttpServerRequest::WebSocketOpen { channel_id, path } => {
            *our_channel_id = channel_id;

            push_state_via_ws(our_channel_id);
        }
        HttpServerRequest::WebSocketPush { message_type, .. } => {
            if message_type != WsMessageType::Binary {
                return Ok(());
            }
            let Some(blob) = get_blob() else {
                return Ok(());
            };
            handle_transfer_request(our, source, &blob.bytes, files_dir, our_channel_id)?
        }
    }
    Ok(())
}

fn push_state_via_ws(channel_id: &mut u32) {
    send_ws_push(
        channel_id.clone(), 
        WsMessageType::Text, 
        LazyLoadBlob {
            mime: Some("application/json".to_string()),
            bytes: serde_json::json!({
                "kind": "state",
                "data": serde_json::from_slice::<FileTransferState>(&get_state().unwrap()).unwrap()
            })
            .to_string()
            .as_bytes()
            .to_vec()
        }
    )
}

fn push_file_update_via_ws(channel_id: &mut u32) {
    send_ws_push(
        channel_id.clone(), 
        WsMessageType::Text, 
        LazyLoadBlob {
            mime: Some("application/json".to_string()),
            bytes: serde_json::json!({
                "kind": "file_update",
                "data": ""
            })
            .to_string()
            .as_bytes()
            .to_vec()
        }
    )
}

fn handle_transfer_response(source: &Address, body: &Vec<u8>, is_http: bool) -> anyhow::Result<()> {
    let Ok(transfer_response) = serde_json::from_slice::<TransferResponse>(body) else {
        // surfacing these quietly for now.
        print_to_terminal(2, "kino_files: error: failed to parse transfer response");
        return Ok(());
    };

    match transfer_response {
        TransferResponse::ListFiles(files) => {
            println!("got files from node: {:?} ,files: {:?}", source, files);

            if is_http {
                let mut headers = HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());

                let body = serde_json::to_vec(&TransferResponse::ListFiles(files))?;

                send_response(StatusCode::OK, Some(headers), body)
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
    let message = await_message()?;

    let http_server_address = ProcessId::from_str("http_server:distro:sys").unwrap();

    match message {
        Message::Response {
            ref source,
            ref body,
            ..
        } => handle_transfer_response(source, body, false),
        Message::Request {
            ref source,
            ref body,
            ..
        } => {
            if source.process == http_server_address {
                handle_http_request(&our, source, body, files_dir, channel_id)?
            }
            handle_transfer_request(&our, source, body, files_dir, channel_id)
        }
    }
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


// user-facing state
// this is intended to be NON-ESSENTIAL, i.e., we WILL overwrite it on error
#[derive(Serialize, Deserialize, Debug)]
struct FileTransferState {
    pub known_nodes: Vec<Address>,
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("kino_files: begin");

        let our = Address::from_str(&our).unwrap();
        let drive_path = create_drive(our.package_id(), "files").unwrap();
        let state = get_state().unwrap_or_else(|| serde_json::to_vec(&FileTransferState { known_nodes: vec![] }).unwrap());
        set_state(&state);
        let files_dir = open_dir(&drive_path, false).unwrap();

        //TODO auth?
        serve_ui(&our, &"ui", true, false, vec!["/"]).unwrap();
        bind_http_path("/files", false, false).unwrap();
        bind_ws_path("/", false, false).unwrap();

        let mut channel_id: u32 = 69;

        loop {
            match handle_message(&our, &files_dir, &mut channel_id) {
                Ok(()) => {}
                Err(e) => {
                    println!("kino_files: error: {:?}", e);
                }
            };
        }
    }
}
