use std::str::FromStr;
use serde::{Serialize, Deserialize};

use nectar_process_lib::{await_message, print_to_terminal, Address, Message, ProcessId, Request, Response};

wit_bindgen::generate!({
    path: "wit",
    world: "process",
    exports: {
        world: Component,
    },
});

#[derive(Debug, Serialize, Deserialize)]
enum ChatRequest {
    Send { target: String, message: String },
    History,
}

#[derive(Debug, Serialize, Deserialize)]
enum ChatResponse {
    Ack,
    History { messages: MessageArchive },
}

type MessageArchive = Vec<(String, String)>;

fn handle_message (
    our: &Address,
    message_archive: &mut MessageArchive,
) -> anyhow::Result<()> {
    let message = await_message().unwrap();

    match message {
        Message::Response { .. } => {
            print_to_terminal(0, &format!("file_transfer: unexpected Response: {:?}", message));
            panic!("");
        },
        Message::Request { ref source, ref body, .. } => {
            match serde_json::from_slice(body)? {
                ChatRequest::Send { ref target, ref message } => {
                    if target == &our.node {
                        print_to_terminal(0, &format!("file_transfer|{}: {}", source.node, message));
                        message_archive.push((source.node.clone(), message.clone()));
                    } else {
                        let _ = Request::new()
                            .target(Address {
                                node: target.clone(),
                                process: ProcessId::from_str("file_transfer:file_transfer:template.nec")?,
                            })
                            .body(body.clone())
                            .send_and_await_response(5)?
                            .unwrap();
                    }
                    Response::new()
                        .body(serde_json::to_vec(&ChatResponse::Ack).unwrap())
                        .send()
                        .unwrap();
                },
                ChatRequest::History => {
                    Response::new()
                        .body(serde_json::to_vec(&ChatResponse::History {
                            messages: message_archive.clone(),
                        }).unwrap())
                        .send()
                        .unwrap();
                },
            }
        },
    }
    Ok(())
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        print_to_terminal(0, "file_transfer: begin");

        let our = Address::from_str(&our).unwrap();
        let mut message_archive: MessageArchive = Vec::new();

        loop {
            match handle_message(&our, &mut message_archive) {
                Ok(()) => {},
                Err(e) => {
                    print_to_terminal(0, format!(
                        "file_transfer: error: {:?}",
                        e,
                    ).as_str());
                },
            };
        }
    }
}
