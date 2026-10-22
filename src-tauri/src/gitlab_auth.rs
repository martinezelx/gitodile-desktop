//! One explicitly verified GitLab.com CLI identity. glab owns its OAuth session.
//! Credentials are captured privately, then checked against the fixed native API.
use crate::{
    application,
    cli_auth::{self, AuthState},
    credentials::{AccessProvider, Account, Secret},
    git::CancellationToken,
    hosting_access, tooling,
};
use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};
use zeroize::Zeroize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitLabAuthSnapshot {
    pub(crate) state: AuthState,
    pub(crate) account: Option<Account>,
    pub(crate) operation_id: Option<String>,
    pub(crate) needs_check: bool,
}
impl Default for GitLabAuthSnapshot {
    fn default() -> Self {
        Self {
            state: AuthState::Unchecked,
            account: None,
            operation_id: None,
            needs_check: false,
        }
    }
}
#[derive(Default)]
struct Inner {
    snapshot: GitLabAuthSnapshot,
    sequence: u64,
    cancellation: Option<CancellationToken>,
}
/// One glab-backed host: gitlab.com, or a GitLab Self-Managed server the user
/// added. glab receives this exact host on every command.
#[derive(Clone)]
pub(crate) struct GitLabAuthService {
    inner: Arc<Mutex<Inner>>,
    target: Target,
}
#[derive(Clone)]
struct Target {
    id: Arc<str>,
    host: Arc<str>,
}
impl Target {
    fn is_public(&self) -> bool {
        &*self.host == "gitlab.com"
    }
}
impl Default for GitLabAuthService {
    fn default() -> Self {
        Self::for_host("gitlab", "gitlab.com")
    }
}
enum Action {
    Check,
    Login,
    Logout(String),
}
impl GitLabAuthService {
    pub(crate) fn for_host(id: &str, host: &str) -> Self {
        Self {
            inner: Arc::default(),
            target: Target {
                id: id.into(),
                host: host.into(),
            },
        }
    }
    pub(crate) fn snapshot(&self) -> GitLabAuthSnapshot {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .snapshot
            .clone()
    }
    pub(crate) fn check_state(&self) -> GitLabAuthSnapshot {
        self.start(Action::Check)
    }
    pub(crate) fn login(&self) -> GitLabAuthSnapshot {
        self.start(Action::Login)
    }
    pub(crate) fn logout(&self, account_id: String) -> GitLabAuthSnapshot {
        self.start(Action::Logout(account_id))
    }
    pub(crate) fn cancel(&self, id: &str) -> GitLabAuthSnapshot {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.snapshot.operation_id.as_deref() == Some(id) {
            if let Some(token) = &inner.cancellation {
                token.cancel();
            }
            inner.snapshot.state = AuthState::Cancelling;
            inner.snapshot.needs_check = true;
        }
        inner.snapshot.clone()
    }
    fn start(&self, action: Action) -> GitLabAuthSnapshot {
        let command = match action {
            Action::Check => "check_gitlab_auth",
            Action::Login => "start_gitlab_login",
            Action::Logout(_) => "logout_gitlab_account",
        };
        let _command = application::enter(command);
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.snapshot.operation_id.is_some() {
            return inner.snapshot.clone();
        }
        if environment_credential() {
            inner.snapshot.state = AuthState::EnvironmentControlled;
            inner.snapshot.needs_check = true;
            return inner.snapshot.clone();
        }
        if let Action::Logout(id) = &action {
            if inner.snapshot.needs_check
                || !inner
                    .snapshot
                    .account
                    .as_ref()
                    .is_some_and(|a| a.id == *id && a.available)
            {
                inner.snapshot.state = AuthState::Failed;
                inner.snapshot.needs_check = true;
                return inner.snapshot.clone();
            }
        }
        // A known session must be signed out explicitly before another person
        // connects. An unknown one is found by the worker, which captures the
        // host's session before logging in and never overwrites it.
        if matches!(action, Action::Login) && inner.snapshot.account.is_some() {
            // The known session stays exactly as it was; nothing needs checking.
            return inner.snapshot.clone();
        }
        inner.sequence += 1;
        let id = format!("gitlab-auth-{}", inner.sequence);
        let cancellation = CancellationToken::default();
        let activity =
            application::begin_background_activity_with_cancellation(command, cancellation.clone());
        inner.snapshot.operation_id = Some(id.clone());
        inner.snapshot.state = match action {
            Action::Check => AuthState::Checking,
            Action::Login => AuthState::AwaitingBrowser,
            Action::Logout(_) => AuthState::SigningOut,
        };
        inner.cancellation = Some(cancellation.clone());
        let snapshot = inner.snapshot.clone();
        let service = self.clone();
        if std::thread::Builder::new()
            .name("gitlab-auth".into())
            .spawn(move || {
                let _activity = activity;
                let mutates = !matches!(action, Action::Check);
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    perform(&service.target, action, &cancellation)
                }))
                .unwrap_or(Err(AuthState::Failed));
                let mut inner = service.inner.lock().unwrap_or_else(|e| e.into_inner());
                if inner.snapshot.operation_id.as_deref() != Some(&id) {
                    return;
                }
                let cancelled = cancellation.is_cancelled();
                match result {
                    Ok(account) => {
                        inner.snapshot.state = if account.is_some() {
                            AuthState::Connected
                        } else {
                            AuthState::SignedOut
                        };
                        inner.snapshot.account = account;
                        inner.snapshot.needs_check = false;
                    }
                    Err(state) => {
                        inner.snapshot.state = state;
                        inner.snapshot.needs_check = true;
                        if let Some(account) = &mut inner.snapshot.account {
                            account.available = false;
                        }
                    }
                }
                if cancelled {
                    inner.snapshot.state = AuthState::Cancelled;
                    inner.snapshot.needs_check = mutates || inner.snapshot.needs_check;
                }
                inner.snapshot.operation_id = None;
                inner.cancellation = None;
            })
            .is_err()
        {
            inner.snapshot.state = AuthState::Failed;
            inner.snapshot.operation_id = None;
            inner.cancellation = None;
            inner.snapshot.needs_check = true;
        }
        snapshot
    }
}
impl AccessProvider for GitLabAuthService {
    fn id(&self) -> &str {
        &self.target.id
    }
    fn host(&self) -> &str {
        &self.target.host
    }
    fn kind(&self) -> &'static str {
        "gitlab"
    }
    fn accounts(&self) -> Vec<Account> {
        let snapshot = self.snapshot();
        snapshot
            .account
            .into_iter()
            .map(|mut account| {
                account.available &= snapshot.state == AuthState::Connected
                    && !snapshot.needs_check
                    && snapshot.operation_id.is_none();
                account
            })
            .collect()
    }
    fn busy(&self) -> bool {
        self.snapshot().operation_id.is_some()
    }
    fn check(&self) {
        self.check_state();
    }
    fn username(&self, key: &str) -> Option<String> {
        cli_id(key).map(|_| "oauth2".into())
    }
    fn credential(&self, key: &str) -> Option<Secret> {
        let expected = cli_id(key)?;
        let host = self.target.host.clone();
        credential_with_programs(
            &self.target,
            &tooling::glab_program_candidates(),
            expected,
            &CancellationToken::default(),
            |secret, cancellation| verify(&host, secret, cancellation),
        )
    }
}
/// Git asks for a credential once per helper process, so skip the separate
/// `--version` probe here: an old or broken glab fails the credential command
/// itself, and the identity is still verified before Git receives anything.
fn credential_with_programs(
    target: &Target,
    programs: &[String],
    expected: u64,
    cancellation: &CancellationToken,
    verify_identity: impl Fn(&Secret, &CancellationToken) -> Result<hosting_access::User, AuthState>,
) -> Option<Secret> {
    for program in programs {
        match exact_credential(target, program, cancellation, expected, &verify_identity) {
            Err(AuthState::CliMissing) => continue,
            result => return result.ok(),
        }
    }
    None
}
fn cli_id(key: &str) -> Option<u64> {
    let key = key.strip_prefix("cli.")?;
    let id = key.parse::<u64>().ok()?;
    (id > 0 && id.to_string() == key).then_some(id)
}
fn environment_credential() -> bool {
    [
        "GITLAB_TOKEN",
        "GITLAB_ACCESS_TOKEN",
        "OAUTH_TOKEN",
        "CI_JOB_TOKEN",
    ]
    .iter()
    .any(|key| std::env::var_os(key).is_some_and(|v| !v.is_empty()))
}
fn command(host: &str, program: &str, args: &[&str]) -> Command {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("NO_COLOR", "1")
        .env("GLAB_CHECK_UPDATE", "false")
        .env("GITLAB_HOST", host)
        .env("GITLAB_API_HOST", host)
        .env("GLAB_API_PROTOCOL", "https")
        .env("GLAB_ENABLE_CI_AUTOLOGIN", "false");
    for key in [
        "GITLAB_TOKEN",
        "GITLAB_ACCESS_TOKEN",
        "OAUTH_TOKEN",
        "CI_JOB_TOKEN",
        "GITLAB_CLIENT_ID",
        "DEBUG",
        "GLAB_DEBUG",
        "GITLAB_CI",
        "CI",
        "GLAB_FORCE_TTY",
    ] {
        command.env_remove(key);
    }
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    command
}
fn compatible_program(cancellation: &CancellationToken) -> Result<String, AuthState> {
    for program in tooling::glab_program_candidates() {
        let output = match cli_auth::run(
            command("gitlab.com", &program, &["--version"]),
            cancellation,
            Duration::from_secs(15),
            |_| {},
        ) {
            Err(AuthState::CliMissing) => continue,
            result => result?,
        };
        if !output.success || !supported_version(&output.stdout) {
            return Err(AuthState::CliUnsupported);
        }
        return Ok(program);
    }
    Err(AuthState::CliMissing)
}
fn supported_version(bytes: &[u8]) -> bool {
    let text = String::from_utf8_lossy(bytes);
    let Some(version) = tooling::glab_version(&text) else {
        return false;
    };
    let parts: Vec<_> = version.trim_start_matches('v').split('.').collect();
    parts.len() == 3
        && parts[2].parse::<u32>().is_ok()
        && parts[0]
            .parse::<u32>()
            .ok()
            .zip(parts[1].parse::<u32>().ok())
            .is_some_and(|(major, minor)| major > 1 || (major == 1 && minor >= 120))
}
#[derive(Deserialize)]
struct CredentialReceipt {
    #[serde(rename = "type")]
    kind: String,
    message: Option<String>,
    instance_url: Option<String>,
    token: Option<CredentialToken>,
}
#[derive(Deserialize)]
struct CredentialToken {
    #[serde(rename = "type")]
    kind: String,
    token: String,
}
impl Drop for CredentialToken {
    fn drop(&mut self) {
        self.token.zeroize();
    }
}
fn parse_credential(host: &str, mut bytes: Vec<u8>) -> Result<Option<Secret>, AuthState> {
    let receipt = serde_json::from_slice::<CredentialReceipt>(&bytes);
    bytes.zeroize();
    let receipt = receipt.map_err(|_| AuthState::Failed)?;
    if receipt.kind == "error" {
        return if receipt.message.as_deref()
            == Some("glab is not authenticated. Use glab auth login to authenticate")
        {
            Ok(None)
        } else {
            Err(AuthState::Invalid)
        };
    }
    let instance = format!("https://{host}");
    if receipt.kind != "success"
        || !receipt
            .instance_url
            .as_deref()
            .is_some_and(|url| url.trim_end_matches('/').eq_ignore_ascii_case(&instance))
    {
        return Err(AuthState::Invalid);
    }
    let mut token = receipt.token.ok_or(AuthState::Invalid)?;
    if !["pat", "oauth2"].contains(&token.kind.as_str()) {
        return Err(AuthState::Invalid);
    }
    Secret::from_bytes(std::mem::take(&mut token.token).into_bytes())
        .map(Some)
        .ok_or(AuthState::Invalid)
}
fn capture(
    target: &Target,
    program: &str,
    cancellation: &CancellationToken,
) -> Result<Option<Secret>, AuthState> {
    let boundary = format!("https://{}/gitodile/credential-boundary", target.host);
    let mut output = cli_auth::run(
        command(
            &target.host,
            program,
            &["auth", "credential-helper", "--repo", &boundary],
        ),
        cancellation,
        Duration::from_secs(30),
        |_| {},
    )?;
    if !output.success {
        output.stdout.zeroize();
        return Err(AuthState::Failed);
    }
    parse_credential(&target.host, std::mem::take(&mut output.stdout))
}
fn verify(
    host: &str,
    secret: &Secret,
    cancellation: &CancellationToken,
) -> Result<hosting_access::User, AuthState> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| AuthState::Failed)?;
    runtime
        .block_on(hosting_access::gitlab_user(host, secret, cancellation))
        .map_err(|e| match e.code {
            crate::error::AppErrorCode::OperationCancelled => AuthState::Cancelled,
            crate::error::AppErrorCode::AuthenticationFailed => AuthState::Invalid,
            crate::error::AppErrorCode::NetworkTimeout => AuthState::TimedOut,
            _ => AuthState::Offline,
        })
}
fn perform(
    target: &Target,
    action: Action,
    cancellation: &CancellationToken,
) -> Result<Option<Account>, AuthState> {
    let program = compatible_program(cancellation)?;
    if environment_credential() {
        return Err(AuthState::EnvironmentControlled);
    }
    perform_with(target, &program, action, cancellation, |secret, cancel| {
        verify(&target.host, secret, cancel)
    })
}
fn exact_credential(
    target: &Target,
    program: &str,
    cancellation: &CancellationToken,
    expected: u64,
    verify_identity: impl Fn(&Secret, &CancellationToken) -> Result<hosting_access::User, AuthState>,
) -> Result<Secret, AuthState> {
    let secret = capture(target, program, cancellation)?.ok_or(AuthState::Invalid)?;
    let user = verify_identity(&secret, cancellation)?;
    if user.id != Some(expected) {
        return Err(AuthState::Invalid);
    }
    Ok(secret)
}
fn perform_with(
    target: &Target,
    program: &str,
    action: Action,
    cancellation: &CancellationToken,
    verify_identity: impl Fn(&Secret, &CancellationToken) -> Result<hosting_access::User, AuthState>,
) -> Result<Option<Account>, AuthState> {
    match action {
        Action::Login => {
            // An existing session is the answer: report its verified account
            // instead of logging in over it.
            if capture(target, program, cancellation)?.is_none() {
                let host = &*target.host;
                let mut args = vec![
                    "auth",
                    "login",
                    "--hostname",
                    host,
                    "--web",
                    "--api-host",
                    host,
                    "--api-protocol",
                    "https",
                    "--git-protocol",
                    "https",
                    "--ssh-hostname",
                    crate::credentials::host_name(host),
                ];
                // Only gitlab.com's registry domain is known; a self-managed
                // registry stays whatever glab or the user configured.
                if target.is_public() {
                    args.extend(["--container-registry-domains", "registry.gitlab.com"]);
                }
                args.push("--use-keyring");
                let output = cli_auth::run(
                    command(host, program, &args),
                    cancellation,
                    Duration::from_secs(900),
                    |_| {},
                )?;
                if !output.success {
                    return Err(AuthState::Failed);
                }
            }
        }
        Action::Logout(id) => {
            let expected = id
                .strip_prefix(&format!("{}:", target.id))
                .and_then(cli_id)
                .ok_or(AuthState::Failed)?;
            let _secret =
                exact_credential(target, program, cancellation, expected, &verify_identity)?;
            let output = cli_auth::run(
                command(
                    &target.host,
                    program,
                    &["auth", "logout", "--hostname", &target.host],
                ),
                cancellation,
                Duration::from_secs(30),
                |_| {},
            )?;
            if !output.success {
                return Err(AuthState::Failed);
            }
            // Removal is definitive even if later verification is unavailable.
            return Ok(None);
        }
        Action::Check => {}
    }
    let Some(secret) = capture(target, program, cancellation)? else {
        return Ok(None);
    };
    let user = verify_identity(&secret, cancellation)?;
    Ok(Some(Account {
        id: format!("{}:cli.{}", target.id, user.id.ok_or(AuthState::Invalid)?),
        provider: target.id.to_string(),
        host: target.host.to_string(),
        login: user.login,
        avatar_data_url: None,
        available: true,
        unavailable_reason: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    impl Target {
        fn public() -> Self {
            GitLabAuthService::default().target
        }
    }
    fn fixture(scenario: &str) -> String {
        use std::{fs, sync::OnceLock};
        static BINARY: OnceLock<std::path::PathBuf> = OnceLock::new();
        let binary = BINARY.get_or_init(|| {
            let directory = std::path::PathBuf::from(crate::test_support::unique_temp_dir("fake-glab"));
            let source = directory.join("main.rs");
            fs::write(&source, r###"
use std::{env, fs, thread, time::Duration};
fn main() {
    let exe = env::current_exe().unwrap();
    let scenario = exe.file_stem().unwrap().to_string_lossy();
    let args: Vec<_> = env::args().skip(1).collect();
    assert!(env::var_os("GITLAB_TOKEN").is_none());
    assert!(env::var_os("GITLAB_ACCESS_TOKEN").is_none());
    assert!(env::var_os("OAUTH_TOKEN").is_none());
    assert_eq!(env::var("GITLAB_API_HOST").unwrap(), "gitlab.com");
    assert_eq!(env::var("GLAB_API_PROTOCOL").unwrap(), "https");
    if args == ["--version"] { println!("glab 1.120.0 (fixture)"); return; }
    if scenario == "slow" { thread::sleep(Duration::from_secs(30)); return; }
    if args.get(1).map(String::as_str) == Some("login") {
        assert_eq!(args, ["auth", "login", "--hostname", "gitlab.com", "--web", "--api-host", "gitlab.com", "--api-protocol", "https", "--git-protocol", "https", "--ssh-hostname", "gitlab.com", "--container-registry-domains", "registry.gitlab.com", "--use-keyring"]);
        fs::write(exe.with_extension("saved"), "saved").unwrap(); return;
    }
    if args.get(1).map(String::as_str) == Some("logout") {
        assert_eq!(args, ["auth", "logout", "--hostname", "gitlab.com"]);
        fs::write(exe.with_extension("removed"), "removed").unwrap(); return;
    }
    assert_eq!(args, ["auth", "credential-helper", "--repo", "https://gitlab.com/gitodile/credential-boundary"]);
    if scenario == "browser" && !exe.with_extension("saved").exists() {
        println!(r#"{{"type":"error","message":"glab is not authenticated. Use glab auth login to authenticate"}}"#);
    } else {
        println!(r#"{{"type":"success","instance_url":"https://gitlab.com","token":{{"type":"oauth2","token":"fixture-oauth-only-123456"}}}}"#);
    }
}
"###).unwrap();
            let executable = directory.join(if cfg!(windows) { "fake.exe" } else { "fake" });
            assert!(Command::new("rustc").arg(source).arg("-o").arg(&executable).status().unwrap().success());
            executable
        });
        let path = binary.with_file_name(format!(
            "{scenario}{}",
            if cfg!(windows) { ".exe" } else { "" }
        ));
        fs::copy(binary, &path).unwrap();
        path.to_string_lossy().into_owned()
    }
    fn identity(secret: &Secret, _: &CancellationToken) -> Result<hosting_access::User, AuthState> {
        assert_eq!(secret.bytes(), b"fixture-oauth-only-123456");
        Ok(hosting_access::User {
            id: Some(42),
            login: "user.with_dot".into(),
            uuid: None,
        })
    }
    #[test]
    fn browser_and_exact_capture_share_one_verified_cli_identity() {
        let program = fixture("browser");
        let cancellation = CancellationToken::default();
        let account = perform_with(
            &Target::public(),
            &program,
            Action::Login,
            &cancellation,
            identity,
        )
        .unwrap()
        .unwrap();
        assert_eq!(account.id, "gitlab:cli.42");
        assert_eq!(account.login, "user.with_dot");
        assert!(exact_credential(&Target::public(), &program, &cancellation, 42, identity).is_ok());
        assert!(
            exact_credential(&Target::public(), &program, &cancellation, 43, identity).is_err()
        );
    }
    #[test]
    fn login_over_an_existing_session_reports_it_instead_of_signing_in_again() {
        let program = fixture("existing");
        let account = perform_with(
            &Target::public(),
            &program,
            Action::Login,
            &CancellationToken::default(),
            identity,
        )
        .unwrap()
        .unwrap();
        assert_eq!(account.id, "gitlab:cli.42");
        // The fake records a login in a sibling file; none may have happened.
        assert!(!std::path::Path::new(&program)
            .with_extension("saved")
            .exists());
    }
    #[test]
    fn git_helper_lookup_skips_missing_candidates_and_still_verifies_the_identity() {
        let programs = vec![
            "gitodile-missing-glab-candidate".to_owned(),
            fixture("helper"),
        ];
        let cancellation = CancellationToken::default();
        assert!(credential_with_programs(
            &Target::public(),
            &programs,
            42,
            &cancellation,
            identity
        )
        .is_some());
        assert!(credential_with_programs(
            &Target::public(),
            &programs,
            43,
            &cancellation,
            identity
        )
        .is_none());
        assert!(credential_with_programs(
            &Target::public(),
            &programs[..1],
            42,
            &cancellation,
            identity
        )
        .is_none());
    }
    #[test]
    fn changed_external_identity_and_offline_check_cannot_sign_out_another_person() {
        let program = fixture("changed");
        let cancellation = CancellationToken::default();
        assert!(perform_with(
            &Target::public(),
            &program,
            Action::Logout("gitlab:cli.43".into()),
            &cancellation,
            identity
        )
        .is_err());
        assert!(!std::path::Path::new(&program)
            .with_extension("removed")
            .exists());
        assert!(perform_with(
            &Target::public(),
            &program,
            Action::Logout("gitlab:cli.42".into()),
            &cancellation,
            |_, _| Err(AuthState::Offline)
        )
        .is_err());
        assert!(!std::path::Path::new(&program)
            .with_extension("removed")
            .exists());
        assert!(perform_with(
            &Target::public(),
            &program,
            Action::Logout("gitlab:cli.42".into()),
            &cancellation,
            identity
        )
        .unwrap()
        .is_none());
        assert!(std::path::Path::new(&program)
            .with_extension("removed")
            .exists());
    }
    #[test]
    fn cancellation_reaps_cli_before_returning_and_uncertain_errors_are_not_signed_out() {
        let program = fixture("slow");
        let cancellation = CancellationToken::default();
        let token = cancellation.clone();
        let canceller = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            token.cancel();
        });
        assert!(matches!(
            capture(&Target::public(), &program, &cancellation),
            Err(AuthState::Cancelled)
        ));
        canceller.join().unwrap();
        assert!(parse_credential(
            "gitlab.com",
            br#"{"type":"error","message":"failed to refresh credentials: fixture-private"}"#
                .to_vec()
        )
        .is_err());
    }
    #[test]
    fn version_contract_and_stable_ids() {
        assert!(supported_version(b"glab 1.120.0 (7879011)\r\n"));
        assert!(supported_version(b"glab version 1.120.0 (fixture)"));
        for version in [
            "glab 1.119.0",
            "glab 1.120.bad",
            "glab version 1.119.0",
            "glab version 1.120.bad",
            "gh version 2.80.0",
        ] {
            assert!(!supported_version(version.as_bytes()));
        }
        assert_eq!(cli_id("cli.42"), Some(42));
        for key in ["token.42", "cli.0", "cli.042", "cli.user.name", "cli.42\n"] {
            assert_eq!(cli_id(key), None);
        }
    }
    #[test]
    fn credential_origin_and_kind_are_validated_before_use() {
        let receipt = r#"{"type":"success","instance_url":"https://gitlab.com","token":{"type":"pat","token":"fixture-secret-only-123456"}}"#;
        assert!(parse_credential("gitlab.com", receipt.as_bytes().to_vec())
            .unwrap()
            .is_some());
        for wrong in [
            "http://gitlab.com",
            "https://gitlab.com.evil.test",
            "https://other.test",
            "https://gitlab.com/api/v4",
        ] {
            assert!(parse_credential(
                "gitlab.com",
                receipt.replace("https://gitlab.com", wrong).into_bytes()
            )
            .is_err());
        }
        assert!(
            parse_credential("gitlab.com", receipt.replace("pat", "job").into_bytes()).is_err()
        );
        assert!(
            parse_credential("gitlab.com", br#"{"type":"error","message":"glab is not authenticated. Use glab auth login to authenticate"}"#.to_vec())
                .unwrap()
                .is_none()
        );
        // A self-managed receipt must name exactly the configured server.
        let server = receipt.replace("https://gitlab.com", "https://gitlab.example.com:8443");
        assert!(
            parse_credential("gitlab.example.com:8443", server.clone().into_bytes())
                .unwrap()
                .is_some()
        );
        for host in ["gitlab.example.com", "gitlab.com", "example.com:8443"] {
            assert!(parse_credential(host, server.clone().into_bytes()).is_err());
        }
        let target = GitLabAuthService::for_host("gls-0123456789", "gitlab.example.com:8443");
        assert_eq!(target.id(), "gls-0123456789");
        assert_eq!(target.host(), "gitlab.example.com:8443");
        assert!(!target.target.is_public());
    }
}
