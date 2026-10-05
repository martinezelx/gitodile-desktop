//! Provider-neutral account selection and process-scoped Git credentials.
//! No secret is serialized, persisted here, or included in Git's environment.

use crate::error::{AppError, AppErrorCode};
use crate::repository_access::PathIdentity;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::ffi::{OsStr, OsString};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use zeroize::Zeroize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Account {
    pub(crate) id: String,
    pub(crate) provider: String,
    pub(crate) host: String,
    pub(crate) login: String,
    pub(crate) avatar_data_url: Option<String>,
    pub(crate) available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) unavailable_reason: Option<AppErrorCode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountCatalog {
    pub(crate) providers: Vec<ProviderDescriptor>,
    pub(crate) accounts: Vec<Account>,
    pub(crate) busy: bool,
}

#[derive(Serialize)]
pub(crate) struct ProviderDescriptor {
    id: &'static str,
    host: &'static str,
}

/// Implemented by a hosting adapter; the account store and Git bridge do not
/// know how a provider authenticates or where it keeps its secret.
pub(crate) trait AccessProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn host(&self) -> &'static str;
    fn accounts(&self) -> Vec<Account>;
    fn busy(&self) -> bool;
    fn check(&self);
    fn credential(&self, login: &str) -> Option<Secret>;
    fn username(&self, account_key: &str) -> Option<String> {
        Some(account_key.to_owned())
    }
}

/// Intentionally neither Debug nor Serialize. Native helpers use this in their
/// private Git pipe or HTTP headers; provider-owned storage is authoritative.
pub(crate) struct Secret(Vec<u8>);
impl Secret {
    pub(crate) fn bytes(&self) -> &[u8] {
        &self.0
    }
    pub(crate) fn from_bytes(mut bytes: Vec<u8>) -> Option<Self> {
        while bytes.last().is_some_and(u8::is_ascii_whitespace) {
            bytes.pop();
        }
        if bytes.len() < 16
            || bytes.len() > 4096
            || !bytes.iter().all(|b| (0x21..=0x7e).contains(b))
        {
            bytes.zeroize();
            return None;
        }
        Some(Self(bytes))
    }
}
impl Drop for Secret {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct Selections {
    version: u8,
    projects: BTreeMap<String, BTreeMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectAccount {
    pub(crate) account_id: Option<String>,
}

pub(crate) struct AccountService {
    path: PathBuf,
    providers: Vec<Arc<dyn AccessProvider>>,
    selections: Mutex<Result<Selections, ()>>,
}
static GLOBAL: OnceLock<Arc<AccountService>> = OnceLock::new();

pub(crate) fn install(
    path: PathBuf,
    providers: Vec<Arc<dyn AccessProvider>>,
) -> Arc<AccountService> {
    let service = Arc::new(AccountService::new(path, providers));
    let _ = GLOBAL.set(service.clone());
    service
}

fn error() -> AppError {
    AppError::new(
        AppErrorCode::AuthenticationFailed,
        "This project's account could not be used.",
    )
    .with_remediation("Check the account in Settings, then select it again in project settings.")
}

fn project_key(path: &Path) -> Result<String, AppError> {
    let identity = PathIdentity::new(path)?;
    Ok(Sha256::digest(identity.match_key().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn split_account(id: &str) -> Option<(&str, &str)> {
    let (provider, login) = id.split_once(':')?;
    if provider.is_empty()
        || provider.len() > 32
        || login.is_empty()
        || login.len() > 100
        || !provider
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b == b'-')
        || !login
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return None;
    }
    Some((provider, login))
}

impl AccountService {
    fn new(path: PathBuf, providers: Vec<Arc<dyn AccessProvider>>) -> Self {
        let selections = match fs::File::open(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Selections {
                version: 1,
                ..Selections::default()
            }),
            Err(_) => Err(()),
            Ok(file) => {
                let mut bytes = Vec::new();
                let read = file.take(256 * 1024 + 1).read_to_end(&mut bytes);
                if read.is_err() || bytes.len() > 256 * 1024 {
                    Err(())
                } else {
                    serde_json::from_slice::<Selections>(&bytes)
                        .map_err(|_| ())
                        .and_then(|s| {
                            if s.version == 1
                                && s.projects.len() <= 2048
                                && s.projects.iter().all(|(key, bindings)| {
                                    key.len() == 64
                                        && key.bytes().all(|b| b.is_ascii_hexdigit())
                                        && bindings.len() <= 32
                                        && bindings.iter().all(|(provider, account)| {
                                            split_account(account)
                                                .is_some_and(|(id, _)| id == provider)
                                        })
                                })
                            {
                                Ok(s)
                            } else {
                                Err(())
                            }
                        })
                }
            }
        };
        Self {
            path,
            providers,
            selections: Mutex::new(selections),
        }
    }

    pub(crate) fn catalog(&self) -> AccountCatalog {
        AccountCatalog {
            providers: self
                .providers
                .iter()
                .map(|p| ProviderDescriptor {
                    id: p.id(),
                    host: p.host(),
                })
                .collect(),
            accounts: self.providers.iter().flat_map(|p| p.accounts()).collect(),
            busy: self.providers.iter().any(|p| p.busy()),
        }
    }

    pub(crate) fn check(&self, provider: &str) -> Result<AccountCatalog, AppError> {
        self.providers
            .iter()
            .find(|p| p.id() == provider)
            .ok_or_else(error)?
            .check();
        Ok(self.catalog())
    }

    pub(crate) fn validate(&self, account: &str) -> Result<(), AppError> {
        if !self
            .catalog()
            .accounts
            .iter()
            .any(|a| a.id == account && a.available)
        {
            return Err(error());
        }
        Ok(())
    }

    pub(crate) fn selection(
        &self,
        path: &Path,
        provider: &str,
    ) -> Result<ProjectAccount, AppError> {
        if !self.providers.iter().any(|p| p.id() == provider) {
            return Err(error());
        }
        let key = project_key(path)?;
        let state = self.selections.lock().unwrap_or_else(|e| e.into_inner());
        let state = state.as_ref().map_err(|_| error())?;
        Ok(ProjectAccount {
            account_id: state
                .projects
                .get(&key)
                .and_then(|p| p.get(provider))
                .cloned(),
        })
    }

    fn bindings(&self, path: &Path) -> Result<Vec<String>, AppError> {
        let key = project_key(path)?;
        let state = self.selections.lock().unwrap_or_else(|e| e.into_inner());
        let state = state.as_ref().map_err(|_| error())?;
        // Keep bindings even if an adapter is no longer registered. The
        // transfer must fail rather than quietly drop an explicit identity.
        Ok(state
            .projects
            .get(&key)
            .map(|bindings| bindings.values().cloned().collect())
            .unwrap_or_default())
    }

    pub(crate) fn select(
        &self,
        path: &Path,
        provider: &str,
        account: Option<&str>,
        expected: Option<&str>,
    ) -> Result<ProjectAccount, AppError> {
        if !self.providers.iter().any(|p| p.id() == provider) {
            return Err(error());
        }
        if let Some(account) = account {
            self.validate(account)?;
            if split_account(account).map(|(p, _)| p) != Some(provider) {
                return Err(error());
            }
        }
        let key = project_key(path)?;
        let mut guard = self.selections.lock().unwrap_or_else(|e| e.into_inner());
        let previous = guard.as_ref().map_err(|_| error())?;
        if previous
            .projects
            .get(&key)
            .and_then(|p| p.get(provider))
            .map(String::as_str)
            != expected
        {
            return Err(AppError::new(
                AppErrorCode::StalePreview,
                "The project's account changed. Check it before choosing again.",
            ));
        }
        let mut next = previous.clone();
        let accounts = next.projects.entry(key.clone()).or_default();
        if let Some(account) = account {
            accounts.insert(provider.to_owned(), account.to_owned());
        } else {
            accounts.remove(provider);
        }
        if accounts.is_empty() {
            next.projects.remove(&key);
        }
        if next.projects.len() > 2048 {
            return Err(error());
        }
        self.persist(&next)?;
        *guard = Ok(next);
        Ok(ProjectAccount {
            account_id: account.map(str::to_owned),
        })
    }

    fn persist(&self, next: &Selections) -> Result<(), AppError> {
        let bytes = serde_json::to_vec(next).map_err(|_| error())?;
        if bytes.len() > 256 * 1024 {
            return Err(error());
        }
        let parent = self.path.parent().ok_or_else(error)?;
        fs::create_dir_all(parent).map_err(|_| error())?;
        let temporary = self.path.with_extension("new");
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| error())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| error())?;
        drop(file);
        // Same-directory replacement keeps the last binding intact if writing
        // or replacing fails. std::fs::rename replaces files on Windows too.
        fs::rename(temporary, &self.path).map_err(|_| error())
    }
}

pub(crate) fn global() -> Result<&'static Arc<AccountService>, AppError> {
    GLOBAL.get().ok_or_else(error)
}

pub(crate) fn read_project(path: &str, provider: &str) -> Result<ProjectAccount, AppError> {
    let (context, _access) =
        crate::application::authorize_repository(path, "read_project_account", None)?;
    global()?.selection(context.worktree_root.backend_path(), provider)
}

pub(crate) fn set_project(
    path: &str,
    provider: &str,
    account: Option<&str>,
    expected: Option<&str>,
) -> Result<ProjectAccount, AppError> {
    let (context, _access) =
        crate::application::authorize_repository(path, "set_project_account", None)?;
    global()?.select(
        context.worktree_root.backend_path(),
        provider,
        account,
        expected,
    )
}

/// Own the binding for the entire operation. Changing project preferences
/// during a transfer cannot make its helper answer with a different identity.
pub(crate) fn for_project(path: &Path) -> Result<Vec<String>, AppError> {
    let Some(service) = GLOBAL.get() else {
        return Ok(Vec::new());
    };
    service.bindings(path)
}

pub(crate) fn validate_clone_account(id: Option<&str>, source: &str) -> Result<(), AppError> {
    let Some(id) = id else {
        return Ok(());
    };
    let service = global()?;
    service.validate(id)?;
    let (provider, _) = split_account(id).ok_or_else(error)?;
    let adapter = service
        .providers
        .iter()
        .find(|p| p.id() == provider)
        .ok_or_else(error)?;
    validate_clone_source(source, adapter.host())
}

fn validate_clone_source(source: &str, host: &str) -> Result<(), AppError> {
    let url = reqwest::Url::parse(source).map_err(|_| error())?;
    if url.scheme() != "https"
        || url.host_str() != Some(host)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
    {
        return Err(error());
    }
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn selected_hosts(prepared: &[OsString]) -> Vec<&str> {
    prepared
        .iter()
        .filter_map(|argument| argument.to_str())
        .filter_map(|argument| argument.strip_prefix("credential.https://"))
        .filter_map(|argument| argument.strip_suffix(".helper="))
        .collect()
}

/// An existing authenticated URL bypasses Git's helper entirely. Refuse that
/// combination rather than pretend the selected identity governed the transfer.
fn validate_url(raw_url: &str, hosts: &[&str]) -> Result<(), AppError> {
    let Ok(url) = reqwest::Url::parse(raw_url) else {
        return Ok(());
    };
    if url.host_str().is_some_and(|host| hosts.contains(&host)) {
        if url.scheme() == "http" || (url.scheme() == "https" && url.port().is_some()) {
            // Git's exact HTTPS helper scope does not match HTTP or other ports.
            // Refuse those URLs instead of falling back to another account.
            return Err(error().with_remediation("Use this provider's standard HTTPS address to access it with the selected account."));
        }
        if url.scheme() == "https"
            && (!url.username().is_empty() || url.password().is_some() || url.query().is_some())
        {
            return Err(error().with_remediation("Remove embedded sign-in details from the remote address before using this project's selected account."));
        }
    }
    Ok(())
}

pub(crate) fn validate_transfer_urls(
    args: &[OsString],
    prepared: &[OsString],
) -> Result<(), AppError> {
    let hosts = selected_hosts(prepared);
    for argument in args.iter().filter_map(|arg| arg.to_str()) {
        validate_url(argument, &hosts)?;
    }
    Ok(())
}

pub(crate) fn validate_remote_urls(bytes: &[u8], prepared: &[OsString]) -> Result<(), AppError> {
    let hosts = selected_hosts(prepared);
    let text = std::str::from_utf8(bytes).map_err(|_| error())?;
    for line in text.lines() {
        let Some((_, rest)) = line.split_once('\t') else {
            continue;
        };
        let Some((raw_url, _)) = rest.rsplit_once(' ') else {
            continue;
        };
        validate_url(raw_url, &hosts)?;
    }
    Ok(())
}

pub(crate) fn header_overrides(
    names: &[u8],
    prepared: &[OsString],
) -> Result<Vec<OsString>, AppError> {
    let hosts = selected_hosts(prepared);
    let names = std::str::from_utf8(names).map_err(|_| error())?;
    if names.len() > 16 * 1024 {
        return Err(error());
    }
    let mut overrides = Vec::new();
    for key in names.split('\0').filter(|key| !key.is_empty()) {
        let Some(scope) = key
            .strip_prefix("http.")
            .and_then(|key| key.strip_suffix(".extraheader"))
        else {
            continue;
        };
        if key.chars().any(char::is_control) {
            return Err(error());
        }
        // The base host reset already masks unqualified headers. Mask more
        // specific URL headers too, so they cannot bypass the chosen identity.
        let Ok(url) = reqwest::Url::parse(scope) else {
            return Err(error());
        };
        if url.scheme() == "https"
            && url.host_str().is_some_and(|host| {
                hosts
                    .iter()
                    .any(|selected| host.eq_ignore_ascii_case(selected))
            })
        {
            overrides.extend([OsString::from("-c"), OsString::from(format!("{key}="))]);
        } else if scope.contains('*') {
            // Git's wildcard URL patterns cannot be treated as an exact host.
            // Preserve those settings and refuse an unsafe identity override.
            return Err(error());
        }
    }
    Ok(overrides)
}

pub(crate) fn configure(process: &mut Command, accounts: &[String]) -> Result<(), AppError> {
    if accounts.is_empty() {
        return Ok(());
    }
    let service = global()?;
    let exe = std::env::current_exe().map_err(|_| error())?;
    let exe = exe.to_str().ok_or_else(error)?.replace('\\', "/");
    for id in accounts {
        let (provider, login) = split_account(id).ok_or_else(error)?;
        let adapter = service
            .providers
            .iter()
            .find(|p| p.id() == provider)
            .ok_or_else(error)?;
        let host = adapter.host();
        let username = adapter.username(login).ok_or_else(error)?;
        let helper = format!(
            "!{} --gitodile-credential-helper {}",
            shell_quote(&exe),
            shell_quote(id)
        );
        // URL-specific reset overrides existing helpers only for this host.
        // Git executes its helper protocol, never a renderer-supplied shell.
        for setting in [
            format!("credential.https://{host}.helper="),
            format!("credential.https://{host}.helper={helper}"),
            format!("credential.https://{host}.username={username}"),
            format!("http.https://{host}/.extraHeader="),
        ] {
            process.arg("-c").arg(setting);
        }
    }
    Ok(())
}

pub(crate) fn is_transfer(args: &[OsString]) -> bool {
    args.first()
        .and_then(|a| a.to_str())
        .is_some_and(|a| matches!(a, "clone" | "fetch" | "push" | "pull" | "ls-remote"))
}

thread_local! { static OVERRIDE: std::cell::RefCell<Option<Vec<String>>> = const { std::cell::RefCell::new(None) }; }
pub(crate) fn with_accounts<T>(accounts: Vec<String>, run: impl FnOnce() -> T) -> T {
    struct Guard(Option<Vec<String>>);
    impl Drop for Guard {
        fn drop(&mut self) {
            OVERRIDE.with(|s| *s.borrow_mut() = self.0.take());
        }
    }
    let _guard = Guard(OVERRIDE.with(|s| s.replace(Some(accounts))));
    run()
}

pub(crate) fn transfer_args(
    cwd: Option<&Path>,
    args: &[OsString],
) -> Result<Vec<OsString>, AppError> {
    if !is_transfer(args) {
        return Ok(args.to_vec());
    }
    let accounts = OVERRIDE.with(|s| s.borrow().clone());
    let accounts = match accounts {
        Some(a) => a,
        None => cwd.map(for_project).transpose()?.unwrap_or_default(),
    };
    let mut process = Command::new("git");
    configure(&mut process, &accounts)?;
    Ok(process
        .get_args()
        .map(OsStr::to_os_string)
        .chain(args.iter().cloned())
        .collect())
}

/// An internal binary entrypoint. The request is bounded and matched to the
/// adapter's exact HTTPS host before that adapter may read any secret.
pub(crate) fn helper(
    providers: &[Arc<dyn AccessProvider>],
    id: &str,
    operation: &OsStr,
    input: impl Read,
    mut output: impl Write,
) -> Result<(), ()> {
    if operation == "store" || operation == "erase" {
        return Ok(());
    }
    if operation != "get" {
        return Err(());
    }
    let (provider, login) = split_account(id).ok_or(())?;
    let adapter = providers.iter().find(|p| p.id() == provider).ok_or(())?;
    let mut bytes = Vec::new();
    input.take(8193).read_to_end(&mut bytes).map_err(|_| ())?;
    if bytes.len() > 8192 || bytes.contains(&0) {
        return Err(());
    }
    let mut fields = BTreeMap::new();
    for line in bytes
        .split(|byte| *byte == b'\n')
        .map(|line| line.strip_suffix(b"\r").unwrap_or(line))
        .take_while(|line| !line.is_empty())
    {
        let separator = line.iter().position(|byte| *byte == b'=').ok_or(())?;
        let (key, value) = (&line[..separator], &line[separator + 1..]);
        // Git discards unsupported attributes. Only these scalar fields govern
        // our password lookup; opaque extensions and HTTP challenges may repeat
        // and need not be UTF-8. Never interpret them as identity or echo them.
        if !matches!(key, b"protocol" | b"host" | b"username") {
            continue;
        }
        let key = std::str::from_utf8(key).map_err(|_| ())?;
        let value = std::str::from_utf8(value).map_err(|_| ())?;
        if value.chars().any(char::is_control) {
            return Err(());
        }
        if fields.insert(key, value).is_some() {
            return Err(());
        }
    }
    let matches_host = fields.get("host").is_some_and(|host| {
        host.eq_ignore_ascii_case(adapter.host())
            || host.eq_ignore_ascii_case(&format!("{}:443", adapter.host()))
    });
    let username = adapter.username(login).ok_or(())?;
    if fields.get("protocol") != Some(&"https")
        || !matches_host
        || fields
            .get("username")
            .is_some_and(|u| !u.is_empty() && !u.eq_ignore_ascii_case(&username))
    {
        return Err(());
    }
    let secret = adapter.credential(login).ok_or(())?;
    write!(output, "username={username}\npassword=").map_err(|_| ())?;
    output
        .write_all(&secret.0)
        .and_then(|_| output.write_all(b"\n\n"))
        .map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct FakeProvider {
        provider: &'static str,
        host: &'static str,
        reads: AtomicUsize,
    }
    impl AccessProvider for FakeProvider {
        fn id(&self) -> &'static str {
            self.provider
        }
        fn host(&self) -> &'static str {
            self.host
        }
        fn accounts(&self) -> Vec<Account> {
            ["Personal", "work"]
                .iter()
                .map(|login| Account {
                    id: format!("{}:{login}", self.provider),
                    provider: self.provider.into(),
                    host: self.host.into(),
                    login: (*login).into(),
                    avatar_data_url: None,
                    available: true,
                    unavailable_reason: None,
                })
                .collect()
        }
        fn busy(&self) -> bool {
            false
        }
        fn check(&self) {}
        fn credential(&self, login: &str) -> Option<Secret> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Secret::from_bytes(format!("test-secret-for-{login}").into_bytes())
        }
    }
    fn provider(id: &'static str, host: &'static str) -> Arc<FakeProvider> {
        Arc::new(FakeProvider {
            provider: id,
            host,
            reads: AtomicUsize::new(0),
        })
    }
    fn scratch() -> PathBuf {
        static SEQUENCE: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "gitodile-account-test-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(path.join("personal")).unwrap();
        fs::create_dir_all(path.join("work")).unwrap();
        path
    }

    #[test]
    fn project_preferences_are_isolated_persistent_and_share_the_provider_contract() {
        let root = scratch();
        let github = provider("github", "github.com");
        let gitlab = provider("gitlab", "gitlab.com");
        let adapters: Vec<Arc<dyn AccessProvider>> = vec![github.clone(), gitlab.clone()];
        let path = root.join("accounts.json");
        let service = AccountService::new(path.clone(), adapters.clone());
        service
            .select(
                &root.join("personal"),
                "github",
                Some("github:Personal"),
                None,
            )
            .unwrap();
        service
            .select(&root.join("work"), "github", Some("github:work"), None)
            .unwrap();
        service
            .select(&root.join("personal"), "gitlab", Some("gitlab:work"), None)
            .unwrap();
        let restored = AccountService::new(path.clone(), adapters);
        assert_eq!(
            restored.bindings(&root.join("personal")).unwrap(),
            ["github:Personal", "gitlab:work"]
        );
        let without_gitlab = AccountService::new(path.clone(), vec![github.clone()]);
        assert_eq!(
            without_gitlab.bindings(&root.join("personal")).unwrap(),
            ["github:Personal", "gitlab:work"]
        );
        assert_eq!(
            restored
                .selection(&root.join("personal"), "github")
                .unwrap()
                .account_id
                .as_deref(),
            Some("github:Personal")
        );
        assert_eq!(
            restored
                .selection(&root.join("work"), "github")
                .unwrap()
                .account_id
                .as_deref(),
            Some("github:work")
        );
        assert_eq!(
            restored
                .selection(&root.join("personal"), "gitlab")
                .unwrap()
                .account_id
                .as_deref(),
            Some("gitlab:work")
        );
        let disk = fs::read_to_string(path).unwrap();
        assert!(!disk.contains("test-secret"));
        assert!(!disk.contains(root.to_str().unwrap()));
        assert_eq!(github.reads.load(Ordering::SeqCst), 0);
        assert_eq!(gitlab.reads.load(Ordering::SeqCst), 0);
        assert!(restored
            .select(&root.join("personal"), "github", Some("github:work"), None)
            .is_err());
        assert!(restored
            .select(
                &root.join("personal"),
                "github",
                Some("gitlab:work"),
                Some("github:Personal")
            )
            .is_err());
        restored
            .select(
                &root.join("personal"),
                "github",
                None,
                Some("github:Personal"),
            )
            .unwrap();
        assert!(restored
            .selection(&root.join("personal"), "github")
            .unwrap()
            .account_id
            .is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_preferences_fail_closed_and_are_not_overwritten() {
        let root = scratch();
        let file = root.join("accounts.json");
        fs::write(&file, b"{broken").unwrap();
        let service = AccountService::new(file.clone(), vec![provider("github", "github.com")]);
        assert!(service.selection(&root.join("personal"), "github").is_err());
        assert!(service
            .select(
                &root.join("personal"),
                "github",
                Some("github:Personal"),
                None
            )
            .is_err());
        assert_eq!(fs::read(file).unwrap(), b"{broken");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fixed_host_username_and_protocol_are_checked_before_reading_a_secret() {
        let adapter = provider("github", "github.com");
        let adapters: Vec<Arc<dyn AccessProvider>> = vec![adapter.clone()];
        for input in [
            "protocol=http\nhost=github.com\n\n",
            "protocol=https\nhost=github.com.evil.test\n\n",
            "protocol=https\nhost=github.com:8443\n\n",
            "protocol=https\nhost=gitlab.com\n\n",
            "protocol=https\nhost=github.com\nusername=someone-else\n\n",
            "protocol=https\nhost=github.com\nhost=evil.test\n\n",
            "protocol=https\nprotocol=https\nhost=github.com\n\n",
            "protocol=https\nhost=github.com\nusername=Personal\nusername=Personal\n\n",
            "protocol=https\nhost=github.com\nusername=Personal\t\n\n",
            "protocol=https\nhost=github.com\nextension=bad\0value\n\n",
            "protocol[]=https\nhost=github.com\n\n",
            "capability[]=authtype\ncapability[]=state\nprotocol=https\nhost=github.com\nhost=evil.test\n\n",
            "url=https://github.com\n\n",
        ] {
            assert!(helper(
                &adapters,
                "github:Personal",
                OsStr::new("get"),
                input.as_bytes(),
                Vec::new()
            )
            .is_err());
        }
        assert_eq!(adapter.reads.load(Ordering::SeqCst), 0);
        for operation in ["store", "erase"] {
            helper(
                &adapters,
                "github:Personal",
                OsStr::new(operation),
                &b""[..],
                Vec::new(),
            )
            .unwrap();
        }
        assert_eq!(adapter.reads.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn repeated_git_capabilities_and_auth_challenges_allow_exact_account_lookup() {
        let adapter = provider("github", "github.com");
        let adapters: Vec<Arc<dyn AccessProvider>> = vec![adapter.clone()];
        let mut output = Vec::new();
        helper(
            &adapters,
            "github:Personal",
            OsStr::new("get"),
            &b"capability[]=authtype\ncapability[]=state\nprotocol=https\nhost=github.com\nusername=Personal\nwwwauth[]=Basic realm=GitHub\nwwwauth[]=Bearer\nstate[]=previous\nstate[]=\n\n"[..],
            &mut output,
        )
        .unwrap();
        assert_eq!(adapter.reads.load(Ordering::SeqCst), 1);
        assert_eq!(
            output,
            b"username=Personal\npassword=test-secret-for-Personal\n\n"
        );
    }

    #[test]
    fn git_wire_variants_ignore_opaque_extensions_without_changing_identity() {
        let adapter = provider("github", "github.com");
        let adapters: Vec<Arc<dyn AccessProvider>> = vec![adapter.clone()];
        for input in [
            &b"protocol=https\nhost=github.com\n"[..],
            &b"protocol=https\r\nhost=GITHUB.COM:443\r\nusername=personal\r\n\r\n"[..],
            &b"protocol=https\nhost=github.com\nusername=\npath=team/repo.git\n\n"[..],
            &b"protocol=https\nhost=github.com\nwwwauth[]=Basic\trealm=GitHub\nfuture=value\nfuture=another\nstate[]=opaque-\xff\n\n"[..],
        ] {
            let mut output = Vec::new();
            helper(&adapters, "github:Personal", OsStr::new("get"), input, &mut output).unwrap();
            assert_eq!(output, b"username=Personal\npassword=test-secret-for-Personal\n\n");
        }
        assert_eq!(adapter.reads.load(Ordering::SeqCst), 4);
    }

    #[test]
    fn either_provider_can_answer_exact_account_requests_without_an_active_account() {
        for (id, host) in [("github", "github.com"), ("gitlab", "gitlab.com")] {
            let adapter: Arc<dyn AccessProvider> = provider(id, host);
            for (login, request_host) in [
                ("Personal", host.to_owned()),
                ("work", format!("{}:443", host.to_ascii_uppercase())),
            ] {
                let mut output = Vec::new();
                helper(
                    std::slice::from_ref(&adapter),
                    &format!("{id}:{login}"),
                    OsStr::new("get"),
                    format!("protocol=https\nhost={request_host}\nusername={login}\n\n").as_bytes(),
                    &mut output,
                )
                .unwrap();
                assert_eq!(
                    output,
                    format!("username={login}\npassword=test-secret-for-{login}\n\n").as_bytes()
                );
            }
        }
    }

    #[test]
    fn bounded_input_and_account_grammar_block_injection_before_lookup() {
        let adapter = provider("github", "github.com");
        let adapters: Vec<Arc<dyn AccessProvider>> = vec![adapter.clone()];
        for account in [
            "github:work;evil",
            "github:work\n",
            "github:work:other",
            "github:",
            "github:$(evil)",
        ] {
            assert!(helper(
                &adapters,
                account,
                OsStr::new("get"),
                &b"protocol=https\nhost=github.com\n\n"[..],
                Vec::new()
            )
            .is_err());
        }
        assert!(helper(
            &adapters,
            "github:work",
            OsStr::new("get"),
            &vec![b'a'; 8193][..],
            Vec::new()
        )
        .is_err());
        assert_eq!(adapter.reads.load(Ordering::SeqCst), 0);
        assert!(Secret::from_bytes(b"abcdefghijklmnop\npassword=other".to_vec()).is_none());
        assert!(Secret::from_bytes(vec![b'a'; 4097]).is_none());
    }

    #[test]
    fn preference_write_failure_preserves_the_last_confirmed_identity() {
        let root = scratch();
        let path = root.join("accounts.json");
        let service = AccountService::new(path.clone(), vec![provider("github", "github.com")]);
        service
            .select(
                &root.join("personal"),
                "github",
                Some("github:Personal"),
                None,
            )
            .unwrap();
        let before = fs::read(&path).unwrap();
        fs::create_dir(path.with_extension("new")).unwrap();
        assert!(service
            .select(
                &root.join("personal"),
                "github",
                Some("github:work"),
                Some("github:Personal")
            )
            .is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_eq!(
            service
                .selection(&root.join("personal"), "github")
                .unwrap()
                .account_id
                .as_deref(),
            Some("github:Personal")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn embedded_remote_authentication_cannot_bypass_the_selected_account() {
        let prepared = vec![OsString::from("credential.https://github.com.helper=")];
        for url in [
            "https://user:fixture_secret@github.com/team/repo.git",
            "https://user@github.com/team/repo.git",
            "https://github.com/team/repo.git?token=fixture_secret",
            "https://github.com:8443/team/repo.git",
            "http://github.com/team/repo.git",
        ] {
            assert!(validate_transfer_urls(
                &[OsString::from("fetch"), OsString::from(url)],
                &prepared
            )
            .is_err());
            assert!(
                validate_remote_urls(format!("origin\t{url} (fetch)\n").as_bytes(), &prepared)
                    .is_err()
            );
        }
        for url in [
            "https://github.com/team/repo.git",
            "https://github.com:443/team/repo.git",
            "git@github.com:team/repo.git",
            "https://other:fixture_secret@gitlab.com/team/repo.git",
        ] {
            assert!(
                validate_remote_urls(format!("origin\t{url} (push)\n").as_bytes(), &prepared)
                    .is_ok()
            );
        }
    }

    #[test]
    fn scoped_header_resets_preserve_other_hosts_and_never_read_values() {
        let prepared = vec![OsString::from("credential.https://github.com.helper=")];
        let result = header_overrides(b"http.https://github.com/team/.extraheader\0http.https://gitlab.com/.extraheader\0http.extraheader\0", &prepared).unwrap();
        assert_eq!(
            result,
            [
                OsString::from("-c"),
                OsString::from("http.https://github.com/team/.extraheader=")
            ]
        );
        assert!(header_overrides(b"http.https://*.com/.extraheader\0", &prepared).is_err());
        assert!(
            header_overrides(b"http.https://github.com/\nsecret.extraheader\0", &prepared).is_err()
        );
        assert!(header_overrides(&vec![b'a'; 16385], &prepared).is_err());
    }

    #[test]
    fn selected_clone_accounts_reject_unsafe_sources_before_preview() {
        for source in [
            "https://alice:fixture@github.com/team/project.git",
            "https://alice@github.com/team/project.git",
            "https://github.com/team/project.git?token=fixture",
            "https://github.com:8443/team/project.git",
            "https://github.com.evil.test/team/project.git",
            "https://gitlab.com/team/project.git",
            "git@github.com:team/project.git",
        ] {
            assert!(validate_clone_source(source, "github.com").is_err());
        }
        assert!(
            validate_clone_source("https://GITHUB.com:443/team/project.git", "github.com").is_ok()
        );
    }

    #[test]
    fn clone_override_restores_nested_context_even_when_unwinding() {
        with_accounts(vec!["github:Personal".into()], || {
            let _ = std::panic::catch_unwind(|| {
                with_accounts(vec!["github:work".into()], || panic!("fixture"))
            });
            assert_eq!(
                OVERRIDE.with(|s| s.borrow().clone()),
                Some(vec!["github:Personal".into()])
            );
        });
        assert_eq!(OVERRIDE.with(|s| s.borrow().clone()), None);
    }
}
