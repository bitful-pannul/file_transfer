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
        target_worker: Option<Address>,
    },
    Chunk {
        name: String,
        offset: u64,
        length: u64,
    },
    Size(u64),
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferRequest {
    Progress { name: String, progress: u64 },
}

fn handle_message(
    our: &Address,
    file: &mut Option<File>,
    files_dir: &Directory,
    size: &mut Option<u64>,
) -> anyhow::Result<bool> {
    let message = await_message()?;

    match message {
        Message::Request {
            ref source,
            ref body,
            ..
        } => {
            let request = serde_json::from_slice::<WorkerRequest>(body)?;

            match request {
                WorkerRequest::Init {
                    name,
                    target_worker,
                } => {
                    // initialize command from main process,
                    // sets up worker, matches on if it's a sender or receiver.
                    // target_worker = None, we are receiver, else sender.

                    // open/create empty file in both cases.
                    let mut active_file =
                        open_file(&format!("{}/{}", files_dir.path, &name), true)?;

                    match target_worker {
                        Some(target_worker) => {
                            // we have a target, chunk the data, and send it.
                            let size = active_file.metadata()?.len;
                            let num_chunks = (size as f64 / CHUNK_SIZE as f64).ceil() as u64;

                            // give the receiving worker a size request so it can track it's progress!
                            Request::new()
                                .body(serde_json::to_vec(&WorkerRequest::Size(size))?)
                                .target(target_worker.clone())
                                .send()?;

                            active_file.seek(SeekFrom::Start(0))?;

                            for i in 0..num_chunks {
                                let offset = i * CHUNK_SIZE;
                                let length = CHUNK_SIZE.min(size - offset);

                                let mut buffer = vec![0; length as usize];
                                active_file.read_at(&mut buffer)?;

                                Request::new()
                                    .body(serde_json::to_vec(&WorkerRequest::Chunk {
                                        name: name.clone(),
                                        offset,
                                        length,
                                    })?)
                                    .target(target_worker.clone())
                                    .blob_bytes(buffer)
                                    .send()?;
                            }
                            Response::new().body(serde_json::to_vec(&"Done")?).send()?;
                            return Ok(true);
                        }
                        None => {
                            // waiting for response, store created empty file.
                            *file = Some(active_file);
                            Response::new()
                                .body(serde_json::to_vec(&"Started")?)
                                .send()?;
                        }
                    }
                }
                // someone sending a chunk to us!
                WorkerRequest::Chunk {
                    name,
                    offset,
                    length,
                } => {
                    let file = match file {
                        Some(file) => file,
                        None => {
                            return Err(anyhow::anyhow!(
                                "file_transfer: receive error: no file initialized"
                            ));
                        }
                    };

                    let bytes = match get_blob() {
                        Some(blob) => blob.bytes,
                        None => {
                            return Err(anyhow::anyhow!("file_transfer: receive error: no blob"));
                        }
                    };

                    file.seek(SeekFrom::Start(offset))?;
                    file.write_at(&bytes)?;

                    // if sender has sent us a size, give a progress update to main transfer!
                    if let Some(size) = size {
                        let progress = ((offset + length) as f64 / *size as f64 * 100.0) as u64;

                        // send update to main process
                        let main_app = Address {
                            node: our.node.clone(),
                            process: ProcessId::from_str(
                                "file_transfer:file_transfer:template.nec",
                            )?,
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
                WorkerRequest::Size(incoming_size) => {
                    *size = Some(incoming_size);
                }
            }
        }
        _ => {
            println!("file_transfer worker: got something else than request...");
        }
    }
    Ok(false)
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("file_transfer worker: begin");

        let our = Address::from_str(&our).unwrap();

        let drive_path = format!("{}/files", our.package_id());
        let files_dir = open_dir(&drive_path, false).unwrap();

        let mut file: Option<File> = None;
        let mut size: Option<u64> = None;

        loop {
            match handle_message(&our, &mut file, &files_dir, &mut size) {
                Ok(exit) => {
                    if exit {
                        println!("file_transfer worker done: exiting");
                        break;
                    }
                }
                Err(e) => {
                    println!("file_transfer: worker error: {:?}", e);
                }
            };
        }
    }
}
