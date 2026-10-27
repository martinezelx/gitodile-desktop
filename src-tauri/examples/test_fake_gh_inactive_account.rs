//! A stand-in for the `gh` CLI, used only by `tests/credential_helper.rs`.
//! Cargo builds it next to the test binaries, so no test compiles a fake
//! executable while it runs. It
//! answers one exact token request for an inactive account.

fn main() {
    // `cargo test --all-targets` runs every example under its build name;
    // the test runs a copy named `gh`.
    let exe = std::env::current_exe().unwrap();
    if exe
        .file_stem()
        .unwrap()
        .to_string_lossy()
        .starts_with("test_fake_")
    {
        return;
    }
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    assert_eq!(
        args,
        [
            "auth",
            "token",
            "--hostname",
            "github.com",
            "--user",
            "InactiveUser"
        ]
    );
    assert!(std::env::var_os("GH_DEBUG").is_none());
    assert!(std::env::var_os("GH_TOKEN").is_none());
    println!("fixture_secret_for_inactive_account");
}
