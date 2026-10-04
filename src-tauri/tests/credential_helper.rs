//! Real Git's helper protocol against the actual desktop binary, with a fake
//! gh executable. No real account, network, keychain or configuration is used.
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[test]
fn desktop_helper_works_with_real_git_and_an_exact_inactive_account() {
    let root =
        std::env::temp_dir().join(format!("gitodile helper 'quoted' {}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let source = root.join("gh.rs");
    fs::write(
        &source,
        r#"
fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    assert_eq!(args, ["auth", "token", "--hostname", "github.com", "--user", "InactiveUser"]);
    assert!(std::env::var_os("GH_DEBUG").is_none());
    assert!(std::env::var_os("GH_TOKEN").is_none());
    println!("fixture_secret_for_inactive_account");
}
"#,
    )
    .unwrap();
    let fake = root.join(if cfg!(windows) { "gh.exe" } else { "gh" });
    assert!(Command::new("rustc")
        .arg(&source)
        .arg("-o")
        .arg(&fake)
        .status()
        .unwrap()
        .success());
    let executable = root.join(if cfg!(windows) {
        "GitOdile.exe"
    } else {
        "GitOdile"
    });
    fs::copy(env!("CARGO_BIN_EXE_gitodile"), &executable).unwrap();
    let path = std::env::join_paths(
        std::iter::once(root.clone())
            .chain(std::env::split_paths(&std::env::var_os("PATH").unwrap())),
    )
    .unwrap();
    let helper = format!(
        "!{} --gitodile-credential-helper github:InactiveUser",
        quote(&executable.to_string_lossy().replace('\\', "/"))
    );
    let mut child = Command::new("git")
        .args([
            "-c",
            "credential.https://github.com/team.helper=!printf 'username=other-user\\npassword=other_user_secret\\n\\n'",
            "-c",
            "credential.https://github.com.helper=",
            "-c",
            &format!("credential.https://github.com.helper={helper}"),
            "-c", "credential.https://github.com.username=InactiveUser",
            "credential",
            "fill",
        ])
        .env("PATH", &path)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", root.join("empty.gitconfig"))
        .env("GH_TOKEN", "must_not_override_selected_account")
        .env("GH_DEBUG", "api")
        .env("GIT_TERMINAL_PROMPT", "0")
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"protocol=https\nhost=github.com\npath=team/repo.git\n\n")
        .unwrap();
    let result = child.wait_with_output().unwrap();
    assert!(
        result.status.success(),
        "Git helper failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(result
        .stdout
        .windows(b"password=fixture_secret_for_inactive_account".len())
        .any(|w| w == b"password=fixture_secret_for_inactive_account"));
    assert!(!root.join("empty.gitconfig").exists());
    // HTTP authentication (unlike a basic `credential fill`) supplies multiple
    // capabilities. Exercise the actual desktop parser with that wire request.
    let mut challenged = Command::new(&executable)
        .args(["--gitodile-credential-helper", "github:InactiveUser", "get"])
        .env("PATH", &path)
        .env("GH_TOKEN", "must_not_override_selected_account")
        .env("GH_DEBUG", "api")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    challenged.stdin.take().unwrap().write_all(
        b"capability[]=authtype\ncapability[]=state\nprotocol=https\nhost=github.com\nusername=InactiveUser\nwwwauth[]=Basic realm=GitHub\n\n",
    ).unwrap();
    let challenged = challenged.wait_with_output().unwrap();
    assert!(challenged.status.success());
    assert_eq!(
        challenged.stdout,
        b"username=InactiveUser\npassword=fixture_secret_for_inactive_account\n\n"
    );
    let fallback = "!printf 'username=other-user\\npassword=other_user_secret\\n\\n'";
    for (denied_helper, input) in [
        (
            helper.clone(),
            "protocol=https\nhost=github.com.evil.test\nusername=InactiveUser\n\n",
        ),
        (
            helper.replace("github:InactiveUser", "github:MissingUser"),
            "protocol=https\nhost=github.com\nusername=MissingUser\n\n",
        ),
    ] {
        let mut denied = Command::new("git")
            .args([
                "-c",
                "credential.helper=",
                "-c",
                &format!("credential.helper={denied_helper}"),
                "-c",
                &format!("credential.helper={fallback}"),
                "credential",
                "fill",
            ])
            .env("PATH", &path)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", root.join("empty.gitconfig"))
            .env("GIT_TERMINAL_PROMPT", "0")
            .current_dir(&root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        denied
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        let denied = denied.wait_with_output().unwrap();
        assert!(!denied.status.success());
        assert!(denied.stdout.is_empty());
        assert!(!String::from_utf8_lossy(&denied.stderr).contains("other_user_secret"));
    }
    fs::remove_dir_all(root).unwrap();
}
