fn main() {
    println!("cargo:rerun-if-env-changed=GITODILE_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=GITODILE_UPDATER_PUBLIC_KEY_ID");
    println!("cargo:rerun-if-env-changed=GITODILE_QUALIFIED_UPDATE_TARGETS");
    println!("cargo:rerun-if-env-changed=GITODILE_UPDATE_PROFILE");
    println!("cargo:rerun-if-env-changed=GITODILE_VALIDATION_UPDATE_FEED");
    println!("cargo:rerun-if-env-changed=GITODILE_VALIDATION_UPDATE_TARGET");
    tauri_build::build()
}
