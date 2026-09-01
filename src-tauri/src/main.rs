// Hide the console window in release builds; keep it in debug builds so
// `cargo tauri dev` / `pnpm run tauri dev` still show Rust-side logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gitodile_lib::run();
}
