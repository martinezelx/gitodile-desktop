//! Small shared encoding helpers for bounded IPC image payloads.

const BASE64_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64, written here rather than pulled in: it is twenty lines,
/// and task 018 traded `opt-level = "s"`, `lto` and `strip` for launch time
/// that a dependency would spend back.
pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() / 3 * 4 + 4);
    for chunk in bytes.chunks(3) {
        let first = u32::from(chunk[0]);
        let second = u32::from(*chunk.get(1).unwrap_or(&0));
        let third = u32::from(*chunk.get(2).unwrap_or(&0));
        let triple = (first << 16) | (second << 8) | third;
        encoded.push(BASE64_ALPHABET[((triple >> 18) & 63) as usize] as char);
        encoded.push(BASE64_ALPHABET[((triple >> 12) & 63) as usize] as char);
        encoded.push(if chunk.len() > 1 {
            BASE64_ALPHABET[((triple >> 6) & 63) as usize] as char
        } else {
            '='
        });
        encoded.push(if chunk.len() > 2 {
            BASE64_ALPHABET[(triple & 63) as usize] as char
        } else {
            '='
        });
    }
    encoded
}
