use serde::{Deserialize, Serialize};
use std::str::FromStr;

use nectar_process_lib::{
    await_message, get_blob, println,
    vfs::{open_dir, open_file, Directory, File, SeekFrom},
    Address, Message, ProcessId, Request, Response,
};

wit_bindgen::generate!({
    path: "wit",
    world: "process",
    exports: {
        world: Component,
    },
});

const CHUNK_SIZE: u64 = 1048576; // 1MB

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

#[derive(Serialize, Deserialize, Debug)]
pub enum WorkerResponse {
    Chunk {
        name: String,
        offset: u64,
        length: u64,
    },
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferResponse {
    ListFiles(Vec<FileInfo>),
    Download { name: String, worker: Address },
    Start,
}

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

struct WorkerState {
    target: Address,
    is_requestor: bool,
    file: File,
    size: u64,
}

fn handle_message(
    our: &Address,
    state: &mut Option<WorkerState>,
    files_dir: &Directory,
) -> anyhow::Result<()> {
    let message = await_message()?;

    match message {
        Message::Request {
            ref source,
            ref body,
            ..
        } => {
            let request = serde_json::from_slice::<WorkerRequest>(body)?;

            match request {
                // initialize command from main process,
                // sets up worker whether sender or receiver.
                WorkerRequest::Init {
                    name,
                    target_worker,
                    is_requestor,
                    size,
                } => {
                    //  open file within files directory, create if it doesn't exist.
                    let file = open_file(&format!("{}/{}", files_dir.path, &name), true)?;

                    let new_state = WorkerState {
                        target: target_worker.clone(),
                        is_requestor,
                        size,
                        file,
                    };

                    *state = Some(new_state);

                    // if we're the requestor, send requests to target to get chunks!
                    if is_requestor {
                        // round up, so if file is smaller than CHUNK_SIZE, it won't be 0.
                        let num_chunks = (size as f64 / CHUNK_SIZE as f64).ceil() as u64;
                        for i in 0..num_chunks {
                            let offset = i * CHUNK_SIZE;
                            let length = CHUNK_SIZE.min(size - offset);

                            Request::new()
                                .body(serde_json::to_vec(&WorkerRequest::Chunk {
                                    name: name.clone(),
                                    offset,
                                    length,
                                })?)
                                .target(target_worker.clone())
                                .send()?;
                        }
                    }
                }
                // someone requesting a chunk from us.
                WorkerRequest::Chunk {
                    name,
                    offset,
                    length,
                } => {
                    let state = match state {
                        Some(state) => state,
                        None => {
                            println!("file_transfer: error: no state");
                            return Ok(());
                        }
                    };

                    // get exact requested chunk from file.
                    let mut buffer = vec![0; length as usize];

                    state.file.seek(SeekFrom::Start(offset))?;
                    state.file.read_at(&mut buffer)?;

                    // send response, but this time with the chunk in the lazy_load_blob!
                    let response = WorkerResponse::Chunk {
                        name,
                        offset,
                        length,
                    };

                    Response::new()
                        .body(serde_json::to_vec(&response)?)
                        .blob_bytes(buffer)
                        .send()?;
                }
            }
        }
        Message::Response {
            ref source,
            ref body,
            ..
        } => {
            let response = serde_json::from_slice::<WorkerResponse>(&body)?;

            match response {
                // response for a chunk we requested.
                WorkerResponse::Chunk {
                    name,
                    offset,
                    length,
                } => {
                    let state = match state {
                        Some(state) => state,
                        None => {
                            println!("file_transfer: error: no state");
                            return Ok(());
                        }
                    };

                    let bytes = match get_blob() {
                        Some(blob) => blob.bytes,
                        None => {
                            println!("file_transfer: error: no blob");
                            return Ok(());
                        }
                    };

                    state.file.seek(SeekFrom::Start(offset))?;
                    state.file.write_at(&bytes)?;

                    let progress = (offset + length) / state.size * 100;

                    // send update to main process
                    let main_app = Address {
                        node: our.node.clone(),
                        process: ProcessId::from_str("file_transfer:file_transfer:template.uq")?,
                    };

                    Request::new()
                        .body(serde_json::to_vec(&TransferRequest::Progress {
                            name,
                            progress,
                        })?)
                        .target(&main_app)
                        .send()?;
                }
            }
            return Ok(());
        }
    }
    Ok(())
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("file_transfer worker: begin");

        let our = Address::from_str(&our).unwrap();

        let drive_path = format!("{}/files", our.package_id());
        let files_dir = open_dir(&drive_path, false).unwrap();

        let mut state: Option<WorkerState> = None;

        loop {
            match handle_message(&our, &mut state, &files_dir) {
                Ok(()) => {}
                Err(e) => {
                    println!("file_transfer: error: {:?}", e);
                }
            };
        }
    }
}
