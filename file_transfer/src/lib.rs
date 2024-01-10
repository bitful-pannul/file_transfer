use nectar_process_lib::{
    await_message, println,
    vfs::{self, create_drive, metadata, open_dir, Directory, FileType},
    Address, Message, ProcessId, Request, Response,
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
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferResponse {
    ListFiles(Vec<FileInfo>),
}

fn handle_transfer_request(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    file_dir: &Directory,
) -> anyhow::Result<()> {
    let transfer_request = serde_json::from_slice::<TransferRequest>(body)?;

    match transfer_request {
        TransferRequest::ListFiles => {
            let entries = file_dir.read()?;
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
    }

    Ok(())
}

fn handle_transfer_response(
    our: &Address,
    source: &Address,
    body: &Vec<u8>,
    file_dir: &Directory,
) -> anyhow::Result<()> {
    let transfer_response = serde_json::from_slice::<TransferResponse>(body)?;

    match transfer_response {
        TransferResponse::ListFiles(files) => {
            println!("got files from node: {:?} ,files: {:?}", source, files);
        }
    }

    Ok(())
}

fn handle_message(our: &Address, file_dir: &Directory) -> anyhow::Result<()> {
    let message = await_message()?;

    match message {
        Message::Response {
            ref source,
            ref body,
            ..
        } => {
            handle_transfer_response(our, source, body, file_dir)?;
        }
        Message::Request {
            ref source,
            ref body,
            ..
        } => {
            handle_transfer_request(&our, source, body, file_dir)?;
        }
    };

    println!("file_transfer: got message!: {:?}", message);
    Ok(())
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("file_transfer: begin");

        let our = Address::from_str(&our).unwrap();

        let drive_path = create_drive(our.package_id(), "files").unwrap();
        let file_dir = open_dir(&drive_path, false).unwrap();

        loop {
            match handle_message(&our, &file_dir) {
                Ok(()) => {}
                Err(e) => {
                    println!("file_transfer: error: {:?}", e);
                }
            };
        }
    }
}
