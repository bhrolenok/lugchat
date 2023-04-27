use std::error::Error;
use std::{env, path};

use openssl::pkey::{PKey, Private};
use openssl::rsa::Rsa;
use protocol::ServerReason;
use tokio_tungstenite::tungstenite::Error as TungsteniteError;
use url::ParseError;

use crate::configuration::Configuration;
use crate::connection::Connection;

mod connection;
mod configuration;
mod protocol;
mod utils;

#[derive(Debug)]
pub enum ChatError {
    Communication(),
    IO(TungsteniteError),
    Other(String),
    Parsing(ParseError),
    Protocol(ServerReason),
}

impl Error for ChatError {}
impl std::fmt::Display for ChatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatError::IO(io) => io.fmt(f),
            ChatError::Parsing(p) => p.fmt(f),
            ChatError::Other(s) => f.write_fmt(format_args!("Other chat error: {}", s)),
            ChatError::Protocol(sr) => f.write_fmt(format_args!("{}", sr)),
            ChatError::Communication() => f.write_str("Internal communication issue ocurred."),
        }
    }
}

fn load_or_generate_private_key() -> PKey<Private> {
    let private_pem = path::Path::new("private.pem");
    let keypair = match std::fs::metadata(private_pem) {
        Ok(_) => {
            let private_pem = std::fs::read_to_string("private.pem").expect("Unable to read the `private.pem` private key file.  Exiting...");
            Rsa::private_key_from_pem(private_pem.as_bytes()).unwrap()
        },
        Err(_) => {
            let pk = Rsa::generate(4096).unwrap();
            std::fs::write(private_pem, pk.private_key_to_pem().unwrap()).ok();
            pk
        },
    };
    PKey::from_rsa(keypair).unwrap()
}

#[tokio::main]
async fn main() {
    println!("Lug Chat!");
    let connect_addr = env::args().nth(1).unwrap_or_else(|| {
        let default = "wss://127.0.0.1:8080";
        println!("Connecting to default server: {}", default);
        default.to_string()
    });

    let private_key = load_or_generate_private_key();
    let configuration = Configuration::new(String::from("rust"), private_key, connect_addr);

    let conn = Connection::connect(configuration).await.unwrap();
    let _ = Connection::close(conn).await;
}
