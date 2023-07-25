use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose as Base64;
use futures_util::{SinkExt, StreamExt};
use openssl::hash::MessageDigest;
use openssl::sign::Signer;
use serde_json::Value;
use time::OffsetDateTime;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, MaybeTlsStream, connect_async_tls_with_config, Connector};
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::chat_error::ChatError;
use crate::configuration::Configuration;
use crate::protocol::message::{ServerMessage, ServerAcceptCode, UnmappedMessage};
use crate::protocol::message::MessageType;
use crate::protocol::envelope::SignedEnvelope;
use crate::utc_as_millis;

type ChatWebSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

type MessageMap = Arc<Mutex<HashMap<String,oneshot::Sender<ServerMessage>>>>;

// FnOnce(ServerMessage)

/// A wrapper around the websocket connection to a chat server.
#[derive(Debug)]
pub struct Connection {
    configuration: Configuration,
    sent_msg_map: MessageMap,

    // Websocket thread handles and controllers
    cancel_token: CancellationToken,
    send_channel: mpsc::Sender<CommunicationPackage>,
    ws_thread: JoinHandle<()>,
}

#[allow(dead_code)]
impl Connection {
    /// Creates a new Connection to the associated URL.
    pub async fn connect(config: Configuration) -> Result<Connection, ChatError> {

        let url = Url::parse(config.get_server_url().as_str());
        if url.is_err() {
            return Err(ChatError::Parsing(url.err().unwrap()));
        }
        let url = url.unwrap();
        let connector = get_tls_configuration(&url);

        // Create the websocket (this performs the WS handshake but not the protocol handshake)
        let ws: ChatWebSocket = match connect_async_tls_with_config(url, None, connector).await {
            Ok(ws) => ws.0,
            Err(err) => return Err(ChatError::IO(err)),
        };

        let cancel_token = CancellationToken::new();
        let sent_msg_map: MessageMap = MessageMap::new(Mutex::new(HashMap::new()));
        let (tx, mut rx) = mpsc::channel::<CommunicationPackage>(10);
        
        // Create a thread to handle websocket functionality
        let map = sent_msg_map.clone();
        let halt_token = cancel_token.child_token();
        let window = config.get_window();
        let t_config = config.clone();
        let ws_thread: JoinHandle<()> = tokio::spawn(async move {
            let mut is_running: bool = true;
            let (mut sink, mut stream) = ws.split();
            while is_running {
                println!("WS Handle Loop start");
                tokio::select! {
                    response = stream.next() => {
                        let msg: Message = response.unwrap().unwrap(); // FIXME

                        match msg {
                            Message::Text(raw_json) => {
                                let envelope: Result<SignedEnvelope,_> = serde_json::from_str(raw_json.as_str());
                                if envelope.is_ok() {
                                    let envelope = envelope.unwrap();
                                    //TODO sig verification
                                    
                                    if envelope.is_server_response() {
                                        let resp: ServerMessage = envelope.into();
                                        println!("Handling response: {}", resp.response_to_type);
                                        let sender = map.lock().unwrap().remove(&resp.orig_sig);
                                        if sender.is_some() {
                                            let _ = sender.unwrap().send(resp);
                                        } else {
                                            println!("Unmapped response, {} pending: {}", map.lock().unwrap().len(), resp)
                                        }
                                    } else {
                                        let msg: UnmappedMessage = envelope.into();
                                        println!("Handling broadcast: {}", msg);

                                        // TODO: Message handling
                                        match msg.msg_type {
                                            MessageType::Disconnect => { /* TODO */ },
                                            MessageType::Hello | MessageType::Subscribe => {
                                                // TODO
                                            },
                                            MessageType::History => { /* We ignore history requests from other users */ },
                                            MessageType::Post => {
                                                let payload = serde_json::json!({
                                                    "nick": msg.nick,
                                                    "timestamp": utc_as_millis!(msg.time),
                                                    "content": msg.get_content_str("postContent".into())
                                                });
                                                let result = window.emit("post", payload.to_string());
                                                if result.is_err() {
                                                    tauri::api::dialog::message(Some(&window), "Error", format!("Failed to emit: {}", result.unwrap_err()).as_str())
                                                }
                                            },
                                        }
                                    }
                                } else {
                                    println!("Bad envelope")
                                }
                            },
                            Message::Close(_) => {
                                halt_token.cancel();
                                is_running = false;
                            }
                            Message::Binary(b) => {
                                println!("Binary received: len({})", b.len())
                            }
                            _ => {
                                println!("Unhandled type")
                            }, // TODO: Binary?
                        }
                    }
                    to_send = rx.recv() => {
                        if to_send.is_some() {
                            let pkg: CommunicationPackage = to_send.unwrap();
                            match sink.send(Message::text(pkg.envelope.to_string())).await {
                                Ok(_) => { map.lock().unwrap().insert(pkg.signature, pkg.sender); },
                                Err(_) => {},
                            }
                        } else {
                            halt_token.cancel();
                            is_running = false;
                        }
                    }
                    _ = halt_token.cancelled() => {
                        is_running = false;
                    }
                }
            }
            
            // Let's send a disconnect message to the server before closing the socket
            let disconnect = serde_json::json!({
                "type": "disconnect", 
                "nick": t_config.get_nick(),
                "time": utc_as_millis!(),
            });
            let (_, disconnect) = Connection::create_envelope(disconnect, &t_config);
            let _ = sink.send(Message::text(disconnect.to_string())).await;

            // Recombine and gracefully close the websocket (eat any error)
            let _ = sink.reunite(stream).unwrap().close(None).await;
            ()
        });

        let mut conn = Connection {
            configuration: config.clone(),
            cancel_token,
            send_channel: tx,
            sent_msg_map,
            ws_thread,
        };

        // Let's send a hello and subscribe and verify that we've connected
        conn.server_greet().await?;

        Ok(conn)
    }

    /// Destroys the underlying resources within a Connection safely.
    pub async fn close(conn: Connection) -> Result<(), ChatError> {
        // Shutdown the worker thread
        conn.signal_close();

        // Ensure worker thread is shutdown
        let join: Result<_, tokio::task::JoinError> = conn.ws_thread.await;
        if join.is_err() {
            return Err(ChatError::Other(join.err().unwrap().to_string()));
        }
        Ok(())
    }

    /// Retrieves the current number of sent messages pending a response.
    pub fn pending(&self) -> usize {
        self.sent_msg_map.lock().unwrap().len()
    }

    /// Non-block signal to the socket listening thread to halt operation.
    pub fn signal_close(&self) {
        self.cancel_token.cancel();
    }

    /// Retrieve a historical block of posts
    pub async fn history(&self, start: OffsetDateTime, end: Option<OffsetDateTime>) -> Result<ServerMessage, ChatError> {
        let mut history = serde_json::json!({
            "type": "history", 
            "nick": self.configuration.get_nick(),
            "time": utc_as_millis!(),
            "content": {
                "start": format!("{}", utc_as_millis!(start)),
            }
        });

        history["content"]["end"] = match end {
            Some(t) => serde_json::json!(utc_as_millis!(t)),
            None => serde_json::Value::Null,
        };

        self.send(history).await
    }

    /// Send a post to the server that blocks and waits for a response.
    pub async fn post(&self, content: String) -> Result<ServerMessage, ChatError> {
        let post = serde_json::json!({
            "type": "post",
            "nick": self.configuration.get_nick(),
            "time": utc_as_millis!(),
            "content": {
                "postContent": content,
            }
        });
        self.send(post).await
    }

    async fn send(&self, request: Value) -> Result<ServerMessage, ChatError> {
        let (signature, envelope) = Connection::create_envelope(request, &self.configuration);

        let (sender, rx) = oneshot::channel::<ServerMessage>();
        let _ = self.send_channel.send(CommunicationPackage{ envelope, signature, sender }).await;

        rx.await.map_err(ChatError::from)
    }

    /// Internal function for creating signed message envelopes
    fn create_envelope(request:Value, config: &Configuration) -> (String, Value) {
        let keypair = config.get_private_key();

        let mut signer = Signer::new(MessageDigest::sha512(), &keypair).unwrap();
        signer.update(request.to_string().as_bytes()).unwrap();

        let signature = Base64::STANDARD_NO_PAD.encode(signer.sign_to_vec().unwrap());
        return (signature.clone(), serde_json::json!({
            "message": request,
            "sig": signature,
            "keyHash": config.get_key_hex(),
            "protocolVersion": 1,
        }));
    }
    
    /// Internal function for sending a Hello and Subscribe to the server.
    async fn server_greet(&mut self) -> Result<(), ChatError>{
        let keypair = self.configuration.get_private_key();
        let pub_key = keypair.public_key_to_pem().unwrap();
        
        // Generate the 'hello' and 'subscribe' message
        let pub_key = String::from_utf8_lossy(&pub_key);
        let hello = serde_json::json!({
            "type": "hello",
            "nick": self.configuration.get_nick(),
            "time": utc_as_millis!(),
            "content": {
                "publicKey": pub_key,
            }
        });
        let subscribe = serde_json::json!({
            "type": "subscribe",
            "nick": self.configuration.get_nick(),
            "time": utc_as_millis!(),
            "content": {
                "publicKey": pub_key,
                "lastClientTime": 0,
            }
        });

        // Send each logon message sequentially
        let msgs = vec![hello, subscribe];
        for msg in msgs {
            println!("Sending logon {}", msg["message"]["type"]);
            let resp = self.send(msg).await;
            if resp.is_err() {
                return Err(resp.unwrap_err());
            }
            let resp = resp.unwrap();
            if resp.response == ServerAcceptCode::Reject {
                return Err(ChatError::Protocol(resp.reason.unwrap()));
            }
        }
        Ok(())
    }

    // pub async fn send_and_process<F>(&mut self, request: Value, response_handler: F)
    //     where F: FnOnce(ServerMessage) -> () 
    // {
    // }
}


struct CommunicationPackage {
    signature: String,
    envelope: Value,
    sender: oneshot::Sender<ServerMessage>,
}

fn get_tls_configuration(_: &Url) -> Option<Connector> {
    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build().unwrap();

    Some(Connector::NativeTls(connector))
}