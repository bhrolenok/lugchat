//! Describes the protocol message definitions and handles `serde` definitions.
//! 
//! Because of the way Rust deals with types and lack of `null`, the approach
//! taken to deal with the internal `message` is to wrap it within an Map and
//! then convert those into objects after the fact.
//! 
//! Database objects and translation is located elsewhere.
#[allow(dead_code)]

use std::collections::HashMap;
use std::fmt::{Debug, Display};
use serde::{Serialize, Deserialize};
use serde_json::value::{RawValue, Value};
use time::OffsetDateTime;

type Base64 = String;

/// Message envelope of an incoming signed message.  Raw message is maintained
/// to allow for the validation of the signature against the message.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedEnvelope<'a> {
    #[serde(borrow)]
    message: &'a RawValue,
    sig: Base64,
    key_hash: String,
    pub protocol_version: u8,
}

impl SignedEnvelope<'_> {
    pub fn is_server_response(&self) -> bool {
        let raw = self.message.get();
        raw.contains(r#""type":"response""#)
    }

    pub fn to_message(&self) -> UnmappedMessage {
        let msg: UnmappedMessage = serde_json::from_str(self.message.get()).unwrap();
        msg
    }
    pub fn to_server_message(&self) -> ServerMessage {
        todo!()
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NicknameDetails {
    pub nick: String,
    #[serde(with = "crate::utils::timestamp")]
    pub time: OffsetDateTime,
}

#[derive(Deserialize, Serialize)]
pub struct UnmappedMessage {
    #[serde(rename="type")]
    pub msg_type: MessageType,
    #[serde(flatten)]
    pub details: NicknameDetails,
    pub content: HashMap<String, Value>,
}

impl UnmappedMessage {
    pub fn new(msg_type: MessageType, nick: String) -> UnmappedMessage {
        UnmappedMessage { 
            msg_type,
            details: NicknameDetails { 
                nick, 
                time: OffsetDateTime::now_utc()
            },
            content: HashMap::new(),
        }
    }

    pub fn get_content_str(&self, field: String) -> Option<&str> {
        match self.content.get(&field) {
            Some(value) => value.as_str(),
            None => None,
        }
    }
}

impl Display for UnmappedMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("UnmappedMessage")
            .field("msg_type", &self.msg_type)
            .field("details", &self.details)
            .field("content", &self.content)
            .finish()
    }
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MessageType {
    Hello, History, Post, Subscribe
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum ServerReason {
    None, Format, Signature, Access, Exception
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum ServerAcceptCode {
    Accept,
    Reject,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerMessage {
    response_to_type: MessageType,
    orig_sig: Base64,
    response: ServerAcceptCode,
    reason: ServerReason,
    #[serde(with = "crate::utils::timestamp")]
    time: OffsetDateTime,
    content: HashMap<String, Value>,
}


#[cfg(test)]
mod tests {
    use super::*;
    use ctor::ctor;
    use serde_json::Error;
    use crate::utc_as_millis;

    #[ctor]
    static NOW: OffsetDateTime = {
        OffsetDateTime::now_utc()
    };

    fn build_test_message<'a>(msg_type: &'a str, content: &'a str) -> String {
        if msg_type.starts_with('"') && msg_type.ends_with('"') {
            return format!(r#"{{"nick":"test","time":{},"type":{},"content":{}}}"#, utc_as_millis!(NOW), msg_type, content);
        }
        return format!(r#"{{"nick":"test","time":{},"type":"{}","content":{}}}"#, utc_as_millis!(NOW), msg_type, content);
    }

    #[test]
    fn message_invalid_deserialization() {
        type SerdeResult = Result<UnmappedMessage, Error>;

        let empty: SerdeResult = serde_json::from_str("{}");
        assert!(empty.is_err(), "Empty message should fail parsing");

        let raw: String = format!(r#"{{"nick":"test","time":{},"content":{{"publicKey":"abc123"}}}}"#, utc_as_millis!(NOW));
        let missing_type: SerdeResult = serde_json::from_str(raw.as_str());
        assert!(missing_type.is_err(), "Missing type should fail parsing");
    }

    #[test]
    fn message_valid_deserialization() {
        use MessageType::*;
        let type_to_content: [(MessageType, &str); 3] = [(Hello, r#"{"publicKey":"abc123"}"#), (Subscribe, "{}"), (Post, r#"{"postContent":"Hi!"}"#)];

        for test in type_to_content {
            let raw = build_test_message(serde_json::to_string(&test.0).unwrap().as_str(), test.1);
            let result: UnmappedMessage = serde_json::from_str(raw.as_str()).unwrap();
            println!("{}", raw);
            println!("Contains: {} | {}", result.content.contains_key("publicKey"), result);
            assert!(result.msg_type == test.0);
            assert_eq!("test", result.details.nick);
            match result.msg_type {
                Hello => assert_eq!("abc123", result.content.get("publicKey").unwrap()),
                History => assert!(false),
                Post => assert_eq!("Hi!", result.get_content_str(String::from("postContent")).unwrap()),
                Subscribe => assert!(result.content.is_empty()),
            }
        }
    }

    #[test]
    fn custom_timestamp_serialization() {
        let hello_msg = UnmappedMessage {
            details: NicknameDetails {
                nick: String::from("test"),
                time: NOW.clone(),
            }, 
            content: HashMap::new(),
            msg_type: MessageType::Hello,
        };

        let raw = serde_json::to_string(&hello_msg).unwrap();
        assert!(raw.contains(format!(r#""time":{}{}"#, NOW.unix_timestamp(), NOW.millisecond()).as_str()), "Serialization failed: {}", raw);

        let result: UnmappedMessage = serde_json::from_str(raw.as_str()).unwrap();
        assert!(result.content.is_empty());
        assert_eq!(MessageType::Hello, result.msg_type);
        assert_eq!("test", result.details.nick);
        let expected = NOW.clone().replace_millisecond(NOW.millisecond()).unwrap();
        assert_eq!(expected, result.details.time);
    }
}