fn main() {
    println!("cargo:rerun-if-env-changed=GITODILE_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=GITODILE_UPDATER_PUBLIC_KEY_ID");
    println!("cargo:rerun-if-env-changed=GITODILE_QUALIFIED_UPDATE_TARGETS");
    println!("cargo:rerun-if-env-changed=GITODILE_PREVIEW_TEST_UPDATE_TARGETS");
    tauri_build::build()
}
