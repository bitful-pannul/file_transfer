use kinode_process_lib::{
    await_message, our_capabilities, println, spawn,
    vfs::{create_drive, metadata, open_dir, Directory, FileType},
    Address, Message, OnExit, Request, Response,
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
            println!("file: {} progress: {}%", name, progress);
        }
    }

    Ok(())
}

fn handle_transfer_response(source: &Address, body: &Vec<u8>) -> anyhow::Result<()> {
    let transfer_response = serde_json::from_slice::<TransferResponse>(body)?;

    match transfer_response {
        TransferResponse::ListFiles(files) => {
            println!("got files from node: {:?} ,files: {:?}", source, files);
        }
        _ => {}
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
            handle_transfer_response(source, body)?;
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
