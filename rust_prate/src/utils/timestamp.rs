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
    // (datetime.unix_timestamp() * 1000 + datetime.millisecond() as i64).serialize(serializer)
    let t = datetime.unix_timestamp() * 1000 + datetime.millisecond() as i64;
    println!("Serialized: {}", t);
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
#[allow(dead_code)]
pub mod option {
    #[allow(clippy::wildcard_imports)]
    use super::*;

    /// Serialize an `Option<OffsetDateTime>` as its Unix timestamp
    pub fn serialize<S: Serializer>(
        option: &Option<OffsetDateTime>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        option
            .map(OffsetDateTime::unix_timestamp)
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