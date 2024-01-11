use nectar_process_lib::{
    await_message, our_capabilities, println, spawn,
    vfs::{self, create_drive, metadata, open_dir, Directory, FileType},
    Address, Message, OnExit, ProcessId, Request, Response,
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

wit_bindgen::generate!({
    path: "wit",
    world: "process",
    exports: {
        world: Component,
    },
});

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferRequest {
    ListFiles,
    Download { name: String, target: Address },
    Progress { name: String, progress: u64 },
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferResponse {
    ListFiles(Vec<FileInfo>),
    Download {
        name: String,
        worker: Address,
        size: u64,
    },
    Start,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum WorkerRequest {
    Init {
        name: String,
        target_worker: Address,
        is_requestor: bool,
        size: u64,
    },
    Chunk {
        name: String,
        offset: u64,
        length: u64,
    },
}

fn handle_transfer_request(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    files_dir: &Directory,
) -> anyhow::Result<()> {
    let transfer_request = serde_json::from_slice::<TransferRequest>(body)?;

    match transfer_request {
        TransferRequest::ListFiles => {
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

            Response::new()
                .body(serde_json::to_vec(&TransferResponse::ListFiles(files))?)
                .send()?;
        }
        TransferRequest::Download { name, target } => {
            // if source == our_node, we will send a download request to the target.
            // if not, it's a start downlaod request from another node.
            if source.node == our.node {
                let resp = Request::new()
                    .body(body.clone())
                    .target(target)
                    .send_and_await_response(5)??;

                let transfer_response = serde_json::from_slice::<TransferResponse>(&resp.body())?;

                match transfer_response {
                    TransferResponse::Download { name, worker, size } => {
                        // spin up a worker, and init it with the worker that it can use to download
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

                        Request::new()
                            .body(serde_json::to_vec(&WorkerRequest::Init {
                                name: name.clone(),
                                target_worker: worker,
                                is_requestor: true,
                                size,
                            })?)
                            .target(our_worker_address)
                            .send()?;
                    }
                    _ => {
                        println!(
                            "file_transfer: got something else as response to download request!"
                        );
                    }
                }
            } else {
                // download request from remote node.
                // spin up our worker, requestor = false
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

                let size = metadata(&format!("{}/{}", files_dir.path, &name))?.len;

                // initialize it
                let _resp = Request::new()
                    .body(serde_json::to_vec(&WorkerRequest::Init {
                        name: name.clone(),
                        target_worker: target,
                        is_requestor: false,
                        size,
                    })?)
                    .target(&our_worker_address)
                    .send()?;

                // now send response to source with our worker!
                Response::new()
                    .body(serde_json::to_vec(&TransferResponse::Download {
                        name,
                        worker: our_worker_address,
                        size,
                    })?)
                    .send()?;
            }
        }
        TransferRequest::Progress { name, progress } => {
            println!("file: {} progress: {}", name, progress);
        }
    }

    Ok(())
}

fn handle_transfer_response(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    files_dir: &Directory,
) -> anyhow::Result<()> {
    let transfer_response = serde_json::from_slice::<TransferResponse>(body)?;

    match transfer_response {
        TransferResponse::ListFiles(files) => {
            println!("got files from node: {:?} ,files: {:?}", source, files);
        }
        _ => {
            println!("start and download responses are handled in-line.");
        }
    }

    Ok(())
}

fn handle_message(our: &Address, files_dir: &Directory) -> anyhow::Result<()> {
    let message = await_message()?;

    match message {
        Message::Response {
            ref source,
            ref body,
            ..
        } => {
            handle_transfer_response(our, source, body, files_dir)?;
        }
        Message::Request {
            ref source,
            ref body,
            ..
        } => {
            handle_transfer_request(&our, source, body, files_dir)?;
        }
    };

    Ok(())
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("file_transfer: begin");

        let our = Address::from_str(&our).unwrap();

        let drive_path = create_drive(our.package_id(), "files").unwrap();
        let files_dir = open_dir(&drive_path, false).unwrap();

        loop {
            match handle_message(&our, &files_dir) {
                Ok(()) => {}
                Err(e) => {
                    println!("file_transfer: error: {:?}", e);
                }
            };
        }
    }
}
