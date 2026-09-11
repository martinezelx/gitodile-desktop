use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use std::{env, fs, process};

fn decode_tauri_text(value: &str, label: &str) -> Result<String, String> {
    let decoded = STANDARD
        .decode(value.trim())
        .map_err(|_| format!("{label} is not valid base64"))?;
    String::from_utf8(decoded).map_err(|_| format!("{label} is not UTF-8"))
}

fn run() -> Result<(), String> {
    let mut arguments = env::args_os().skip(1);
    let payload_path = arguments.next().ok_or("missing payload path")?;
    let signature_path = arguments.next().ok_or("missing signature path")?;
    let public_key_path = arguments.next().ok_or("missing public key path")?;
    if arguments.next().is_some() {
        return Err("unexpected argument".into());
    }

    let payload = fs::read(payload_path).map_err(|_| "could not read payload")?;
    let signature_encoded =
        fs::read_to_string(signature_path).map_err(|_| "could not read updater signature")?;
    let public_encoded =
        fs::read_to_string(public_key_path).map_err(|_| "could not read updater public key")?;
    let signature_text = decode_tauri_text(&signature_encoded, "signature")?;
    let public_text = decode_tauri_text(&public_encoded, "public key")?;
    let signature = Signature::decode(&signature_text).map_err(|_| "invalid signature encoding")?;
    let public = PublicKey::decode(&public_text).map_err(|_| "invalid public key encoding")?;
    public
        .verify(&payload, &signature, true)
        .map_err(|_| String::from("updater signature verification failed"))?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
    println!("Updater signature verification passed.");
}
