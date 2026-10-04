// Hide the console window in release builds; keep it in debug builds so
// `cargo tauri dev` / `pnpm run tauri dev` still show Rust-side logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = gitodile_lib::hosting::credential_helper_entry() {
        std::process::exit(code);
    }
    gitodile_lib::run();
}
