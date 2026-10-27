//! A stand-in for the `gh` CLI, used only by `github_auth`'s tests.
//! Cargo builds it next to the test binaries, so no test compiles a fake
//! executable while it runs. The
//! copy's file name picks the scenario.

use std::{
    env,
    io::{self, Write},
    thread,
    time::Duration,
};
fn main() {
    let exe = env::current_exe().unwrap();
    let scenario = exe.file_stem().unwrap().to_string_lossy();
    // `cargo test --all-targets` runs every example under its build name;
    // a test always runs a copy named after its scenario.
    if scenario.starts_with("test_fake_") {
        return;
    }
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|s| s == "--help") {
        println!(
            "{}",
            if scenario == "old" {
                "--active"
            } else {
                "--active --json hosts"
            }
        );
        return;
    }
    if scenario == "long" {
        thread::sleep(Duration::from_secs(30));
        return;
    }
    if args.get(1).map(String::as_str) == Some("token") {
        assert_eq!(
            args,
            [
                "auth",
                "token",
                "--hostname",
                "github.com",
                "--user",
                "FixtureUser"
            ]
        );
        assert!(env::var_os("GH_DEBUG").is_none());
        assert!(env::var_os("GH_TOKEN").is_none());
        if scenario == "token-denied" {
            eprintln!("private_secret_error");
            std::process::exit(1);
        }
        println!("fixture_secret_exact_account");
        return;
    }
    if args.first().map(String::as_str) == Some("api") {
        assert_eq!(
            &args[..5],
            ["api", "--hostname", "github.com", "--method", "GET"]
        );
        assert!(args[5].starts_with("users/"));
        assert_eq!(&args[6..], ["--jq", "{id: .id, login: .login}"]);
        // No avatar fetch during fixture runs; never contact the real CDN.
        println!("{{}}");
        return;
    }
    if args.get(1).map(String::as_str) == Some("logout") {
        assert_eq!(
            args,
            [
                "auth",
                "logout",
                "--hostname",
                "github.com",
                "--user",
                "fixture-user"
            ]
        );
        if scenario == "logout-denied" {
            std::process::exit(1);
        }
        std::fs::write(exe.with_extension("removed"), b"removed").unwrap();
        return;
    }
    if args.get(1).map(String::as_str) == Some("switch") {
        assert_eq!(
            args,
            [
                "auth",
                "switch",
                "--hostname",
                "github.com",
                "--user",
                "another-user"
            ]
        );
        if scenario == "switch-denied" {
            std::process::exit(1);
        }
        std::fs::write(exe.with_extension("switched"), b"switched").unwrap();
        return;
    }
    if args.get(1).map(String::as_str) == Some("login") {
        assert_eq!(
            args,
            [
                "auth",
                "login",
                "--web",
                "--hostname",
                "github.com",
                "--skip-ssh-key",
                "--clipboard=false"
            ]
        );
        eprintln!("{}", "x".repeat(100000));
        eprint!("! First copy your one-");
        io::stderr().flush().unwrap();
        thread::sleep(Duration::from_millis(30));
        eprintln!("time code: ABCD-1234");
        eprintln!("Open this URL to continue in your web browser: https://github.com/login/device");
        io::stderr().flush().unwrap();
        if scenario == "denied" {
            std::process::exit(1);
        }
        return;
    }
    assert_eq!(
        args,
        [
            "auth",
            "status",
            "--hostname",
            "github.com",
            "--json",
            "hosts"
        ]
    );
    if scenario == "logout-empty" {
        println!("{{\"hosts\":{{}}}}");
        return;
    }
    if scenario == "logout-offline" || scenario == "switch-offline" {
        std::process::exit(1);
    }
    if scenario == "logout-switch" {
        println!("{{\"hosts\":{{\"github.com\":[{{\"state\":\"success\",\"active\":true,\"login\":\"another-user\",\"tokenSource\":\"keyring\"}}]}}}}");
        return;
    }
    if scenario == "switch-accounts" {
        println!("{{\"hosts\":{{\"github.com\":[{{\"state\":\"success\",\"active\":true,\"login\":\"another-user\",\"tokenSource\":\"keyring\"}},{{\"state\":\"success\",\"active\":false,\"login\":\"fixture-user\",\"tokenSource\":\"keyring\"}}]}}}}");
        return;
    }
    if scenario == "bad" {
        println!("not-json");
    } else if scenario == "overflow" {
        print!("{}", "x".repeat(100000));
    } else {
        println!("{{\"hosts\":{{\"github.com\":[{{\"state\":\"success\",\"active\":true,\"login\":\"fixture-user\",\"tokenSource\":\"keyring\",\"token\":\"gho_do-not-expose\"}}]}}}}");
    }
}
