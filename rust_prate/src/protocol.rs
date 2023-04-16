//! Describes the protocol message definitions and handles `serde` definitions.
//! 
//! Because of the way Rust deals with types and lack of `null`, the approach
//! taken to deal with the internal `message` is to wrap it within an Map and
//! then convert those into objects after the fact.
//! 
//! Database objects and translation is located elsewhere.
#[allow(dead_code)]
use std::collections::HashMap;
use std::hash::Hash;
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
    protocol_version: u8,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Message {
    Hello(UnmappedMessage),
    Subscribe(UnmappedMessage),
    Post(UnmappedMessage),
    Response(ServerMessage),
}

impl Message {
    pub fn is_type(&self, msg_type: &MessageType) -> bool {
        match self {
            Message::Hello(_) => *msg_type == MessageType::Hello,
            Message::Subscribe(_) => *msg_type == MessageType::Subscribe,
            Message::Post(_) => *msg_type == MessageType::Post,
            _ => false,
        }
    }
}

#[derive(Serialize, Deserialize)]
struct NicknameDetails {
    nick: String,
    #[serde(with = "crate::utils::timestamp")]
    time: OffsetDateTime,
}

#[derive(Serialize, Deserialize)]
struct UnmappedMessage {
    #[serde(flatten)]
    details: NicknameDetails,
    #[serde(flatten)]
    content: HashMap<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
enum MessageType {
    Hello, History, Post, Subscribe
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ServerReason {
    None, Format, Signature, Access, Exception
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ServerAcceptCode {
    Accept,
    Reject,
}

#[derive(Serialize, Deserialize)]
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
            return format!(r#"{{"nick":"test","time":{},"type":{},"content":{}}}"#, NOW.unix_timestamp(), msg_type, content);
        }
        return format!(r#"{{"nick":"test","time":{},"type":"{}","content":{}}}"#, NOW.unix_timestamp(), msg_type, content);
    }

    #[test]
    fn message_invalid_deserialization() {
        type SerdeResult = Result<Message, Error>;

        let empty: SerdeResult = serde_json::from_str("{}");
        assert!(empty.is_err(), "Empty message should fail parsing");

        let raw: String = format!(r#"{{"nick":"test","time":{},"content":{{"pubKey":"abc123"}}}}"#, utc_as_millis!(NOW));
        let missing_type: SerdeResult = serde_json::from_str(raw.as_str());
        assert!(missing_type.is_err(), "Missing type should fail parsing");
    }

    #[test]
    fn message_valid_deserialization() {
        use MessageType::*;
        let type_to_content: [(MessageType, &str); 3] = [(Hello, r#"{"pubKey":"abc123"}"#), (Subscribe, "{}"), (Post, r#"{"postContent":"Hi!"}"#)];

        for test in type_to_content {
            let raw = build_test_message(serde_json::to_string(&test.0).unwrap().as_str(), test.1);
            let result: Message = serde_json::from_str(raw.as_str()).unwrap();
            assert!(result.is_type(&test.0));
            match result {
                Message::Hello(h) => assert_eq!(MessageType::Hello, test.0),
                Message::Subscribe(_) => assert_eq!(MessageType::Subscribe, test.0),
                Message::Post(_) => assert_eq!(MessageType::Post, test.0),
                Message::Response(v) => assert_eq!(v.response_to_type, test.0),
            }
        }
    }

    #[test]
    fn custom_timestamp_serialization() {
        let hello_msg = Message::Hello( UnmappedMessage {
            details: NicknameDetails {
                nick: String::from("test"),
                time: NOW.clone(),
            }, 
            content: HashMap::new(),
        });

        let raw = serde_json::to_string(&hello_msg).unwrap();
        assert!(raw.contains(format!(r#""time":{}{}"#, NOW.unix_timestamp(), NOW.millisecond()).as_str()), "Serialization failed: {}", raw);

        let result: Message = serde_json::from_str(raw.as_str()).unwrap();
        match result {
            Message::Hello(h) => {
                let expected = NOW.clone().replace_millisecond(NOW.millisecond()).unwrap();
                assert_eq!(expected, h.details.time);
            },
            _ => assert!(false, "Invalid message type"),
        }
    }
}