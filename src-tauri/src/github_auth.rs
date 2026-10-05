//! Machine-level GitHub CLI authentication. Tokens remain owned by gh.
//! Only explicit actions reach the network; snapshots are memory-only reads.

use crate::credentials::{AccessProvider, Account, Secret};
use crate::{application, encoding::base64_encode, git::CancellationToken, tooling};
use serde::Serialize;
use std::io::{ErrorKind, Read};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const DEVICE_URL: &str = "https://github.com/login/device";
const OUTPUT_CAP: usize = 64 * 1024;
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(15 * 60);

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AuthState {
    Unchecked,
    Checking,
    SignedOut,
    Connected,
    Invalid,
    Offline,
    LoginStarting,
    SigningOut,
    Switching,
    AwaitingBrowser,
    Cancelling,
    Cancelled,
    TimedOut,
    Failed,
    CliMissing,
    CliUnsupported,
    EnvironmentControlled,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CredentialStorage {
    Secure,
    File,
    Environment,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubAccount {
    login: String,
    host: &'static str,
    storage: CredentialStorage,
    avatar_data_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubSavedAccount {
    #[serde(flatten)]
    account: GitHubAccount,
    active: bool,
    state: AuthState,
}

#[derive(Clone, Debug, PartialEq)]
struct AuthAccounts {
    accounts: Vec<GitHubSavedAccount>,
}

impl AuthAccounts {
    fn state(&self) -> AuthState {
        self.accounts
            .iter()
            .find(|entry| entry.active)
            .map_or(AuthState::SignedOut, |entry| entry.state)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubAuthSnapshot {
    pub(crate) state: AuthState,
    account: Option<GitHubAccount>,
    accounts: Vec<GitHubSavedAccount>,
    operation_id: Option<String>,
    device_code: Option<String>,
    verification_url: Option<&'static str>,
    /// Login may finish writing shared credentials just as cancellation arrives.
    needs_check: bool,
    signed_out_account: Option<String>,
}

impl Default for GitHubAuthSnapshot {
    fn default() -> Self {
        Self {
            state: AuthState::Unchecked,
            account: None,
            accounts: Vec::new(),
            operation_id: None,
            device_code: None,
            verification_url: None,
            needs_check: false,
            signed_out_account: None,
        }
    }
}

impl AuthState {
    fn busy(self) -> bool {
        matches!(
            self,
            Self::Checking
                | Self::LoginStarting
                | Self::SigningOut
                | Self::Switching
                | Self::AwaitingBrowser
                | Self::Cancelling
        )
    }
}

#[derive(Default)]
struct Inner {
    snapshot: GitHubAuthSnapshot,
    sequence: u64,
    cancellation: Option<CancellationToken>,
}

#[derive(Clone, Default)]
pub(crate) struct GitHubAuthService(Arc<Mutex<Inner>>);

/// GitHub's implementation of the shared account/access contract. Browser
/// authorization and persistence still belong to gh; selections belong to us.
#[derive(Default)]
pub(crate) struct GhAccessProvider(pub(crate) GitHubAuthService);

impl AccessProvider for GhAccessProvider {
    fn id(&self) -> &'static str {
        "github"
    }
    fn host(&self) -> &'static str {
        "github.com"
    }
    fn accounts(&self) -> Vec<Account> {
        let snapshot = self.0.snapshot();
        snapshot
            .accounts
            .iter()
            .filter(|entry| entry.account.storage != CredentialStorage::Environment)
            .map(|entry| Account {
                id: format!("github:{}", entry.account.login),
                provider: "github".into(),
                host: "github.com".into(),
                login: entry.account.login.clone(),
                avatar_data_url: entry.account.avatar_data_url.clone(),
                available: !snapshot.needs_check
                    && !snapshot.state.busy()
                    && entry.state == AuthState::Connected,
                unavailable_reason: None,
            })
            .collect()
    }
    fn busy(&self) -> bool {
        self.0.snapshot().state.busy()
    }
    fn check(&self) {
        self.0.check();
    }
    fn credential(&self, login: &str) -> Option<Secret> {
        credential_with_programs(tooling::gh_program_candidates(), login)
    }
}

fn credential_with_programs(programs: &[&str], login: &str) -> Option<Secret> {
    if !valid_login(login) {
        return None;
    }
    for program in programs {
        let mut command = gh_command(
            program,
            &["auth", "token", "--hostname", "github.com", "--user", login],
        );
        // Explicit account lookup must not inherit an unrelated environment
        // identity. No token is ever put into another command's environment.
        command.env_remove("GH_TOKEN").env_remove("GITHUB_TOKEN");
        match run(
            command,
            &CancellationToken::default(),
            CHECK_TIMEOUT,
            |_| {},
        ) {
            Err(AuthState::CliMissing) => continue,
            Ok(mut result) if result.success => {
                return Secret::from_bytes(std::mem::take(&mut result.stdout))
            }
            Ok(mut result) => {
                result.stdout.fill(0);
                return None;
            }
            Err(_) => return None,
        }
    }
    None
}

enum AuthAction {
    Check,
    Login,
    Logout(String),
    Switch(String),
}

impl GitHubAuthService {
    pub(crate) fn snapshot(&self) -> GitHubAuthSnapshot {
        let _command = application::enter("get_github_auth_state");
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .snapshot
            .clone()
    }

    pub(crate) fn check(&self) -> GitHubAuthSnapshot {
        self.start(AuthAction::Check)
    }
    pub(crate) fn login(&self) -> GitHubAuthSnapshot {
        self.start(AuthAction::Login)
    }

    pub(crate) fn logout(&self, login: String) -> GitHubAuthSnapshot {
        self.start(AuthAction::Logout(login))
    }

    pub(crate) fn switch(&self, login: String) -> GitHubAuthSnapshot {
        self.start(AuthAction::Switch(login))
    }

    fn start(&self, action: AuthAction) -> GitHubAuthSnapshot {
        let command = match &action {
            AuthAction::Check => "check_github_auth",
            AuthAction::Login => "start_github_login",
            AuthAction::Logout(_) => "logout_github_account",
            AuthAction::Switch(_) => "switch_github_account",
        };
        let mutates = !matches!(action, AuthAction::Check);
        let _command = application::enter(command);
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if inner.snapshot.state.busy() {
            return inner.snapshot.clone();
        }
        // gh itself refuses login when an environment token owns authentication.
        if mutates && environment_credential() {
            inner.snapshot.state = AuthState::EnvironmentControlled;
            return inner.snapshot.clone();
        }
        if mutates
            && matches!(
                inner.snapshot.state,
                AuthState::CliUnsupported | AuthState::EnvironmentControlled
            )
        {
            return inner.snapshot.clone();
        }
        if let AuthAction::Logout(login) | AuthAction::Switch(login) = &action {
            let target = inner
                .snapshot
                .accounts
                .iter()
                .find(|entry| entry.account.login == *login)
                .map(|entry| &entry.account)
                .or_else(|| {
                    inner
                        .snapshot
                        .account
                        .as_ref()
                        .filter(|account| account.login == *login)
                });
            if !valid_login(login)
                || target.is_none()
                || inner.snapshot.needs_check
                || target.is_some_and(|account| account.storage == CredentialStorage::Environment)
                || inner
                    .snapshot
                    .account
                    .as_ref()
                    .is_some_and(|account| account.storage == CredentialStorage::Environment)
            {
                inner.snapshot.state = AuthState::Failed;
                inner.snapshot.needs_check = true;
                return inner.snapshot.clone();
            }
        }
        let token = CancellationToken::default();
        let activity =
            application::begin_background_activity_with_cancellation(command, token.clone());
        inner.sequence += 1;
        let id = format!("github-auth-{}", inner.sequence);
        inner.snapshot.state = match &action {
            AuthAction::Check => AuthState::Checking,
            AuthAction::Login => AuthState::LoginStarting,
            AuthAction::Logout(_) => AuthState::SigningOut,
            AuthAction::Switch(_) => AuthState::Switching,
        };
        inner.snapshot.operation_id = Some(id.clone());
        inner.snapshot.device_code = None;
        inner.snapshot.verification_url = None;
        // A failed retry must not erase uncertainty about an earlier mutation.
        if mutates {
            inner.snapshot.needs_check = false;
        }
        inner.snapshot.signed_out_account = None;
        inner.cancellation = Some(token.clone());
        let snapshot = inner.snapshot.clone();
        let service = self.clone();
        // A failed worker launch must release admission and restore a terminal state.
        if thread::Builder::new()
            .name("github-auth".into())
            .spawn(move || {
                let _activity = activity;
                service.complete_work(&id, mutates, || match action {
                    AuthAction::Logout(login) => {
                        let (removed, result) =
                            logout_with_programs(tooling::gh_program_candidates(), &token, &login);
                        (result, removed.then_some(login))
                    }
                    AuthAction::Switch(login) => (
                        switch_with_programs(tooling::gh_program_candidates(), &token, &login),
                        None,
                    ),
                    action => {
                        let result =
                            authenticate(&token, matches!(action, AuthAction::Login), |code| {
                                service.publish_code(&id, code)
                            });
                        (result, None)
                    }
                });
            })
            .is_err()
        {
            inner.snapshot.state = AuthState::Failed;
            inner.cancellation = None;
            inner.snapshot.operation_id = None;
            return inner.snapshot.clone();
        }
        snapshot
    }

    fn complete_work(
        &self,
        id: &str,
        mutates: bool,
        work: impl FnOnce() -> (Result<AuthAccounts, AuthState>, Option<String>),
    ) {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)) {
            Ok((result, removed)) => self.finish(id, result, mutates, removed),
            Err(_) => self.finish(id, Err(AuthState::Failed), mutates, None),
        }
    }

    fn publish_code(&self, id: &str, code: String) {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if inner.snapshot.operation_id.as_deref() == Some(id)
            && inner.snapshot.state == AuthState::LoginStarting
        {
            inner.snapshot.state = AuthState::AwaitingBrowser;
            inner.snapshot.device_code = Some(code);
            inner.snapshot.verification_url = Some(DEVICE_URL);
        }
    }

    fn finish(
        &self,
        id: &str,
        result: Result<AuthAccounts, AuthState>,
        mutates: bool,
        removed: Option<String>,
    ) {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if inner.snapshot.operation_id.as_deref() != Some(id) {
            return;
        }
        let cancelling = inner.snapshot.state == AuthState::Cancelling;
        if let Some(login) = &removed {
            inner
                .snapshot
                .accounts
                .retain(|entry| entry.account.login != *login);
            if inner
                .snapshot
                .account
                .as_ref()
                .is_some_and(|account| account.login == *login)
            {
                inner.snapshot.account = None;
            }
        }
        let verified = result.is_ok();
        let state = match result {
            Ok(mut result) => {
                let state = result.state();
                for entry in &mut result.accounts {
                    if entry.account.avatar_data_url.is_none() {
                        entry.account.avatar_data_url = inner
                            .snapshot
                            .accounts
                            .iter()
                            .find(|previous| previous.account.login == entry.account.login)
                            .and_then(|previous| previous.account.avatar_data_url.clone())
                            .or_else(|| {
                                inner
                                    .snapshot
                                    .account
                                    .as_ref()
                                    .filter(|previous| previous.login == entry.account.login)
                                    .and_then(|previous| previous.avatar_data_url.clone())
                            });
                    }
                }
                inner.snapshot.account = result
                    .accounts
                    .iter()
                    .find(|entry| entry.active)
                    .map(|entry| entry.account.clone());
                inner.snapshot.accounts = result.accounts;
                state
            }
            Err(state) => {
                // Keep identities/avatars, but a failed fresh check must not
                // leave old rows selectable as currently verified accounts.
                for entry in &mut inner.snapshot.accounts {
                    if entry.state == AuthState::Connected {
                        entry.state = AuthState::Offline;
                    }
                }
                state
            }
        };
        inner.snapshot.state = if cancelling {
            AuthState::Cancelled
        } else {
            state
        };
        inner.snapshot.needs_check = (inner.snapshot.needs_check && !verified)
            || (mutates
                && (cancelling || !matches!(state, AuthState::Connected | AuthState::SignedOut)));
        inner.snapshot.signed_out_account = removed;
        inner.snapshot.operation_id = None;
        inner.snapshot.device_code = None;
        inner.snapshot.verification_url = None;
        inner.cancellation = None;
    }

    pub(crate) fn cancel(&self, operation_id: &str) -> GitHubAuthSnapshot {
        let _command = application::enter("cancel_github_auth");
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if inner.snapshot.operation_id.as_deref() == Some(operation_id) {
            if let Some(token) = &inner.cancellation {
                token.cancel();
            }
            inner.snapshot.state = AuthState::Cancelling;
        }
        inner.snapshot.clone()
    }
}

fn environment_credential() -> bool {
    ["GH_TOKEN", "GITHUB_TOKEN"]
        .iter()
        .any(|key| std::env::var_os(key).is_some_and(|value| !value.is_empty()))
}

fn gh_command(program: &str, args: &[&str]) -> Command {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(std::env::temp_dir())
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("NO_COLOR", "1")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .env("GH_NO_EXTENSION_UPDATE_NOTIFIER", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for key in [
        "GH_DEBUG",
        "DEBUG",
        "GH_FORCE_TTY",
        "CLICOLOR_FORCE",
        "GH_HOST",
        "GH_REPO",
    ] {
        command.env_remove(key);
    }
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command
}

struct ProcessOutput {
    success: bool,
    stdout: Vec<u8>,
}

/// Drain both streams; stderr is never retained or exposed. A bounded rolling
/// line parser extracts only the temporary device code from gh's English output.
fn run(
    mut command: Command,
    token: &CancellationToken,
    timeout: Duration,
    on_code: impl Fn(String) + Send + Sync,
) -> Result<ProcessOutput, AuthState> {
    if token.is_cancelled() {
        return Err(AuthState::Cancelled);
    }
    let mut child = command.spawn().map_err(|e| {
        if e.kind() == ErrorKind::NotFound {
            AuthState::CliMissing
        } else {
            AuthState::Failed
        }
    })?;
    let stdout = child.stdout.take().ok_or(AuthState::Failed)?;
    let stderr = child.stderr.take().ok_or(AuthState::Failed)?;
    thread::scope(|scope| {
        let out = scope.spawn(|| read_stdout(stdout));
        let err = scope.spawn(|| read_login_lines(stderr, on_code));
        let started = Instant::now();
        let result = loop {
            if token.is_cancelled() || started.elapsed() >= timeout {
                let _ = child.kill();
                let _ = child.wait();
                break Err(if token.is_cancelled() {
                    AuthState::Cancelled
                } else {
                    AuthState::TimedOut
                });
            }
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status.success()),
                Ok(None) => thread::sleep(Duration::from_millis(25)),
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(AuthState::Failed);
                }
            }
        };
        let stdout = out.join().map_err(|_| AuthState::Failed)??;
        err.join().map_err(|_| AuthState::Failed)?;
        Ok(ProcessOutput {
            success: result?,
            stdout,
        })
    })
}

fn read_stdout(mut reader: impl Read) -> Result<Vec<u8>, AuthState> {
    let mut retained = Vec::new();
    let mut overflow = false;
    let mut chunk = [0u8; 4096];
    loop {
        let count = reader.read(&mut chunk).map_err(|_| AuthState::Failed)?;
        if count == 0 {
            break;
        }
        let keep = count.min(OUTPUT_CAP.saturating_sub(retained.len()));
        retained.extend_from_slice(&chunk[..keep]);
        overflow |= keep < count;
    }
    if overflow {
        Err(AuthState::Failed)
    } else {
        Ok(retained)
    }
}

fn read_login_lines(mut reader: impl Read, on_code: impl Fn(String)) {
    let mut line = Vec::new();
    let mut discard = false;
    let mut chunk = [0u8; 1024];
    while let Ok(count) = reader.read(&mut chunk) {
        if count == 0 {
            break;
        }
        for byte in &chunk[..count] {
            if *byte == b'\n' {
                if !discard {
                    if let Some(code) = parse_device_code(&String::from_utf8_lossy(&line)) {
                        on_code(code);
                    }
                }
                line.clear();
                discard = false;
            } else if line.len() < 4096 && !discard {
                line.push(*byte);
            } else {
                line.clear();
                discard = true;
            }
        }
    }
}

fn parse_device_code(line: &str) -> Option<String> {
    let code = line
        .trim()
        .strip_prefix("! First copy your one-time code: ")?;
    let bytes = code.as_bytes();
    (bytes.len() == 9
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || b.is_ascii_uppercase() || b.is_ascii_digit()))
    .then(|| code.to_string())
}

fn authenticate(
    token: &CancellationToken,
    login: bool,
    on_code: impl Fn(String) + Send + Sync,
) -> Result<AuthAccounts, AuthState> {
    let mut accounts =
        authenticate_with_programs(tooling::gh_program_candidates(), token, login, on_code)?;
    enrich_avatars(tooling::gh_program_candidates(), token, &mut accounts);
    Ok(accounts)
}

fn authenticate_with_programs(
    programs: &[&str],
    token: &CancellationToken,
    login: bool,
    on_code: impl Fn(String) + Send + Sync,
) -> Result<AuthAccounts, AuthState> {
    let mut program = None;
    for candidate in programs {
        match run(
            gh_command(candidate, &["auth", "status", "--help"]),
            token,
            CHECK_TIMEOUT,
            |_| {},
        ) {
            Err(AuthState::CliMissing) => continue,
            Err(state) => return Err(state),
            Ok(help) => {
                if !help.success {
                    return Err(AuthState::Failed);
                }
                if !String::from_utf8_lossy(&help.stdout).contains("--json") {
                    return Err(AuthState::CliUnsupported);
                }
                program = Some(*candidate);
                break;
            }
        }
    }
    let program = program.ok_or(AuthState::CliMissing)?;
    if login {
        // No git-protocol flag, credential setup or SSH-key flow. No extra scopes.
        let result = run(
            gh_command(
                program,
                &[
                    "auth",
                    "login",
                    "--web",
                    "--hostname",
                    "github.com",
                    "--skip-ssh-key",
                    "--clipboard=false",
                ],
            ),
            token,
            LOGIN_TIMEOUT,
            on_code,
        )?;
        if !result.success {
            return Err(AuthState::Failed);
        }
    }
    let result = run(
        gh_command(
            program,
            &[
                "auth",
                "status",
                "--hostname",
                "github.com",
                "--json",
                "hosts",
            ],
        ),
        token,
        CHECK_TIMEOUT,
        |_| {},
    )?;
    if !result.success {
        return Err(AuthState::Offline);
    }
    parse_status(&result.stdout)
}

fn parse_status(bytes: &[u8]) -> Result<AuthAccounts, AuthState> {
    let json: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| AuthState::Failed)?;
    let hosts = json
        .get("hosts")
        .and_then(|v| v.as_object())
        .ok_or(AuthState::Failed)?;
    let entries = match hosts.get("github.com") {
        None => {
            return Ok(AuthAccounts {
                accounts: Vec::new(),
            })
        }
        Some(value) => value.as_array().ok_or(AuthState::Failed)?,
    };
    // Bounded metadata only. Never silently truncate or export tokens, scopes,
    // credential paths, errors or accounts on other hosts.
    if entries.len() > 32 {
        return Err(AuthState::Failed);
    }
    let mut accounts: Vec<GitHubSavedAccount> = Vec::new();
    for entry in entries {
        let parsed = parse_account(entry)?;
        if let Some(previous) = accounts.iter().find(|previous| {
            previous
                .account
                .login
                .eq_ignore_ascii_case(&parsed.account.login)
        }) {
            // gh can report the same username twice when an environment token
            // overrides a stored account. Only expose its controlling identity.
            if previous.active
                && previous.account.storage == CredentialStorage::Environment
                && !parsed.active
            {
                continue;
            }
            return Err(AuthState::Failed);
        }
        accounts.push(parsed);
    }
    if !accounts.is_empty() && accounts.iter().filter(|entry| entry.active).count() != 1 {
        return Err(AuthState::Failed);
    }
    accounts.sort_by_key(|entry| (!entry.active, entry.account.login.to_ascii_lowercase()));
    Ok(AuthAccounts { accounts })
}

fn parse_account(entry: &serde_json::Value) -> Result<GitHubSavedAccount, AuthState> {
    let state = match entry.get("state").and_then(|v| v.as_str()) {
        Some("success") => AuthState::Connected,
        Some("timeout") => AuthState::Offline,
        Some("error") => {
            let error = entry.get("error").and_then(|v| v.as_str()).unwrap_or("");
            if error.contains("token is invalid") || error.contains("HTTP 401") {
                AuthState::Invalid
            } else {
                AuthState::Offline
            }
        }
        _ => return Err(AuthState::Failed),
    };
    let login = entry
        .get("login")
        .and_then(|v| v.as_str())
        .ok_or(AuthState::Failed)?;
    if !valid_login(login) {
        return Err(if login.is_empty() && state != AuthState::Connected {
            state
        } else {
            AuthState::Failed
        });
    }
    let source = entry
        .get("tokenSource")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let storage = match source {
        "keyring" => CredentialStorage::Secure,
        "GH_TOKEN" | "GITHUB_TOKEN" => CredentialStorage::Environment,
        source if source.ends_with("hosts.yml") || source == "oauth_token" => {
            CredentialStorage::File
        }
        _ => CredentialStorage::Unknown,
    };
    let active = entry
        .get("active")
        .and_then(|v| v.as_bool())
        .ok_or(AuthState::Failed)?;
    Ok(GitHubSavedAccount {
        account: GitHubAccount {
            login: login.into(),
            host: "github.com",
            storage,
            avatar_data_url: None,
        },
        active,
        state,
    })
}

fn valid_login(login: &str) -> bool {
    login.len() <= 39
        && login
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && login
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
        && !login.contains("--")
        && login
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// Target the exact account shown in the confirmation, even if another tool
/// changes gh's active account meanwhile. Never log out a whole host.
fn logout_with_programs(
    programs: &[&str],
    token: &CancellationToken,
    login: &str,
) -> (bool, Result<AuthAccounts, AuthState>) {
    if !valid_login(login) {
        return (false, Err(AuthState::Failed));
    }
    for program in programs {
        let result = run(
            gh_command(
                program,
                &[
                    "auth",
                    "logout",
                    "--hostname",
                    "github.com",
                    "--user",
                    login,
                ],
            ),
            token,
            CHECK_TIMEOUT,
            |_| {},
        );
        match result {
            Err(AuthState::CliMissing) => continue,
            Err(state) => return (false, Err(state)),
            Ok(output) if !output.success => return (false, Err(AuthState::Failed)),
            Ok(_) => {
                // gh may automatically select another stored account. Inspect
                // its actual state rather than pretending every account is gone.
                let result = authenticate_with_programs(&[*program], token, false, |_| {}).map(
                    |mut accounts| {
                        enrich_avatars(&[*program], token, &mut accounts);
                        accounts
                    },
                );
                return (true, result);
            }
        }
    }
    (false, Err(AuthState::CliMissing))
}

/// Local shared-auth mutation only; gh never receives a shell string or an
/// arbitrary host. A post-switch check reports the real resulting account.
fn switch_with_programs(
    programs: &[&str],
    token: &CancellationToken,
    login: &str,
) -> Result<AuthAccounts, AuthState> {
    if !valid_login(login) {
        return Err(AuthState::Failed);
    }
    for program in programs {
        match run(
            gh_command(
                program,
                &[
                    "auth",
                    "switch",
                    "--hostname",
                    "github.com",
                    "--user",
                    login,
                ],
            ),
            token,
            CHECK_TIMEOUT,
            |_| {},
        ) {
            Err(AuthState::CliMissing) => continue,
            Err(state) => return Err(state),
            Ok(output) if !output.success => return Err(AuthState::Failed),
            Ok(_) => {
                let mut accounts = authenticate_with_programs(&[*program], token, false, |_| {})?;
                if !accounts
                    .accounts
                    .iter()
                    .any(|entry| entry.active && entry.account.login.eq_ignore_ascii_case(login))
                {
                    return Err(AuthState::Failed);
                }
                enrich_avatars(&[*program], token, &mut accounts);
                return Ok(accounts);
            }
        }
    }
    Err(AuthState::CliMissing)
}

/// Optional image work must not grow the check deadline with the account list.
/// At most four profiles are refreshed concurrently; other rows use their
/// memory-cached avatar (or a placeholder), and refresh when made active.
fn enrich_avatars(programs: &[&str], token: &CancellationToken, accounts: &mut AuthAccounts) {
    thread::scope(|scope| {
        for entry in accounts.accounts.iter_mut().take(4) {
            scope.spawn(move || {
                entry.account.avatar_data_url = fetch_avatar(programs, token, &entry.account.login);
            });
        }
    });
}

const AVATAR_CAP: usize = 256 * 1024;

fn avatar_http_client() -> Result<reqwest::Client, reqwest::Error> {
    // The updater initializes this same provider only when checking updates.
    // Avatars may be the first HTTP request, including in gated development builds.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
}

fn avatar_url(profile: &[u8], login: &str) -> Option<String> {
    let profile: serde_json::Value = serde_json::from_slice(profile).ok()?;
    if !profile.get("login")?.as_str()?.eq_ignore_ascii_case(login) {
        return None;
    }
    let id = profile.get("id")?.as_u64().filter(|id| *id > 0)?;
    Some(format!("https://avatars.githubusercontent.com/u/{id}?s=96"))
}

fn avatar_data_url(bytes: &[u8]) -> Option<String> {
    if bytes.len() > AVATAR_CAP {
        return None;
    }
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else {
        return None;
    };
    Some(format!("data:{mime};base64,{}", base64_encode(bytes)))
}

/// Only explicit account actions retrieve a small public avatar. This separate
/// HTTP client has no credential headers, no redirects, no renderer networking,
/// and no persistence. Profile failure never changes authentication success.
fn fetch_avatar(programs: &[&str], token: &CancellationToken, login: &str) -> Option<String> {
    if !valid_login(login) {
        return None;
    }
    let endpoint = format!("users/{login}");
    for program in programs {
        let profile = run(
            gh_command(
                program,
                &[
                    "api",
                    "--hostname",
                    "github.com",
                    "--method",
                    "GET",
                    &endpoint,
                    "--jq",
                    "{id: .id, login: .login}",
                ],
            ),
            token,
            Duration::from_secs(5),
            |_| {},
        );
        let profile = match profile {
            Err(AuthState::CliMissing) => continue,
            Ok(profile) if profile.success => profile,
            _ => return None,
        };
        let url = avatar_url(&profile.stdout, login)?;
        return tauri::async_runtime::block_on(async {
            if token.is_cancelled() {
                return None;
            }
            let client = avatar_http_client().ok()?;
            let mut response = client.get(url).send().await.ok()?;
            if !response.status().is_success()
                || response
                    .content_length()
                    .is_some_and(|length| length > AVATAR_CAP as u64)
            {
                return None;
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.ok()? {
                if token.is_cancelled() || bytes.len().saturating_add(chunk.len()) > AVATAR_CAP {
                    return None;
                }
                bytes.extend_from_slice(&chunk);
            }
            avatar_data_url(&bytes)
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::OnceLock;

    fn fixture(scenario: &str) -> String {
        static BINARY: OnceLock<PathBuf> = OnceLock::new();
        let binary = BINARY.get_or_init(|| {
            let directory = std::env::temp_dir().join(format!("gitodile-gh-fixture-{}", std::process::id()));
            fs::create_dir_all(&directory).unwrap();
            let source = directory.join("fake.rs");
            fs::write(&source, r#"
use std::{env,io::{self,Write},thread,time::Duration};
fn main() {
    let exe=env::current_exe().unwrap();
    let scenario=exe.file_stem().unwrap().to_string_lossy();
    let args=env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|s|s=="--help") {
        println!("{}",if scenario=="old" {"--active"} else {"--active --json hosts"}); return;
    }
    if scenario=="long" { thread::sleep(Duration::from_secs(30)); return; }
    if args.get(1).map(String::as_str)==Some("token") {
        assert_eq!(args,["auth","token","--hostname","github.com","--user","FixtureUser"]);
        assert!(env::var_os("GH_DEBUG").is_none());
        assert!(env::var_os("GH_TOKEN").is_none());
        if scenario=="token-denied" { eprintln!("private_secret_error"); std::process::exit(1); }
        println!("fixture_secret_exact_account"); return;
    }
    if args.first().map(String::as_str)==Some("api") {
        assert_eq!(&args[..5],["api","--hostname","github.com","--method","GET"]);
        assert!(args[5].starts_with("users/"));
        assert_eq!(&args[6..],["--jq","{id: .id, login: .login}"]);
        // No avatar fetch during fixture runs; never contact the real CDN.
        println!("{{}}"); return;
    }
    if args.get(1).map(String::as_str)==Some("logout") {
        assert_eq!(args,["auth","logout","--hostname","github.com","--user","fixture-user"]);
        if scenario=="logout-denied" { std::process::exit(1); }
        std::fs::write(exe.with_extension("removed"), b"removed").unwrap(); return;
    }
    if args.get(1).map(String::as_str)==Some("switch") {
        assert_eq!(args,["auth","switch","--hostname","github.com","--user","another-user"]);
        if scenario=="switch-denied" { std::process::exit(1); }
        std::fs::write(exe.with_extension("switched"), b"switched").unwrap(); return;
    }
    if args.get(1).map(String::as_str)==Some("login") {
        assert_eq!(args, ["auth","login","--web","--hostname","github.com","--skip-ssh-key","--clipboard=false"]);
        eprintln!("{}", "x".repeat(100000));
        eprint!("! First copy your one-"); io::stderr().flush().unwrap();
        thread::sleep(Duration::from_millis(30));
        eprintln!("time code: ABCD-1234");
        eprintln!("Open this URL to continue in your web browser: https://github.com/login/device");
        io::stderr().flush().unwrap();
        if scenario=="denied" { std::process::exit(1); }
        return;
    }
    assert_eq!(args,["auth","status","--hostname","github.com","--json","hosts"]);
    if scenario=="logout-empty" { println!("{{\"hosts\":{{}}}}"); return; }
    if scenario=="logout-offline" || scenario=="switch-offline" { std::process::exit(1); }
    if scenario=="logout-switch" { println!("{{\"hosts\":{{\"github.com\":[{{\"state\":\"success\",\"active\":true,\"login\":\"another-user\",\"tokenSource\":\"keyring\"}}]}}}}"); return; }
    if scenario=="switch-accounts" { println!("{{\"hosts\":{{\"github.com\":[{{\"state\":\"success\",\"active\":true,\"login\":\"another-user\",\"tokenSource\":\"keyring\"}},{{\"state\":\"success\",\"active\":false,\"login\":\"fixture-user\",\"tokenSource\":\"keyring\"}}]}}}}"); return; }
    if scenario=="bad" { println!("not-json"); }
    else if scenario=="overflow" { print!("{}","x".repeat(100000)); }
    else { println!("{{\"hosts\":{{\"github.com\":[{{\"state\":\"success\",\"active\":true,\"login\":\"fixture-user\",\"tokenSource\":\"keyring\",\"token\":\"gho_do-not-expose\"}}]}}}}"); }
}
"#).unwrap();
            let executable = directory.join(if cfg!(windows) { "fake.exe" } else { "fake" });
            let output = Command::new("rustc").arg(&source).arg("-o").arg(&executable).output().unwrap();
            assert!(output.status.success(), "fixture compile failed: {}", String::from_utf8_lossy(&output.stderr));
            executable
        });
        let executable = binary.with_file_name(format!(
            "{scenario}{}",
            if cfg!(windows) { ".exe" } else { "" }
        ));
        fs::copy(binary, &executable).unwrap();
        executable.to_string_lossy().into_owned()
    }

    #[test]
    fn git_helper_lookup_requests_an_exact_case_preserved_saved_account() {
        let program = fixture("token");
        assert!(credential_with_programs(&[&program], "FixtureUser").is_some());
        let denied = fixture("token-denied");
        assert!(credential_with_programs(&[&denied], "FixtureUser").is_none());
        assert!(credential_with_programs(&[&program], "bad;command").is_none());
    }

    fn status(state: &str, source: &str, error: &str) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"hosts":{"github.com":[{
            "active":true,"state":state,"login":"octocat","host":"github.com",
            "tokenSource":source,"error":error,"token":"gho_secret_must_never_cross_ipc"
        }]}}))
        .unwrap()
    }

    #[test]
    fn status_is_structured_redacted_and_distinguishes_network_from_auth_failure() {
        for (source, storage) in [
            ("keyring", CredentialStorage::Secure),
            ("C:\\Users\\person\\hosts.yml", CredentialStorage::File),
            ("GH_TOKEN", CredentialStorage::Environment),
            ("unrecognized", CredentialStorage::Unknown),
        ] {
            let account = parse_status(&status("success", source, ""))
                .unwrap()
                .accounts[0]
                .account
                .clone();
            assert_eq!(account.storage, storage);
            let wire = serde_json::to_string(&account).unwrap();
            assert!(!wire.contains("secret"));
            assert!(!wire.contains("Users"));
        }
        assert_eq!(
            parse_status(br#"{"hosts":{}}"#).unwrap().state(),
            AuthState::SignedOut
        );
        assert_eq!(parse_status(b"bad-json"), Err(AuthState::Failed));
        assert_eq!(
            parse_status(&status("timeout", "keyring", "timeout"))
                .unwrap()
                .state(),
            AuthState::Offline
        );
        assert_eq!(
            parse_status(&status("error", "keyring", "HTTP 401: Bad credentials"))
                .unwrap()
                .state(),
            AuthState::Invalid
        );
        assert_eq!(
            parse_status(&status("error", "keyring", "connection refused"))
                .unwrap()
                .state(),
            AuthState::Offline
        );
        assert_eq!(
            parse_status(&status("unknown", "keyring", "")),
            Err(AuthState::Failed)
        );
    }

    #[test]
    fn all_accounts_are_decoded_without_secrets_and_inactive_failure_does_not_break_active_auth() {
        let bytes = serde_json::to_vec(&serde_json::json!({"hosts": {
            "github.com": [
                {"active": true, "state": "success", "login": "octocat", "tokenSource": "keyring", "token": "secret-active"},
                {"active": false, "state": "error", "login": "studio", "tokenSource": "oauth_token", "error": "HTTP 401: secret-detail", "token": "secret-inactive"}
            ], "other.example": [{"login": "private-enterprise-account", "token": "secret-enterprise"}]
        }})).unwrap();
        let result = parse_status(&bytes).unwrap();
        assert_eq!(result.state(), AuthState::Connected);
        assert_eq!(result.accounts.len(), 2);
        assert_eq!(result.accounts[1].state, AuthState::Invalid);
        assert_eq!(result.accounts[1].account.storage, CredentialStorage::File);
        let wire = serde_json::to_string(&result.accounts).unwrap();
        for secret in [
            "secret",
            "private-enterprise",
            "other.example",
            "oauth_token",
            "HTTP 401",
        ] {
            assert!(!wire.contains(secret));
        }
        assert!(wire.contains("\"active\":false"));
    }

    #[test]
    fn malformed_ambiguous_or_unbounded_account_lists_are_rejected() {
        let entry = serde_json::json!({"active": true, "state": "success", "login": "octocat", "tokenSource": "keyring"});
        for entries in [
            vec![
                entry.clone(),
                serde_json::json!({"active": true, "state": "success", "login": "studio"}),
            ],
            vec![
                entry.clone(),
                serde_json::json!({"active": false, "state": "success", "login": "OCTOCAT"}),
            ],
            vec![serde_json::json!({"active": false, "state": "success", "login": "studio"})],
            vec![serde_json::json!({"active": true, "state": "success", "login": "--all"})],
            vec![serde_json::json!({"active": true, "state": "success", "login": ""})],
            vec![entry; 33],
        ] {
            let bytes =
                serde_json::to_vec(&serde_json::json!({"hosts":{"github.com": entries}})).unwrap();
            assert_eq!(parse_status(&bytes), Err(AuthState::Failed));
        }
        let bytes = br#"{"hosts":{"github.com":[{"active":true,"state":"error","login":"","tokenSource":"GH_TOKEN","error":"HTTP 401"}]}}"#;
        assert_eq!(parse_status(bytes), Err(AuthState::Invalid));
    }

    #[test]
    fn environment_override_of_a_saved_username_has_one_controlling_identity() {
        let bytes = br#"{"hosts":{"github.com":[{"active":true,"state":"success","login":"octocat","tokenSource":"GH_TOKEN"},{"active":false,"state":"success","login":"octocat","tokenSource":"keyring"}]}}"#;
        let result = parse_status(bytes).unwrap();
        assert_eq!(result.accounts.len(), 1);
        assert_eq!(
            result.accounts[0].account.storage,
            CredentialStorage::Environment
        );
    }

    #[test]
    fn device_code_parser_accepts_only_the_expected_ephemeral_code() {
        assert_eq!(
            parse_device_code("! First copy your one-time code: ABCD-1234\r"),
            Some("ABCD-1234".into())
        );
        for line in [
            "! First copy your one-time code: gho_secret",
            "ABCD-1234",
            "! First copy your one-time code: https://evil.example",
            "! First copy your one-time code: ABCD-1234-extra",
        ] {
            assert_eq!(parse_device_code(line), None);
        }
        read_login_lines(
            "! First copy your one-time code: ABCD-1234\n".as_bytes(),
            |code| {
                /* reader callbacks don't retain raw output */
                assert_eq!(code, "ABCD-1234");
            },
        );
    }

    #[test]
    fn bounded_fake_gh_login_streams_code_and_returns_only_account_metadata() {
        let program = fixture("login");
        let codes = Mutex::new(Vec::new());
        let account =
            authenticate_with_programs(&[&program], &CancellationToken::default(), true, |code| {
                codes.lock().unwrap().push(code)
            })
            .unwrap();
        assert_eq!(*codes.lock().unwrap(), ["ABCD-1234"]);
        assert_eq!(account.accounts[0].account.login, "fixture-user");
        assert!(!serde_json::to_string(&account.accounts)
            .unwrap()
            .contains("do-not-expose"));
    }

    #[test]
    fn incompatible_missing_broken_and_denied_tools_are_reported_without_fallback_masking() {
        for (scenario, expected) in [
            ("old", AuthState::CliUnsupported),
            ("bad", AuthState::Failed),
            ("overflow", AuthState::Failed),
            ("denied", AuthState::Failed),
        ] {
            let program = fixture(scenario);
            assert_eq!(
                authenticate_with_programs(
                    &[&program],
                    &CancellationToken::default(),
                    scenario == "denied",
                    |_| {}
                ),
                Err(expected)
            );
        }
        assert_eq!(
            authenticate_with_programs(
                &["gitodile-nonexistent-gh-fixture"],
                &CancellationToken::default(),
                false,
                |_| {}
            ),
            Err(AuthState::CliMissing)
        );
        let compatible = fixture("compatible-fallback");
        let old = fixture("old");
        // A missing first path permits a fallback, but an incompatible tool does not.
        assert!(authenticate_with_programs(
            &["gitodile-nonexistent-gh-fixture", &compatible],
            &CancellationToken::default(),
            false,
            |_| {}
        )
        .is_ok());
        assert_eq!(
            authenticate_with_programs(
                &[&old, &compatible],
                &CancellationToken::default(),
                false,
                |_| {}
            ),
            Err(AuthState::CliUnsupported)
        );
    }

    #[test]
    fn fake_process_timeout_and_cancellation_reap_the_child() {
        let program = fixture("long");
        let token = CancellationToken::default();
        assert!(matches!(
            run(
                gh_command(&program, &["auth", "status"]),
                &token,
                Duration::from_millis(100),
                |_| {}
            ),
            Err(AuthState::TimedOut)
        ));
        let cancel = token.clone();
        let helper = thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            cancel.cancel();
        });
        assert!(matches!(
            run(
                gh_command(&program, &["auth", "status"]),
                &token,
                Duration::from_secs(5),
                |_| {}
            ),
            Err(AuthState::Cancelled)
        ));
        helper.join().unwrap();
    }

    #[test]
    fn exact_operation_cancellation_keeps_the_worker_busy_until_it_finishes() {
        let service = GitHubAuthService::default();
        let token = CancellationToken::default();
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.state = AuthState::LoginStarting;
            inner.snapshot.operation_id = Some("github-auth-1".into());
            inner.cancellation = Some(token.clone());
        }
        service.cancel("other-id");
        assert!(!token.is_cancelled());
        service.publish_code("other-id", "ZZZZ-9999".into());
        assert!(service.snapshot().device_code.is_none());
        service.publish_code("github-auth-1", "ABCD-1234".into());
        assert_eq!(service.cancel("github-auth-1").state, AuthState::Cancelling);
        assert!(token.is_cancelled());
        assert_eq!(service.check().state, AuthState::Cancelling);
        service.finish("github-auth-1", Err(AuthState::Cancelled), true, None);
        let snapshot = service.snapshot();
        assert!(snapshot.needs_check);
        assert!(snapshot.device_code.is_none());
        assert_eq!(snapshot.state, AuthState::Cancelled);
    }

    #[test]
    fn offline_check_keeps_last_identity_and_does_not_claim_it_is_verified() {
        let service = GitHubAuthService::default();
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.account = Some(
                parse_status(&status("success", "keyring", ""))
                    .unwrap()
                    .accounts[0]
                    .account
                    .clone(),
            );
            inner.snapshot.accounts = parse_status(&status("success", "keyring", ""))
                .unwrap()
                .accounts;
            inner.snapshot.operation_id = Some("github-auth-1".into());
        }
        service.finish("github-auth-1", Err(AuthState::Offline), false, None);
        assert_eq!(service.snapshot().account.unwrap().login, "octocat");
        assert_eq!(service.snapshot().state, AuthState::Offline);
        let provider = GhAccessProvider(service.clone());
        assert_eq!(service.snapshot().accounts[0].state, AuthState::Offline);
        assert!(!provider.accounts()[0].available);
        service.0.lock().unwrap().snapshot.operation_id = Some("check-again".into());
        service.finish(
            "check-again",
            parse_status(&status("success", "keyring", "")),
            false,
            None,
        );
        assert!(provider.accounts()[0].available);
    }

    #[test]
    fn logout_targets_only_the_confirmed_user_and_reads_the_next_active_account() {
        for (scenario, expected) in [
            ("logout-empty", Ok(AuthState::SignedOut)),
            ("logout-offline", Err(AuthState::Offline)),
            ("logout-denied", Err(AuthState::Failed)),
        ] {
            let program = fixture(scenario);
            let marker = std::path::Path::new(&program).with_extension("removed");
            let _ = fs::remove_file(&marker);
            let (removed, result) =
                logout_with_programs(&[&program], &CancellationToken::default(), "fixture-user");
            assert_eq!(result.map(|accounts| accounts.state()), expected);
            assert_eq!(removed, scenario != "logout-denied");
            assert_eq!(marker.exists(), removed);
        }
        let program = fixture("logout-switch");
        let (removed, result) =
            logout_with_programs(&[&program], &CancellationToken::default(), "fixture-user");
        assert!(removed);
        assert_eq!(result.unwrap().accounts[0].account.login, "another-user");
        assert_eq!(
            logout_with_programs(&[&program], &CancellationToken::default(), "--all"),
            (false, Err(AuthState::Failed))
        );
    }

    #[test]
    fn switch_is_exact_noninteractive_and_requires_a_truthful_post_mutation_check() {
        let program = fixture("switch-accounts");
        let result =
            switch_with_programs(&[&program], &CancellationToken::default(), "another-user")
                .unwrap();
        assert_eq!(result.accounts.len(), 2);
        assert_eq!(result.accounts[0].account.login, "another-user");
        assert!(result.accounts[0].active);
        assert_eq!(result.state(), AuthState::Connected);
        assert!(std::path::Path::new(&program)
            .with_extension("switched")
            .exists());
        for (scenario, state) in [
            ("switch-denied", AuthState::Failed),
            ("switch-offline", AuthState::Offline),
            ("switch-raced", AuthState::Failed),
        ] {
            let program = fixture(scenario);
            assert_eq!(
                switch_with_programs(&[&program], &CancellationToken::default(), "another-user"),
                Err(state)
            );
        }
        assert_eq!(
            switch_with_programs(&[&program], &CancellationToken::default(), "--all"),
            Err(AuthState::Failed)
        );
    }

    #[test]
    fn account_refresh_reuses_each_id_avatar_and_failed_inactive_logout_preserves_the_active_identity(
    ) {
        let service = GitHubAuthService::default();
        let bytes = br#"{"hosts":{"github.com":[{"active":true,"state":"success","login":"octocat","tokenSource":"keyring"},{"active":false,"state":"success","login":"studio","tokenSource":"keyring"}]}}"#;
        let mut previous = parse_status(bytes).unwrap();
        previous.accounts[0].account.avatar_data_url = Some("cached-octocat".into());
        previous.accounts[1].account.avatar_data_url = Some("cached-studio".into());
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.accounts = previous.accounts;
            inner.snapshot.operation_id = Some("check-1".into());
        }
        service.finish("check-1", parse_status(bytes), false, None);
        let snapshot = service.snapshot();
        assert_eq!(
            snapshot.accounts[1].account.avatar_data_url.as_deref(),
            Some("cached-studio")
        );
        assert_eq!(
            snapshot.account.unwrap().avatar_data_url.as_deref(),
            Some("cached-octocat")
        );
        service.0.lock().unwrap().snapshot.operation_id = Some("logout-2".into());
        service.finish(
            "logout-2",
            Err(AuthState::Offline),
            true,
            Some("studio".into()),
        );
        let snapshot = service.snapshot();
        assert_eq!(snapshot.accounts.len(), 1);
        assert_eq!(snapshot.account.unwrap().login, "octocat");
        assert!(snapshot.needs_check);
        assert_eq!(snapshot.state, AuthState::Offline);
    }

    #[test]
    fn uncertain_or_environment_account_switch_is_refused_before_starting_a_process() {
        let service = GitHubAuthService::default();
        let mut accounts = parse_status(&status("success", "keyring", ""))
            .unwrap()
            .accounts;
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.accounts = accounts.clone();
            inner.snapshot.needs_check = true;
        }
        assert_eq!(service.switch("octocat".into()).state, AuthState::Failed);
        assert!(service.snapshot().operation_id.is_none());
        accounts[0].account.storage = CredentialStorage::Environment;
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.accounts = accounts;
            inner.snapshot.needs_check = false;
        }
        assert!(matches!(
            service.switch("octocat".into()).state,
            AuthState::Failed | AuthState::EnvironmentControlled
        ));
        assert!(service.snapshot().operation_id.is_none());
    }

    #[test]
    fn logout_rejects_a_stale_or_environment_controlled_confirmation() {
        let service = GitHubAuthService::default();
        service.0.lock().unwrap().snapshot.account = Some(
            parse_status(&status("success", "keyring", ""))
                .unwrap()
                .accounts[0]
                .account
                .clone(),
        );
        assert_eq!(
            service.logout("another-user".into()).state,
            AuthState::Failed
        );
        assert!(service.snapshot().operation_id.is_none());
        service.0.lock().unwrap().snapshot.account = Some(
            parse_status(&status("success", "GH_TOKEN", ""))
                .unwrap()
                .accounts[0]
                .account
                .clone(),
        );
        assert!(matches!(
            service.logout("octocat".into()).state,
            AuthState::Failed | AuthState::EnvironmentControlled
        ));
        assert!(service.snapshot().operation_id.is_none());
    }

    #[test]
    fn removed_identity_is_cleared_even_when_the_followup_check_fails() {
        let service = GitHubAuthService::default();
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.account = Some(
                parse_status(&status("success", "keyring", ""))
                    .unwrap()
                    .accounts[0]
                    .account
                    .clone(),
            );
            inner.snapshot.operation_id = Some("logout-1".into());
        }
        service.finish(
            "logout-1",
            Err(AuthState::Offline),
            true,
            Some("octocat".into()),
        );
        let snapshot = service.snapshot();
        assert!(snapshot.account.is_none());
        assert_eq!(snapshot.signed_out_account.as_deref(), Some("octocat"));
        assert!(snapshot.needs_check);
        assert_eq!(snapshot.state, AuthState::Offline);
    }

    #[test]
    fn failed_check_keeps_mutation_uncertainty_until_a_verified_account_list_arrives() {
        let service = GitHubAuthService::default();
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.needs_check = true;
            inner.snapshot.operation_id = Some("retry-1".into());
        }
        service.finish("retry-1", Err(AuthState::Offline), false, None);
        assert!(service.snapshot().needs_check);
        service.0.lock().unwrap().snapshot.operation_id = Some("retry-2".into());
        service.finish(
            "retry-2",
            parse_status(&status("success", "keyring", "")),
            false,
            None,
        );
        assert!(!service.snapshot().needs_check);
        assert_eq!(service.snapshot().state, AuthState::Connected);
    }

    #[test]
    fn avatar_boundary_rejects_external_urls_svg_oversize_and_mismatched_identity() {
        assert_eq!(
            avatar_url(
                br#"{"id":42,"login":"octocat","avatar_url":"https://evil.example"}"#,
                "octocat"
            ),
            Some("https://avatars.githubusercontent.com/u/42?s=96".into())
        );
        for json in [
            br#"{"id":42,"login":"another-user"}"#.as_slice(),
            br#"{"id":0,"login":"octocat"}"#,
            br#"{"id":"https://evil.example","login":"octocat"}"#,
        ] {
            assert!(avatar_url(json, "octocat").is_none());
        }
        assert!(avatar_data_url(b"<svg onload='steal()'>").is_none());
        let mut oversize = vec![0; AVATAR_CAP + 1];
        oversize[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        assert!(avatar_data_url(&oversize).is_none());
        assert_eq!(
            avatar_data_url(b"\x89PNG\r\n\x1a\n"),
            Some("data:image/png;base64,iVBORw0KGgo=".into())
        );
        let program = fixture("profile-unavailable");
        assert!(fetch_avatar(&[&program], &CancellationToken::default(), "octocat").is_none());
    }

    #[test]
    fn avatar_can_be_the_first_http_client_without_an_update_check() {
        tauri::async_runtime::block_on(async {
            assert!(avatar_http_client().is_ok());
        });
    }

    #[test]
    fn unexpected_worker_failure_releases_the_busy_state_and_clears_the_code() {
        let service = GitHubAuthService::default();
        {
            let mut inner = service.0.lock().unwrap();
            inner.snapshot.operation_id = Some("panic-1".into());
            inner.snapshot.state = AuthState::AwaitingBrowser;
            inner.snapshot.device_code = Some("ABCD-1234".into());
        }
        service.complete_work("panic-1", true, || panic!("fixture worker failure"));
        let snapshot = service.snapshot();
        assert_eq!(snapshot.state, AuthState::Failed);
        assert!(snapshot.operation_id.is_none());
        assert!(snapshot.device_code.is_none());
        assert!(snapshot.needs_check);
    }

    #[test]
    fn command_plan_is_noninteractive_and_cannot_change_git_credentials_or_leak_debug_output() {
        let command = gh_command("gh", &["auth", "status", "--help"]);
        let removed = command
            .get_envs()
            .filter_map(|(key, value)| {
                value
                    .is_none()
                    .then_some(key.to_string_lossy().into_owned())
            })
            .collect::<Vec<_>>();
        for key in ["GH_DEBUG", "DEBUG", "GH_HOST", "GH_REPO", "GH_FORCE_TTY"] {
            assert!(removed.contains(&key.into()));
        }
        assert_eq!(
            command.get_current_dir(),
            Some(std::env::temp_dir().as_path())
        );
    }
}
