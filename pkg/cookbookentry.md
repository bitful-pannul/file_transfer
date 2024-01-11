# File Transfer

In this entry we're going to be building a file transfer app, letting nodes download files from a public directory. It will use the vfs to read and write files, and will spin up worker processes for the transfer.

This guide assumes a basic understanding of nectar process building, some familiarity with necdev, requests and responses, and some knowledge of rust syntax.

## Start

First let's initialize a new project with `necdev new file_transfer`

I cleaned out the template code so we have a complete fresh start:

We're using the following nectar_process_lib version in Cargo.toml for this app:
`nectar_process_lib = { git = "ssh://git@github.com/uqbar-dao/process_lib.git", rev = "412fbfe" }`

```rust
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use nectar_process_lib::{await_message, println, Address, Message, ProcessId, Request, Response};

wit_bindgen::generate!({
    path: "wit",
    world: "process",
    exports: {
        world: Component,
    },
});

fn handle_message(our: &Address) -> anyhow::Result<()> {
    let message = await_message()?;
    println!("file_transfer: got message!: {:?}", message);
    Ok(())
}

struct Component;
impl Guest for Component {
    fn init(our: String) {
        println!("file_transfer: begin");

        let our = Address::from_str(&our).unwrap();

        loop {
            match handle_message(&our) {
                Ok(()) => {}
                Err(e) => {
                    println!("file_transfer: error: {:?}", e);
                }
            };
        }
    }
}
```

Let's start by creating a drive (folder) in our vfs and opening it, where files will be able to be downloaded by other nodes.
We'll add a whitelist a bit later!

We'll import the vfs functions from the process_lib, and specifically the `create_drive` and `open_dir` functions.

```rust
use nectar_process_lib::vfs::{self, create_drive, open_dir, Directory};

let drive_path = create_drive(our.package_id(), "files").unwrap();
```

To start, this will be an app without UI, so the way to get files in, you simply copy them into the "files" folder located within your_node/vfs/file_transfer:file_transfer:template.uq/.

We now need some way for other nodes to know what files they can download from us, so let's add some message types!

```rust
#[derive(Serialize, Deserialize, Debug)]
pub enum TransferRequest {
    ListFiles,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferResponse {
    ListFiles(Vec<FileInfo>),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
}
```

We can start with this, a node can request a list of files, and we give them a list of file names and their sizes in bytes.

Adding some matching for requests and responses, and deserializing into our TransferRequest type.

```rust
use nectar_process_lib::{
    await_message, println,
    vfs::{self, create_drive, open_dir, Directory},
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
            println!("hellö");
        }
    }

    Ok(())
}

fn handle_message(our: &Address, file_dir: &Directory) -> anyhow::Result<()> {
    let message = await_message()?;

    match message {
        Message::Response { .. } => {
            return Ok(());
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
```

Now, we can fill in the ListFiles request and response behaviour, which is just a readDir action to the vfs.

```rust
use nectar_process_lib::vfs::{self, create_drive, metadata, open_dir, Directory, FileType};


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
```

And add the corresponding handle_transfer_response too!

```rust

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

// ...

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
```

You can now try this out by booting two nodes (fake or real), putting some files in the /files folder of one of them, and sending a request!

`/m node2.nec@file_transfer:file_transfer:template.uq "ListFiles"`

And you'll see a response printed!

### Transfer

Now, let's get to the fun part, downloading/sending files!

We could handle all of this within our file_transfer process, but something better we can easily do is spin up another process, a worker, that does the downloading/sending, and just sends progress updates back to the main file_transfer!

This way we can have several files downloading at the same time, not waiting for one to finish.

Let's start by defining some types.

We'll need a request that tells our main process to spin up a worker, requesting the node we're downloading from to do the same.

```rust
#[derive(Serialize, Deserialize, Debug)]
pub enum TransferRequest {
    ListFiles,
    Download { name: String, node: Address },
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TransferResponse {
    ListFiles(Vec<FileInfo>),
    Download { name: String, worker: ProcessId },
}
```

This will give us a request to say "I want to download this file", and we'll get back, "all good, you can do it by calling this worker".

Now let's add the intra worker communication types:

```rust
#[derive(Serialize, Deserialize, Debug)]
pub enum WorkerRequest {
    Init { name: String, target_worker: Address, is_requestor: bool },
    Chunk { name: String, offset: u64, length: u64 },
}

#[derive(Serialize, Deserialize, Debug)]
pub enum WorkerResponse {
    Chunk { name: String, offset: u64, length: u64 },
    Progress { name: String, progress: u64 },
}
```

Workers will take an init function from their own node, then take requests for specific chunks from other worker nodes.

Progress responses are sent back to the main process, which can then pipe them through as websocket updates to our frontend!

Let's code this out, we'll import the spawn function from the process_lib.
To actually spawn the wasm file, we need to code out the worker process as well.

```rust

```
