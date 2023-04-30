use std::error::Error;
use tokio::sync::oneshot;
use tokio_tungstenite::tungstenite::Error as TungsteniteError;
use url::ParseError;

use crate::protocol::message::ServerReason;

#[derive(Debug)]
pub enum ChatError {
    Communication(String),
    IO(TungsteniteError),
    Other(String),
    Parsing(ParseError),
    Protocol(ServerReason),
}

impl Error for ChatError {}

impl std::fmt::Display for ChatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatError::Communication(s) => write!(f, "Internal communication issue: {}", s),
            ChatError::IO(io) => io.fmt(f),
            ChatError::Other(s) => f.write_str(s.as_str()),
            ChatError::Parsing(p) => p.fmt(f),
            ChatError::Protocol(sr) => write!(f, "{}", sr),
        }
    }
}

impl From<ParseError> for ChatError {
    fn from(error: ParseError) -> Self {
        ChatError::Parsing(error)
    }
}

impl From<ServerReason> for ChatError {
    fn from(reason: ServerReason) -> Self {
        ChatError::Protocol(reason)
    }
}

impl From<String> for ChatError {
    fn from(message: String) -> Self {
        ChatError::Other(message)
    }
}

impl From<&str> for ChatError {
    fn from(message: &str) -> Self {
        ChatError::Other(String::from(message))
    }
}

impl From<TungsteniteError> for ChatError {
    fn from(error: TungsteniteError) -> Self {
        ChatError::IO(error)
    }
}

impl From<oneshot::error::RecvError> for ChatError {
    fn from(error: oneshot::error::RecvError) -> Self {
        ChatError::Communication(error.to_string())
    }
}