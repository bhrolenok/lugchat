use std::collections::HashMap;
use std::error::Error;
use std::str::Utf8Error;
use std::{env, io};
use std::sync::{Arc, Mutex};
use base64::Engine;
use base64::engine::general_purpose as Base64;
use futures_util::SinkExt;
use openssl::hash::MessageDigest;
use openssl::pkey::{PKey, Private};
use openssl::rsa::Rsa;
use openssl::sign::Signer;
use time::OffsetDateTime;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::{Error as TungsteniteError, Message};
use tokio_tungstenite::tungstenite::Message::Text;
use tokio_tungstenite::{WebSocketStream, MaybeTlsStream, connect_async_tls_with_config, Connector};


use serde_json::json;
use url::{Url, ParseError};

mod protocol;
mod utils;

type ChatWebSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug)]
enum ChatError {
    IO(TungsteniteError),
    Parsing(ParseError),
}

impl Error for ChatError {}
impl std::fmt::Display for ChatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatError::IO(_) => todo!(),
            ChatError::Parsing(p) => p.fmt(f),
        }
    }
}

struct ChannelConnection<'a> {
    nick: &'a str,
    pkey: PKey<Private>,
    ws_stream: ChatWebSocket,
}

impl ChannelConnection<'_, > {
    pub async fn new<'a>(address: &str, nick: &'a str) -> Result<ChannelConnection<'a>, ChatError> {
        let url = Url::parse(&address);
        if url.is_err() {
            return Err(ChatError::Parsing(url.err().unwrap()));
        }

        let tls_conf = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .build().unwrap();

        // Create the websocket (this performs the WS handshake but not the protocol handshake)
        let (ws, _) = match connect_async_tls_with_config(url.unwrap(), None, Some(Connector::NativeTls(tls_conf))).await {
            Ok(ws) => ws,
            Err(err) => return Err(ChatError::IO(err)),
        };

        // Generate an RSA keypair
        let keypair = Rsa::generate(4096).unwrap();
        let keypair = PKey::from_rsa(keypair).unwrap();

        let mut conn = ChannelConnection { 
            nick: nick.clone(),
            pkey: keypair.to_owned(),
            ws_stream: ws,
        };


        // Pull out the base64 portion of the PEM (strip start and end)
        let pub_key = keypair.public_key_to_pem().unwrap();
        let pub_key = String::from_utf8_lossy(&pub_key);
        let hello = json!({
            "type": "hello",
            "nick": nick,
            "time": utc_as_millis!(),
            "content": {
                "pubKey": pub_key,
            }
        });
        conn.send_signed(hello).await.unwrap();

        Ok(conn)
    }

    async fn send_signed(&mut self, msg: serde_json::Value) -> Result<(), TungsteniteError> {
        let mut signer = Signer::new(MessageDigest::sha512(), &self.pkey).unwrap();
        signer.update(msg.to_string().as_bytes()).unwrap();

        let sig = Base64::STANDARD_NO_PAD.encode(signer.sign_to_vec().unwrap());
        let envelope = json!({
            "message": msg, // !FIXME This gets converted to a string and not the object, ugh!
            "sig": sig,
            "keyHash": "BADC0DE",
            "protocolVersion": 1,
        });

        self.ws_stream.send(Message::text(envelope.to_string())).await
    }
}

#[tokio::main]
async fn main() {
    println!("Lug Chat!");
    let connect_addr = env::args().nth(1).unwrap_or_else(|| {
        let default = "wss://127.0.0.1:8080";
        println!("Connecting to default server: {}", default);
        default.to_string()
    });

    ChannelConnection::new(connect_addr.as_str(), "test").await.expect("Failed to connect to server");
}
