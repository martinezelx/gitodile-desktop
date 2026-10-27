//! A stand-in for the `glab` CLI, used only by `gitlab_auth`'s tests.
//! Cargo builds it next to the test binaries, so no test compiles a fake
//! executable while it runs. The
//! copy's file name picks the scenario.

use std::{env, fs, thread, time::Duration};
fn main() {
    let exe = env::current_exe().unwrap();
    let scenario = exe.file_stem().unwrap().to_string_lossy();
    // `cargo test --all-targets` runs every example under its build name;
    // a test always runs a copy named after its scenario.
    if scenario.starts_with("test_fake_") {
        return;
    }
    let args: Vec<_> = env::args().skip(1).collect();
    assert!(env::var_os("GITLAB_TOKEN").is_none());
    assert!(env::var_os("GITLAB_ACCESS_TOKEN").is_none());
    assert!(env::var_os("OAUTH_TOKEN").is_none());
    assert_eq!(env::var("GITLAB_API_HOST").unwrap(), "gitlab.com");
    assert_eq!(env::var("GLAB_API_PROTOCOL").unwrap(), "https");
    if args == ["--version"] {
        println!("glab 1.120.0 (fixture)");
        return;
    }
    if scenario == "slow" {
        thread::sleep(Duration::from_secs(30));
        return;
    }
    if args.get(1).map(String::as_str) == Some("login") {
        assert_eq!(
            args,
            [
                "auth",
                "login",
                "--hostname",
                "gitlab.com",
                "--web",
                "--api-host",
                "gitlab.com",
                "--api-protocol",
                "https",
                "--git-protocol",
                "https",
                "--ssh-hostname",
                "gitlab.com",
                "--container-registry-domains",
                "registry.gitlab.com",
                "--use-keyring"
            ]
        );
        fs::write(exe.with_extension("saved"), "saved").unwrap();
        return;
    }
    if args.get(1).map(String::as_str) == Some("logout") {
        assert_eq!(args, ["auth", "logout", "--hostname", "gitlab.com"]);
        fs::write(exe.with_extension("removed"), "removed").unwrap();
        return;
    }
    assert_eq!(
        args,
        [
            "auth",
            "credential-helper",
            "--repo",
            "https://gitlab.com/gitodile/credential-boundary"
        ]
    );
    if scenario == "browser" && !exe.with_extension("saved").exists() {
        println!(
            r#"{{"type":"error","message":"glab is not authenticated. Use glab auth login to authenticate"}}"#
        );
    } else {
        println!(
            r#"{{"type":"success","instance_url":"https://gitlab.com","token":{{"type":"oauth2","token":"fixture-oauth-only-123456"}}}}"#
        );
    }
}
