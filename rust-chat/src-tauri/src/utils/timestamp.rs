//! Treat an [`time::OffsetDateTime`] as a [Unix timestamp with milliseconds] for the purposes of serde.
//!
//! Use this module in combination with serde's [`#[with]`][with] attribute.
//!
//! When deserializing, the offset is assumed to be UTC.
//!
//! [Unix timestamp]: https://en.wikipedia.org/wiki/Unix_time
//! [with]: https://serde.rs/field-attrs.html#with
use serde::{de::{self}, Deserialize, Deserializer, Serialize, Serializer};
use time::OffsetDateTime;

/// Serialize an `OffsetDateTime` as its Unix timestamp with millisecond precision
pub fn serialize<S: Serializer>(
    datetime: &OffsetDateTime,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let t = datetime.unix_timestamp() * 1000 + datetime.millisecond() as i64;
    t.serialize(serializer)
}

/// Deserialize an `OffsetDateTime` from its Unix timestamp
pub fn deserialize<'a, D: Deserializer<'a>>(deserializer: D) -> Result<OffsetDateTime, D::Error> {
    let timestamp_with_millis: Result<i64, <D as Deserializer>::Error> = <_>::deserialize(deserializer);
    match timestamp_with_millis {
        Ok(t) => {
            let millis = (t % 1000) as u16;
            OffsetDateTime::from_unix_timestamp(t / 1000)
                .and_then(|time| time.replace_millisecond(millis))
                .map_err(|err| de::Error::custom(err.to_string()))
        },
        Err(e) => Err(e),
    }
}

/// Treat an `Option<OffsetDateTime>` as a [Unix timestamp] for the purposes of
/// serde.
///
/// Use this module in combination with serde's [`#[with]`][with] attribute.
///
/// When deserializing, the offset is assumed to be UTC.
///
/// [Unix timestamp]: https://en.wikipedia.org/wiki/Unix_time
/// [with]: https://serde.rs/field-attrs.html#with
pub mod option {
    #[allow(clippy::wildcard_imports)]
    use super::*;

    fn millis_from_datetime(time: OffsetDateTime) -> i64 {
        time.unix_timestamp() * 1000 + time.millisecond() as i64
    }

    /// Serialize an `Option<OffsetDateTime>` as its Unix timestamp
    pub fn serialize<S: Serializer>(
        option: &Option<OffsetDateTime>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        option
            .map(millis_from_datetime)
            .serialize(serializer)
    }

    /// Deserialize an `Option<OffsetDateTime>` from its Unix timestamp
    pub fn deserialize<'a, D: Deserializer<'a>>(
        deserializer: D,
    ) -> Result<Option<OffsetDateTime>, D::Error> {
        Option::deserialize(deserializer)?
            .map(|ts: i64| OffsetDateTime::from_unix_timestamp_nanos(ts as i128 * 1_000_000))
            .transpose()
            .map_err(|err| de::Error::custom(err.to_string()))
    }
}



#[cfg(test)]
mod tests {
    use serde::{Deserialize, Serialize};
    use time::{OffsetDateTime, macros::datetime};

    use crate::utc_as_millis;

    #[derive(Debug, Deserialize, Serialize, PartialEq)]
    pub struct Duration {
        #[serde(with = "crate::utils::timestamp")]
        pub start: OffsetDateTime,
        #[serde(with = "crate::utils::timestamp::option")]
        pub end: Option<OffsetDateTime>,
    }

    fn duration_json(start: i128, end: Option<i128>) -> String {
        if end.is_none() {
            format!(r#"{{"start":{},"end":{}}}"#, start, "null")
        } else {
            format!(r#"{{"start":{},"end":{}}}"#, start, end.unwrap())
        }
    }

    #[test]
    fn timestamp_serialization() {
        let mut d = Duration { start: datetime!(2022-01-01 13:00:00 UTC), end: None};
        let millis = utc_as_millis!(d.start);

        let result = serde_json::to_string(&d).unwrap();
        let expected = duration_json(millis, None);
        assert_eq!(expected, result);

        d.end = Some(d.start);
        let expected = duration_json(millis, Some(millis));
        let result = serde_json::to_string(&d).unwrap();
        assert_eq!(expected, result);
    }

    #[test]
    fn timestamp_deserialization() {
        let now = OffsetDateTime::now_utc();
        let now = now.replace_millisecond(now.millisecond()).unwrap();
        let now_millis = utc_as_millis!(now);

        let expected = Duration { start: now, end: None};

        let json = duration_json(now_millis, None);
        let result: Duration = serde_json::from_str(json.as_str()).unwrap();
        assert_eq!(expected, result);

        let expected = Duration { start: now, end: Some(now)};
        let json = duration_json(now_millis, Some(now_millis));
        let result: Duration = serde_json::from_str(json.as_str()).unwrap();
        assert_eq!(expected, result);
    }
}