use std::fmt::{Debug, Display, Formatter, Result};
use serde::Deserialize;
use serde_json::value::RawValue;

use super::message::{ServerMessage, UnmappedMessage};

type Base64 = String;

/// Message envelope of an incoming signed message.  Raw message is maintained
/// to allow for the validation of the signature against the message.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedEnvelope<'a> {
    #[serde(borrow)]
    message: &'a RawValue,
    pub sig: Base64,
    pub key_hash: String,
    pub protocol_version: u8,
}

impl SignedEnvelope<'_> {
    pub fn is_server_response(&self) -> bool {
        let raw = self.message.get();
        raw.contains(r#""type":"response""#)
    }

    pub fn is_client_message(&self) -> bool {
        !self.is_server_response()
    }
}

impl Display for SignedEnvelope<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "Envelope(v{}) {}", self.protocol_version, self.message)
    }
}

impl From<SignedEnvelope<'_>> for ServerMessage {
    fn from(value: SignedEnvelope) -> Self {
        serde_json::from_str::<ServerMessage>(value.message.get()).unwrap()

    }
}

impl From<SignedEnvelope<'_>> for UnmappedMessage {
    fn from(value: SignedEnvelope<'_>) -> Self {
        serde_json::from_str::<UnmappedMessage>(value.message.get()).unwrap()
    }
}