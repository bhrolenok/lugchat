use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::{Arc, Mutex};

use futures_util::{Sink, StreamExt, pin_mut};
use futures_util::stream::{SplitSink, SplitStream, TryStreamExt};
use serde_json::Value;
use tokio::net::TcpStream;
use tokio::sync::{mpsc::{Receiver, Sender, self}, oneshot};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::{Error as TungsteniteError, Message};
use tokio_tungstenite::{WebSocketStream, MaybeTlsStream, connect_async_tls_with_config, Connector};
use tokio_util::sync::CancellationToken;

use crate::ChatError;
use crate::protocol::SignedEnvelope;

type ChatWebSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = SplitSink<ChatWebSocket, Message>;
type WsStream = SplitStream<ChatWebSocket>;

type MessageMap = Arc<Mutex<HashMap<String,String>>>;

/// A wrapper around the websocket connection to a chat server.
///
/// 
#[derive(Debug)]
pub struct Connection {
    sent_msg_map: MessageMap,

    // Websocket thread handles and controllers
    // ws_read: SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>,
    // ws_send: SplitSink<ChatWebSocket, Message>,
    in_thread: JoinHandle<WsStream>,
    out_thread: JoinHandle<WsSink>,
    cancel_token: CancellationToken,

    // channel_tx: Option<Sender<Value>>,
    // channel_mx: Receiver<Value>,
}

impl Connection {
    /// Creates a new Connection to the associated URL.
    pub async fn connect(url: url::Url) -> Result<Connection, ChatError> {
        // Create the websocket (this performs the WS handshake but not the protocol handshake)
        let ws: ChatWebSocket = match connect_async_tls_with_config(url, None, get_tls_configuration()).await {
            Ok(ws) => ws.0,
            Err(err) => return Err(ChatError::IO(err)),
        };
        let (send, read) = ws.split();

        let sent_msg_map: MessageMap = MessageMap::new(Mutex::new(HashMap::new()));
        let cancel_token = CancellationToken::new();


        let map = sent_msg_map.clone();
        let halt_token = cancel_token.child_token();
        let in_thread = tokio::spawn(async move {
            while !halt_token.is_cancelled() {
                let msg = match read.try_next().await {
                    Ok(opt) =>  {
                        match opt {
                            Some(msg) => msg,
                            None => return read,
                        }
                    },
                    Err(e) => {
                        continue;
                    },
                };
        
                // TODO - handle server message
                match msg {
                    Message::Text(raw_json) => {
                        let result: Result<SignedEnvelope, serde_json::Error> = serde_json::from_str(raw_json.as_str());
        
                        if result.is_ok() {
                            let envelope = result.unwrap();
                            //TODO signature validation
                        }
        
                        match map.lock().unwrap().get("") {
                            Some(_) => todo!(),
                            None => todo!(),
                        };
                    },
                    Message::Close(_) => break,
                    _ => continue,
                }
            }
            return read;
        });

        // Create a thread for handling the send of messages.
        let (tx, rx) = mpsc::channel::<Value>(10);
        let child_token = cancel_token.child_token();
        let out_thread = tokio::spawn(async move {
            // Use closed channel to signify
            while let Some(next) = rx.recv().await {
                send.start_send(Message::text(next.to_string()));
            }

            // Send back the Sink to be reunited and closed correctly
            send
        });
        
        pin_mut!(out_thread, in_thread);
        let conn = Connection {
            in_thread,
            out_thread,
            cancel_token,
            // ws_send: send,
            // channel_tx: Some(tx),
            // channel_mx: rx,
            sent_msg_map,
        };

        Ok(conn)
    }

    /// Destroys the underlying resources within a Connection safely.
    pub async fn close(conn: Connection) -> Result<(), TungsteniteError> {
        conn.cancel_token.cancel();
        let (send, read): (Result<WsSink, _>, Result<WsStream, _>) = futures_util::join!(conn.out_thread, conn.in_thread);
        let ws = send.unwrap().reunite(read.unwrap());
        if ws.is_ok() {
            ws.unwrap().close(None).await?
        }
        Ok(())
    }

    pub fn send(request: Value) {
        todo!()
    }

    fn create_signed_message() -> (String, ) {
        todo!()
    }
}

fn get_tls_configuration() -> Option<Connector> {
    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build().unwrap();

    Some(Connector::NativeTls(connector))
}