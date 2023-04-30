use std::collections::HashMap;
use std::fmt::{Debug, Display};
use serde::{Serialize, Deserialize};
use serde_json::value::Value;
use time::OffsetDateTime;

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MessageType {
    Hello, History, Post, Subscribe
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerReason {
    None, Format, Signature, Access, Exception
}

impl Display for ServerReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Server Reject")
            .field("Reason", &self)
            .finish()
    }
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ServerAcceptCode {
    Accept,
    Reject,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerMessage {
    pub response_to_type: MessageType,
    pub orig_sig: String,
    pub response: ServerAcceptCode,
    pub reason: Option<ServerReason>,
    #[serde(with = "crate::utils::timestamp")]
    pub time: OffsetDateTime,
    pub content: HashMap<String, Value>,
}

impl ServerMessage {
}

#[derive(Debug, Deserialize)]
pub struct UnmappedMessage {
    #[serde(rename="type")]
    pub msg_type: MessageType,
    pub nick: String,
    #[serde(with = "crate::utils::timestamp")]
    pub time: OffsetDateTime,
    pub content: HashMap<String, Value>,
}

impl UnmappedMessage {
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
            .field("nick", &self.nick)
            .field("time", &self.time)
            .field("content", &self.content)
            .finish()
    }
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
            // println!("{}", raw);
            // println!("Contains: {} | {}", result.content.contains_key("publicKey"), result);
            assert_eq!(test.0, result.msg_type);
            assert_eq!("test", result.nick);
            match result.msg_type {
                Hello => assert_eq!("abc123", result.content.get("publicKey").unwrap()),
                History => assert!(false),
                Post => assert_eq!("Hi!", result.get_content_str(String::from("postContent")).unwrap()),
                Subscribe => assert!(result.content.is_empty()),
            }
        }
    }
}