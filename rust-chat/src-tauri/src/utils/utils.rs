/// Macro definition for generating an unsigned integer representing the current milliseconds since epoch.
/// 
/// Examples:
/// ```rust
/// utc_as_millis!() // current timestamp
/// utc_as_millis!(datetime!(1970-01-01 1:00 UTC)) // 3_600_000
/// ```
#[macro_export]
macro_rules! utc_as_millis {
    () => { OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000 };
    ($time:expr) => { $time.unix_timestamp_nanos() / 1_000_000 };
}

#[cfg(test)]
mod tests {
    use time::{macros::datetime, OffsetDateTime};

    #[test]
    fn validate_millisecond_conversion() {
        assert_eq!(utc_as_millis!(datetime!(1970-01-01 0:00 UTC)), 0);
        assert_eq!(utc_as_millis!(datetime!(1970-01-01 0:00 -1)), 3_600_000);

        let now = OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000;
        let millis = utc_as_millis!();
        assert!(now == millis);
    }
}