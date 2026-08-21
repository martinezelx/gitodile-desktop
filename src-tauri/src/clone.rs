//! Provider-neutral repository acquisition.
//!
//! Clone is deliberately separate from opening an existing repository. It
//! validates a remote/local Git source, clones into a marked GitOdrile-owned
//! staging container, sanitizes persisted remote configuration, verifies the
//! worktree, and only then publishes with an exclusive filesystem move.

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git::CancellationToken;
use crate::git_command::{git_stdout, run_git, run_global_git_with_env};
use crate::operation::truncate_detail;
use crate::platform;
use crate::repository::display_path;
use std::collections::{hash_map::Entry, HashMap};
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::{ErrorKind, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const STAGING_PREFIX: &str = ".gitodrile-clone-";
const OWNER_MARKER: &str = ".gitodrile-clone-owner";
const OWNER_VERSION: &str = "gitodrile-clone-v1";
const MAX_PROJECT_NAME_CHARS: usize = 120;
const MAX_ATTRIBUTES_FILES: usize = 1_000;
const MAX_ATTRIBUTES_BYTES: u64 = 256 * 1024;

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CloneSourceKind {
    Https,
    Ssh,
    Git,
    File,
    Local,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CloneCredentialExpectation {
    None,
    GitCredentialHelper,
    SshAgentOrKey,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CloneProgressPhase {
    Preparing,
    Cloning,
    SanitizingRemote,
    Verifying,
    Publishing,
    Finalizing,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum DependencyDiscovery {
    Detected,
    NotDetected,
    Unknown,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClonePlan {
    pub(crate) operation_kind: &'static str,
    pub(crate) requires_confirmation: bool,
    pub(crate) operation_id: String,
    pub(crate) state_token: String,
    pub(crate) source_kind: CloneSourceKind,
    pub(crate) source_display: String,
    pub(crate) destination_parent: String,
    pub(crate) destination_name: String,
    pub(crate) destination_path: String,
    pub(crate) credential_expectation: CloneCredentialExpectation,
    pub(crate) contacts_network: bool,
    pub(crate) changes_remote: bool,
    pub(crate) checks_out_remote_default: bool,
    pub(crate) uses_staging: bool,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CloneOutcome {
    Completed,
    CleanupRequired,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CloneResult {
    pub(crate) outcome: CloneOutcome,
    pub(crate) operation_id: String,
    pub(crate) destination_path: String,
    pub(crate) submodules: DependencyDiscovery,
    pub(crate) git_lfs: DependencyDiscovery,
    pub(crate) cleanup_path: Option<String>,
}

#[derive(Default)]
pub(crate) struct CloneOperationRegistry {
    active: Mutex<HashMap<String, CancellationToken>>,
}

impl CloneOperationRegistry {
    fn begin(&self, operation_id: &str) -> Result<CancellationToken, AppError> {
        validate_operation_id(operation_id)?;
        let token = CancellationToken::default();
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match active.entry(operation_id.to_string()) {
            Entry::Vacant(entry) => {
                entry.insert(token.clone());
            }
            Entry::Occupied(_) => {
                return Err(AppError::new(
                    AppErrorCode::CloneOperationBusy,
                    "This clone attempt is already running.",
                ));
            }
        }
        Ok(token)
    }

    fn finish(&self, operation_id: &str, token: &CancellationToken) {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if active
            .get(operation_id)
            .is_some_and(|current| current.same_instance(token))
        {
            active.remove(operation_id);
        }
    }

    fn cancel(&self, operation_id: &str) -> Result<(), AppError> {
        validate_operation_id(operation_id)?;
        let active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let token = active.get(operation_id).ok_or_else(|| {
            AppError::new(
                AppErrorCode::CloneOperationMissing,
                "This clone attempt is no longer running.",
            )
        })?;
        token.cancel();
        Ok(())
    }
}

#[derive(Debug)]
struct NormalizedSource {
    argument: String,
    persisted_remote: String,
    safe_display: String,
    suggested_name: String,
    kind: CloneSourceKind,
    credential_expectation: CloneCredentialExpectation,
    contacts_network: bool,
    local_path: Option<PathBuf>,
}

#[derive(Debug)]
struct ValidatedClone {
    source: NormalizedSource,
    parent: PathBuf,
    destination_name: String,
    destination: PathBuf,
    state_token: String,
}

struct Staging {
    container: PathBuf,
    project: PathBuf,
    marker: PathBuf,
    operation_id: String,
}

fn clone_error(code: AppErrorCode, message: &str, remediation: &str) -> AppError {
    AppError::new(code, message).with_remediation(remediation)
}

fn new_operation_id() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let sequence = NEXT.fetch_add(1, Ordering::Relaxed) + 1;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}-{sequence:x}")
}

fn validate_operation_id(value: &str) -> Result<(), AppError> {
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
    {
        return Err(AppError::new(
            AppErrorCode::CloneOperationMissing,
            "This clone attempt identifier is invalid.",
        ));
    }
    Ok(())
}

fn url_without_query_or_fragment(value: &str) -> &str {
    let index = value
        .char_indices()
        .find_map(|(index, character)| matches!(character, '?' | '#').then_some(index))
        .unwrap_or(value.len());
    &value[..index]
}

fn percent_decode_name(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = |byte: u8| match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                b'A'..=b'F' => Some(byte - b'A' + 10),
                _ => None,
            };
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(decoded).unwrap_or_else(|_| value.to_string())
}

fn suggested_name(path_like: &str) -> String {
    let normalized = path_like.trim_end_matches(['/', '\\']);
    let leaf = normalized
        .rsplit(['/', '\\', ':'])
        .next()
        .unwrap_or_default();
    let decoded = percent_decode_name(leaf);
    decoded.strip_suffix(".git").unwrap_or(&decoded).to_string()
}

fn sanitize_authority_url(value: &str, scheme: &str) -> Result<(String, String), AppError> {
    let suffix_free = url_without_query_or_fragment(value);
    let prefix_len = scheme.len() + 3;
    let tail = &suffix_free[prefix_len..];
    let authority_end = tail.find('/').unwrap_or(tail.len());
    let authority = &tail[..authority_end];
    if scheme != "file" && authority.is_empty() {
        return Err(clone_error(
            AppErrorCode::InvalidCloneSource,
            "The remote location has no host.",
            "Paste a complete Git URL and try again.",
        ));
    }
    let path = &tail[authority_end..];
    if scheme != "file" && path.trim_matches('/').is_empty() {
        return Err(clone_error(
            AppErrorCode::InvalidCloneSource,
            "The remote location has no project path.",
            "Paste a complete repository URL and try again.",
        ));
    }
    let (safe_authority, persisted_authority) = match authority.rsplit_once('@') {
        Some((userinfo, host)) => {
            let persisted = if scheme == "ssh" {
                let username = userinfo.split(':').next().unwrap_or_default();
                if username.is_empty() {
                    host.to_string()
                } else {
                    format!("{username}@{host}")
                }
            } else {
                host.to_string()
            };
            (host.to_string(), persisted)
        }
        None => (authority.to_string(), authority.to_string()),
    };
    Ok((
        format!("{scheme}://{safe_authority}{path}"),
        format!("{scheme}://{persisted_authority}{path}"),
    ))
}

fn normalize_source(raw: &str) -> Result<NormalizedSource, AppError> {
    let raw = raw.trim();
    if raw.is_empty() || raw.chars().any(char::is_control) {
        return Err(clone_error(
            AppErrorCode::InvalidCloneSource,
            "Enter a Git remote URL or local repository path.",
            "Use an HTTPS, SSH, Git, file URL, or a local Git path.",
        ));
    }

    if let Some((raw_scheme, _)) = raw.split_once("://") {
        let scheme = raw_scheme.to_ascii_lowercase();
        let kind = match scheme.as_str() {
            "https" => CloneSourceKind::Https,
            "ssh" => CloneSourceKind::Ssh,
            "git" => CloneSourceKind::Git,
            "file" => CloneSourceKind::File,
            _ => {
                return Err(clone_error(
                    AppErrorCode::InvalidCloneSource,
                    "That remote protocol isn't supported.",
                    "Use an HTTPS, SSH, Git, or file URL.",
                ))
            }
        };
        let suffix_free = url_without_query_or_fragment(raw);
        let canonical_scheme_url = format!("{scheme}://{}", &suffix_free[raw_scheme.len() + 3..]);
        let (safe_display, persisted_remote) =
            sanitize_authority_url(&canonical_scheme_url, &scheme)?;
        let url_tail = &canonical_scheme_url[scheme.len() + 3..];
        let authority_end = url_tail.find('/').unwrap_or(url_tail.len());
        let authority = &url_tail[..authority_end];
        let file_uses_network = scheme == "file"
            && !authority.is_empty()
            && !authority.eq_ignore_ascii_case("localhost");
        let local_path = if scheme == "file" && !file_uses_network {
            let decoded = percent_decode_name(&url_tail[authority_end..]);
            #[cfg(target_os = "windows")]
            let decoded = if decoded.starts_with('/')
                && decoded.as_bytes().get(2) == Some(&b':')
                && decoded
                    .as_bytes()
                    .get(1)
                    .is_some_and(u8::is_ascii_alphabetic)
            {
                decoded[1..].to_string()
            } else {
                decoded
            };
            PathBuf::from(decoded).canonicalize().ok()
        } else {
            None
        };
        let name = suggested_name(&persisted_remote);
        return Ok(NormalizedSource {
            // Embedded credentials and URL suffixes never reach Git. Private
            // projects authenticate through the configured helper/SSH setup.
            argument: persisted_remote.clone(),
            persisted_remote,
            safe_display,
            suggested_name: name,
            kind,
            credential_expectation: match kind {
                CloneSourceKind::Https => CloneCredentialExpectation::GitCredentialHelper,
                CloneSourceKind::Ssh => CloneCredentialExpectation::SshAgentOrKey,
                _ => CloneCredentialExpectation::None,
            },
            contacts_network: file_uses_network
                || matches!(
                    kind,
                    CloneSourceKind::Https | CloneSourceKind::Ssh | CloneSourceKind::Git
                ),
            local_path,
        });
    }

    let looks_like_windows_drive = raw.as_bytes().get(1) == Some(&b':')
        && raw.as_bytes().first().is_some_and(u8::is_ascii_alphabetic);
    if !looks_like_windows_drive {
        if let Some((authority, remote_path)) = raw.split_once(':') {
            if !authority.is_empty() && !remote_path.is_empty() && !authority.contains(['/', '\\'])
            {
                let suffix_free = url_without_query_or_fragment(raw);
                let (authority, remote_path) = suffix_free.split_once(':').unwrap_or_default();
                let (persisted_authority, host) = authority.rsplit_once('@').map_or_else(
                    || (authority.to_string(), authority),
                    |(userinfo, host)| {
                        let username = userinfo.split(':').next().unwrap_or_default();
                        let persisted = if username.is_empty() {
                            host.to_string()
                        } else {
                            format!("{username}@{host}")
                        };
                        (persisted, host)
                    },
                );
                let persisted_remote = format!("{persisted_authority}:{remote_path}");
                return Ok(NormalizedSource {
                    argument: persisted_remote.clone(),
                    persisted_remote,
                    safe_display: format!("{host}:{remote_path}"),
                    suggested_name: suggested_name(remote_path),
                    kind: CloneSourceKind::Ssh,
                    credential_expectation: CloneCredentialExpectation::SshAgentOrKey,
                    contacts_network: true,
                    local_path: None,
                });
            }
        }
    }

    let raw_path = Path::new(raw);
    let absolute = if raw_path.is_absolute() {
        raw_path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| {
                clone_error(
                    AppErrorCode::PathUnusable,
                    "The current folder can't be resolved.",
                    "Use an absolute local repository path.",
                )
            })?
            .join(raw_path)
    };
    let canonical = absolute
        .canonicalize()
        .map_err(|error| match error.kind() {
            ErrorKind::NotFound => clone_error(
                AppErrorCode::RemoteNotFound,
                "That local Git source doesn't exist.",
                "Check the path and try again.",
            ),
            ErrorKind::PermissionDenied => clone_error(
                AppErrorCode::PermissionDenied,
                "That local Git source can't be read.",
                "Check its permissions and try again.",
            ),
            _ => clone_error(
                AppErrorCode::PathUnusable,
                "That local Git source can't be resolved.",
                "Check the path and try again.",
            ),
        })?;
    let display = display_path(canonical.clone());
    Ok(NormalizedSource {
        argument: display.clone(),
        persisted_remote: display.clone(),
        safe_display: display,
        suggested_name: canonical
            .file_name()
            .map(|name| suggested_name(&name.to_string_lossy()))
            .unwrap_or_default(),
        kind: CloneSourceKind::Local,
        credential_expectation: CloneCredentialExpectation::None,
        contacts_network: false,
        local_path: Some(canonical),
    })
}

fn is_reserved_windows_name(name: &str) -> bool {
    let stem = name
        .trim_end_matches(['.', ' '])
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0')
}

fn validate_destination_name(name: &str) -> Result<(), AppError> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.chars().count() > MAX_PROJECT_NAME_CHARS
        || name.chars().any(char::is_control)
        || name.contains(['/', '\\', ':'])
        || name.ends_with(['.', ' '])
        || name.starts_with(STAGING_PREFIX)
        || is_reserved_windows_name(name)
    {
        return Err(clone_error(
            AppErrorCode::InvalidCloneDestination,
            "That project folder name isn't safe on every supported platform.",
            "Choose a shorter name without path separators, reserved names, or trailing spaces and dots.",
        ));
    }
    Ok(())
}

fn canonical_parent(parent: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(parent);
    let metadata = path.metadata().map_err(|error| match error.kind() {
        ErrorKind::NotFound => clone_error(
            AppErrorCode::PathMissing,
            "The destination folder doesn't exist.",
            "Choose an existing parent folder.",
        ),
        ErrorKind::PermissionDenied => clone_error(
            AppErrorCode::PermissionDenied,
            "The destination folder can't be read.",
            "Check its permissions or choose another folder.",
        ),
        _ => clone_error(
            AppErrorCode::PathUnusable,
            "The destination folder can't be used.",
            "Choose another folder.",
        ),
    })?;
    if !metadata.is_dir() {
        return Err(clone_error(
            AppErrorCode::InvalidCloneDestination,
            "The destination parent isn't a folder.",
            "Choose a folder that will contain the cloned project.",
        ));
    }
    path.canonicalize().map_err(|_| {
        clone_error(
            AppErrorCode::PathUnusable,
            "The destination folder can't be resolved.",
            "Check its permissions or choose another folder.",
        )
    })
}

fn check_destination_available(parent: &Path, name: &str) -> Result<PathBuf, AppError> {
    let destination = parent.join(name);
    if destination.symlink_metadata().is_ok() {
        return Err(clone_error(
            AppErrorCode::CloneDestinationExists,
            "A file or folder already exists at this destination.",
            "Choose a different project name or parent folder. GitOdrile won't replace it.",
        ));
    }
    let folded = name.to_lowercase();
    let entries = fs::read_dir(parent).map_err(|error| match error.kind() {
        ErrorKind::PermissionDenied => clone_error(
            AppErrorCode::PermissionDenied,
            "The destination folder can't be inspected.",
            "Check its permissions or choose another folder.",
        ),
        _ => clone_error(
            AppErrorCode::PathUnusable,
            "The destination folder can't be inspected.",
            "Choose another folder.",
        ),
    })?;
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().to_lowercase() == folded {
            return Err(clone_error(
                AppErrorCode::CloneDestinationCollides,
                "That name collides with an existing path when letter case or aliases are ignored.",
                "Choose a different project name.",
            ));
        }
    }
    #[cfg(target_os = "windows")]
    if display_path(destination.clone()).encode_utf16().count() > 240 {
        return Err(clone_error(
            AppErrorCode::PathTooLong,
            "The destination path is too long for a reliable Windows checkout.",
            "Choose a shorter parent path or project name.",
        ));
    }
    Ok(destination)
}

fn validate_not_nested(source: &NormalizedSource, destination: &Path) -> Result<(), AppError> {
    let Some(source_path) = &source.local_path else {
        return Ok(());
    };
    if source_path.is_dir() && destination.starts_with(source_path) {
        return Err(clone_error(
            AppErrorCode::InvalidCloneDestination,
            "The destination can't be inside the local source repository.",
            "Choose a parent folder outside the source repository.",
        ));
    }
    Ok(())
}

fn compute_state_token(source: &NormalizedSource, parent: &Path, name: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source.argument.hash(&mut hasher);
    source.persisted_remote.hash(&mut hasher);
    parent.hash(&mut hasher);
    name.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn validate_clone(source: &str, parent: &str, name: &str) -> Result<ValidatedClone, AppError> {
    let source = normalize_source(source)?;
    let destination_name = if name.trim().is_empty() {
        source.suggested_name.clone()
    } else {
        name.trim().to_string()
    };
    validate_destination_name(&destination_name)?;
    let parent = canonical_parent(parent)?;
    let destination = check_destination_available(&parent, &destination_name)?;
    validate_not_nested(&source, &destination)?;
    let state_token = compute_state_token(&source, &parent, &destination_name);
    Ok(ValidatedClone {
        source,
        parent,
        destination_name,
        destination,
        state_token,
    })
}

pub(crate) fn plan_clone(
    source: String,
    destination_parent: String,
    destination_name: String,
) -> Result<ClonePlan, AppError> {
    let _command = application::enter("plan_clone");
    let validated = validate_clone(&source, &destination_parent, &destination_name)?;
    Ok(ClonePlan {
        operation_kind: "local-mutation",
        requires_confirmation: true,
        operation_id: new_operation_id(),
        state_token: validated.state_token,
        source_kind: validated.source.kind,
        source_display: validated.source.safe_display,
        destination_parent: display_path(validated.parent),
        destination_name: validated.destination_name,
        destination_path: display_path(validated.destination),
        credential_expectation: validated.source.credential_expectation,
        contacts_network: validated.source.contacts_network,
        changes_remote: false,
        checks_out_remote_default: true,
        uses_staging: true,
    })
}

fn staging_paths(parent: &Path, operation_id: &str) -> Result<Staging, AppError> {
    validate_operation_id(operation_id)?;
    let container = parent.join(format!("{STAGING_PREFIX}{operation_id}"));
    Ok(Staging {
        project: container.join("project"),
        marker: container.join(OWNER_MARKER),
        container,
        operation_id: operation_id.to_string(),
    })
}

fn prepare_staging(parent: &Path, operation_id: &str) -> Result<Staging, AppError> {
    let staging = staging_paths(parent, operation_id)?;
    fs::create_dir(&staging.container).map_err(|error| match error.kind() {
        ErrorKind::AlreadyExists => clone_error(
            AppErrorCode::CloneDestinationCollides,
            "This clone attempt's private staging path already exists.",
            "Start a new clone attempt.",
        ),
        ErrorKind::PermissionDenied => clone_error(
            AppErrorCode::PermissionDenied,
            "GitOdrile can't create a private staging folder here.",
            "Check the destination permissions or choose another folder.",
        ),
        _ => classify_filesystem_error(&error, "GitOdrile couldn't prepare the destination."),
    })?;
    let marker_result = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging.marker)
        .and_then(|mut marker| {
            writeln!(marker, "{OWNER_VERSION}")?;
            writeln!(marker, "{}", staging.operation_id)?;
            marker.sync_all()
        });
    if let Err(error) = marker_result {
        let _ = fs::remove_dir_all(&staging.container);
        return Err(classify_filesystem_error(
            &error,
            "GitOdrile couldn't mark its private staging folder.",
        ));
    }
    Ok(staging)
}

fn verify_staging_ownership(staging: &Staging) -> Result<(), AppError> {
    let container_metadata = fs::symlink_metadata(&staging.container).map_err(|_| {
        clone_error(
            AppErrorCode::CloneCleanupUnavailable,
            "The private staging folder no longer exists.",
            "Review the destination before trying again.",
        )
    })?;
    let marker_metadata = fs::symlink_metadata(&staging.marker).map_err(|_| {
        clone_error(
            AppErrorCode::CloneCleanupUnavailable,
            "GitOdrile can't prove that it owns this staging folder.",
            "Do not remove it from GitOdrile; inspect it manually.",
        )
    })?;
    if !container_metadata.file_type().is_dir() || !marker_metadata.file_type().is_file() {
        return Err(clone_error(
            AppErrorCode::CloneCleanupUnavailable,
            "GitOdrile can't prove that it owns this staging path.",
            "Inspect the path manually. GitOdrile will not remove it.",
        ));
    }
    let expected_name = format!("{STAGING_PREFIX}{}", staging.operation_id);
    if staging.container.file_name().and_then(|name| name.to_str()) != Some(&expected_name) {
        return Err(clone_error(
            AppErrorCode::CloneCleanupUnavailable,
            "The staging path doesn't match this clone attempt.",
            "GitOdrile will not remove it.",
        ));
    }
    let marker = fs::read_to_string(&staging.marker).map_err(|_| {
        clone_error(
            AppErrorCode::CloneCleanupUnavailable,
            "GitOdrile can't read the staging ownership marker.",
            "GitOdrile will not remove it.",
        )
    })?;
    let expected = format!("{OWNER_VERSION}\n{}\n", staging.operation_id);
    if marker != expected {
        return Err(clone_error(
            AppErrorCode::CloneCleanupUnavailable,
            "The staging ownership marker doesn't match this clone attempt.",
            "GitOdrile will not remove it.",
        ));
    }
    Ok(())
}

fn cleanup_staging(staging: &Staging) -> Result<(), AppError> {
    if !staging.container.exists() {
        return Ok(());
    }
    verify_staging_ownership(staging)?;
    fs::remove_dir_all(&staging.container).map_err(|error| {
        classify_filesystem_error(
            &error,
            "GitOdrile couldn't remove its private staging folder.",
        )
    })
}

fn failure_after_cleanup(error: AppError, staging: &Staging) -> AppError {
    match cleanup_staging(staging) {
        Ok(()) => error,
        Err(cleanup_error) => clone_error(
            AppErrorCode::CloneCleanupRequired,
            "The clone stopped, but its private staging folder still needs cleanup.",
            "Retry cleanup from this dialog. GitOdrile will only remove the path it marked as its own.",
        )
        .with_detail(format!(
            "{} Cleanup path: {}. {}",
            error.message,
            display_path(staging.container.clone()),
            cleanup_error.message
        )),
    }
}

fn classify_filesystem_error(error: &std::io::Error, context: &str) -> AppError {
    let lower = error.to_string().to_lowercase();
    if error.kind() == ErrorKind::PermissionDenied {
        return clone_error(
            AppErrorCode::PermissionDenied,
            context,
            "Check the destination permissions or choose another folder.",
        );
    }
    if lower.contains("no space") || lower.contains("disk full") {
        return clone_error(
            AppErrorCode::DiskFull,
            "There isn't enough disk space to finish cloning.",
            "Free some space, then try again. GitOdrile will not delete an existing destination.",
        );
    }
    if lower.contains("filename too long") || lower.contains("path too long") {
        return clone_error(
            AppErrorCode::PathTooLong,
            "A path in this project is too long for the destination.",
            "Choose a shorter parent path or enable long paths in your Git and operating-system setup.",
        );
    }
    clone_error(
        AppErrorCode::CloneFailed,
        context,
        "Check disk space and permissions, then try again.",
    )
}

fn classify_clone_failure(stderr: &[u8]) -> AppError {
    let text = String::from_utf8_lossy(stderr);
    let lower = text.to_lowercase();
    let detail = || truncate_detail(&text);
    if lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("permission denied (publickey")
        || lower.contains("terminal prompts disabled")
        || lower.contains("http 401")
        || lower.contains("http 403")
    {
        return clone_error(
            AppErrorCode::AuthenticationFailed,
            "GitOdrile couldn't authenticate with the remote project.",
            "Check your configured Git credential helper, SSH key, or access rights, then retry.",
        )
        .with_detail(detail());
    }
    if lower.contains("host key verification failed")
        || lower.contains("remote host identification has changed")
        || lower.contains("authenticity of host")
    {
        return clone_error(
            AppErrorCode::HostKeyFailed,
            "SSH couldn't verify the remote host key.",
            "Verify and trust the host with your system SSH tools, then retry.",
        )
        .with_detail(detail());
    }
    if lower.contains("certificate problem")
        || lower.contains("certificate verify failed")
        || lower.contains("ssl certificate")
        || lower.contains("schannel") && lower.contains("certificate")
    {
        return clone_error(
            AppErrorCode::CertificateFailed,
            "Git couldn't verify the remote server certificate.",
            "Check the server certificate, proxy, and system trust settings. GitOdrile will not bypass verification.",
        )
        .with_detail(detail());
    }
    if lower.contains("could not resolve host")
        || lower.contains("could not resolve hostname")
        || lower.contains("network is unreachable")
        || lower.contains("failed to connect")
        || lower.contains("couldn't connect")
        || lower.contains("name or service not known")
    {
        return clone_error(
            AppErrorCode::Offline,
            "GitOdrile couldn't reach the remote host.",
            "Check your connection, VPN, proxy, and the host name, then retry.",
        )
        .with_detail(detail());
    }
    if lower.contains("repository not found")
        || lower.contains("does not appear to be a git repository")
        || lower.contains("could not read from remote repository")
        || lower.contains("not found")
    {
        return clone_error(
            AppErrorCode::RemoteNotFound,
            "Git couldn't find that remote project.",
            "Check the location and your access rights, then retry.",
        )
        .with_detail(detail());
    }
    if lower.contains("no space left") || lower.contains("disk full") {
        return clone_error(
            AppErrorCode::DiskFull,
            "There isn't enough disk space to finish cloning.",
            "Free some space and retry.",
        )
        .with_detail(detail());
    }
    if (lower.contains("permission denied") && !lower.contains("publickey"))
        || lower.contains("access is denied")
        || lower.contains("operation not permitted")
    {
        return clone_error(
            AppErrorCode::PermissionDenied,
            "Git couldn't write the cloned project at this destination.",
            "Check the destination permissions or choose another folder.",
        )
        .with_detail(detail());
    }
    if lower.contains("filename too long") || lower.contains("path too long") {
        return clone_error(
            AppErrorCode::PathTooLong,
            "A project path is too long for this checkout.",
            "Choose a shorter destination or adjust long-path support in Git and the operating system.",
        )
        .with_detail(detail());
    }
    clone_error(
        AppErrorCode::CloneFailed,
        "Git couldn't clone this project.",
        "Review the technical details, check the remote and destination, then retry.",
    )
    .with_detail(detail())
}

fn verify_repository(path: &Path) -> Result<(), AppError> {
    let display = display_path(path.to_path_buf());
    let inside = run_git(&display, &["rev-parse", "--is-inside-work-tree"])?;
    if !inside.status.success() || git_stdout(&inside) != "true" {
        return Err(clone_error(
            AppErrorCode::CloneVerificationFailed,
            "The downloaded data isn't a usable Git worktree.",
            "Retry the clone. The destination has not been published.",
        ));
    }
    let root = run_git(&display, &["rev-parse", "--show-toplevel"])?;
    if !root.status.success() {
        return Err(clone_error(
            AppErrorCode::CloneVerificationFailed,
            "Git couldn't resolve the cloned worktree root.",
            "Retry the clone.",
        ));
    }
    let expected = path.canonicalize().map_err(|_| {
        clone_error(
            AppErrorCode::CloneVerificationFailed,
            "The cloned worktree path can't be resolved.",
            "Check destination permissions and retry.",
        )
    })?;
    let observed = Path::new(&git_stdout(&root)).canonicalize().map_err(|_| {
        clone_error(
            AppErrorCode::CloneVerificationFailed,
            "Git reported a worktree root that can't be resolved.",
            "Retry the clone.",
        )
    })?;
    if expected != observed {
        return Err(clone_error(
            AppErrorCode::CloneVerificationFailed,
            "The cloned worktree identity doesn't match its staging path.",
            "GitOdrile will not publish this clone.",
        ));
    }
    let status = run_git(
        &display,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=no",
        ],
    )?;
    if !status.status.success() {
        return Err(clone_error(
            AppErrorCode::CloneVerificationFailed,
            "Git couldn't read the cloned worktree.",
            "Retry the clone.",
        ));
    }
    Ok(())
}

fn discover_submodules(path: &Path) -> DependencyDiscovery {
    match fs::metadata(path.join(".gitmodules")) {
        Ok(metadata) if metadata.is_file() => DependencyDiscovery::Detected,
        Ok(_) => DependencyDiscovery::Unknown,
        Err(error) if error.kind() == ErrorKind::NotFound => DependencyDiscovery::NotDetected,
        Err(_) => DependencyDiscovery::Unknown,
    }
}

fn safe_relative_path(raw: &[u8]) -> Option<PathBuf> {
    let value = String::from_utf8(raw.to_vec()).ok()?;
    let path = PathBuf::from(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return None;
    }
    Some(path)
}

fn discover_git_lfs(path: &Path) -> DependencyDiscovery {
    let display = display_path(path.to_path_buf());
    let files = match run_git(&display, &["ls-files", "-z"]) {
        Ok(output) if output.status.success() => output.stdout,
        _ => return DependencyDiscovery::Unknown,
    };
    let mut attributes_count = 0;
    for raw in files
        .split(|byte| *byte == 0)
        .filter(|entry| !entry.is_empty())
    {
        let Some(relative) = safe_relative_path(raw) else {
            return DependencyDiscovery::Unknown;
        };
        if relative.file_name().and_then(|name| name.to_str()) != Some(".gitattributes") {
            continue;
        }
        attributes_count += 1;
        if attributes_count > MAX_ATTRIBUTES_FILES {
            return DependencyDiscovery::Unknown;
        }
        let full = path.join(relative);
        let metadata = match fs::metadata(&full) {
            Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_ATTRIBUTES_BYTES => {
                metadata
            }
            Ok(_) => return DependencyDiscovery::Unknown,
            Err(_) => return DependencyDiscovery::Unknown,
        };
        let mut content = String::with_capacity(metadata.len() as usize);
        if fs::File::open(full)
            .and_then(|mut file| file.read_to_string(&mut content))
            .is_err()
        {
            return DependencyDiscovery::Unknown;
        }
        if content.lines().any(|line| {
            let lower = line.to_ascii_lowercase();
            lower.contains("filter=lfs") || lower.contains("filter lfs")
        }) {
            return DependencyDiscovery::Detected;
        }
    }
    DependencyDiscovery::NotDetected
}

fn clone_with_token(
    validated: ValidatedClone,
    operation_id: &str,
    token: &CancellationToken,
    progress: &mut impl FnMut(CloneProgressPhase),
) -> Result<CloneResult, AppError> {
    progress(CloneProgressPhase::Preparing);
    check_destination_available(&validated.parent, &validated.destination_name)?;
    let staging = prepare_staging(&validated.parent, operation_id)?;

    progress(CloneProgressPhase::Cloning);
    let args = vec![
        OsString::from("clone"),
        OsString::from("--no-recurse-submodules"),
        OsString::from("--progress"),
        OsString::from("--"),
        OsString::from(&validated.source.argument),
        OsString::from(display_path(staging.project.clone())),
    ];
    let clone_output = match run_global_git_with_env(args, &[("GIT_TERMINAL_PROMPT", "0")]) {
        Ok(output) => output,
        Err(_error) if token.is_cancelled() => {
            return Err(failure_after_cleanup(
                clone_error(
                    AppErrorCode::OperationCancelled,
                    "The clone was cancelled.",
                    "Retry when you're ready. No destination was published.",
                ),
                &staging,
            ))
        }
        Err(error) if error.message.contains("too long") => {
            return Err(failure_after_cleanup(
                clone_error(
                    AppErrorCode::NetworkTimeout,
                    "Cloning took too long and was stopped.",
                    "Check the connection and retry.",
                ),
                &staging,
            ))
        }
        Err(error) => return Err(failure_after_cleanup(error, &staging)),
    };
    if !clone_output.status.success() {
        return Err(failure_after_cleanup(
            classify_clone_failure(&clone_output.stderr),
            &staging,
        ));
    }
    if token.is_cancelled() {
        return Err(failure_after_cleanup(
            clone_error(
                AppErrorCode::OperationCancelled,
                "The clone was cancelled before publication.",
                "Retry when you're ready. No destination was published.",
            ),
            &staging,
        ));
    }

    progress(CloneProgressPhase::SanitizingRemote);
    let project_display = display_path(staging.project.clone());
    let sanitized = run_git(
        &project_display,
        &[
            "remote",
            "set-url",
            "origin",
            &validated.source.persisted_remote,
        ],
    )?;
    if !sanitized.status.success() {
        return Err(failure_after_cleanup(
            clone_error(
                AppErrorCode::CloneVerificationFailed,
                "GitOdrile couldn't remove private URL details from the cloned remote.",
                "The clone will not be published. Check the remote location and retry.",
            ),
            &staging,
        ));
    }

    progress(CloneProgressPhase::Verifying);
    if let Err(error) = verify_repository(&staging.project) {
        return Err(failure_after_cleanup(error, &staging));
    }
    let submodules = discover_submodules(&staging.project);
    let git_lfs = discover_git_lfs(&staging.project);
    if token.is_cancelled() {
        return Err(failure_after_cleanup(
            clone_error(
                AppErrorCode::OperationCancelled,
                "The clone was cancelled before publication.",
                "Retry when you're ready. No destination was published.",
            ),
            &staging,
        ));
    }

    progress(CloneProgressPhase::Publishing);
    if let Err(error) = check_destination_available(&validated.parent, &validated.destination_name)
    {
        return Err(failure_after_cleanup(error, &staging));
    }
    if let Err(error) =
        platform::rename_directory_no_replace(&staging.project, &validated.destination)
    {
        let mapped = if validated.destination.exists() && staging.project.exists() {
            clone_error(
                AppErrorCode::CloneDestinationExists,
                "The destination appeared while cloning.",
                "GitOdrile did not replace it. Choose a different destination and retry.",
            )
        } else {
            classify_filesystem_error(&error, "GitOdrile couldn't publish the verified clone.")
        };
        return Err(failure_after_cleanup(mapped, &staging));
    }

    if let Err(error) = verify_repository(&validated.destination) {
        let _ = cleanup_staging(&staging);
        return Err(clone_error(
            AppErrorCode::ClonePublishUncertain,
            "The project was moved into place, but GitOdrile couldn't verify the final path.",
            "Do not retry into the same destination. Inspect the project and open it manually if it is complete.",
        )
        .with_detail(error.message));
    }

    progress(CloneProgressPhase::Finalizing);
    let cleanup_path = display_path(staging.container.clone());
    let outcome = match cleanup_staging(&staging) {
        Ok(()) => CloneOutcome::Completed,
        Err(_) => CloneOutcome::CleanupRequired,
    };
    Ok(CloneResult {
        outcome,
        operation_id: operation_id.to_string(),
        destination_path: display_path(validated.destination),
        submodules,
        git_lfs,
        cleanup_path: (outcome == CloneOutcome::CleanupRequired).then_some(cleanup_path),
    })
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn clone_repository(
    registry: &CloneOperationRegistry,
    source: String,
    destination_parent: String,
    destination_name: String,
    operation_id: String,
    state_token: String,
    mut progress: impl FnMut(CloneProgressPhase),
) -> Result<CloneResult, AppError> {
    let validated = validate_clone(&source, &destination_parent, &destination_name)?;
    if validated.state_token != state_token {
        return Err(clone_error(
            AppErrorCode::StaleClonePlan,
            "The clone details changed since the preview.",
            "Review the destination and remote again.",
        ));
    }
    let token = registry.begin(&operation_id)?;
    let result = {
        let _command = application::enter_with_cancellation("clone_repository", token.clone());
        clone_with_token(validated, &operation_id, &token, &mut progress)
    };
    registry.finish(&operation_id, &token);
    result
}

pub(crate) fn cancel_clone(
    registry: &CloneOperationRegistry,
    operation_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("cancel_clone");
    registry.cancel(&operation_id)
}

pub(crate) fn cleanup_clone(
    destination_parent: String,
    operation_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("cleanup_clone");
    let parent = canonical_parent(&destination_parent)?;
    let staging = staging_paths(&parent, &operation_id)?;
    cleanup_staging(&staging)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_remote_grammar_is_provider_neutral_and_secret_safe() {
        let https = normalize_source(
            "HTTPS://alice:secret@example.test/team/repo.git?token=hidden#fragment",
        )
        .unwrap();
        assert_eq!(https.kind, CloneSourceKind::Https);
        assert_eq!(https.safe_display, "https://example.test/team/repo.git");
        assert_eq!(https.persisted_remote, "https://example.test/team/repo.git");
        assert!(!https.argument.contains("token"));
        assert!(!https.argument.contains("secret"));

        let ssh = normalize_source("git@example.test:team/repo.git").unwrap();
        assert_eq!(ssh.kind, CloneSourceKind::Ssh);
        assert_eq!(ssh.safe_display, "example.test:team/repo.git");
        assert_eq!(ssh.persisted_remote, "git@example.test:team/repo.git");

        let ssh_absolute = normalize_source("alice@example.test:/srv/repo.git?gone=1").unwrap();
        assert_eq!(ssh_absolute.argument, "alice@example.test:/srv/repo.git");
        assert_eq!(ssh_absolute.safe_display, "example.test:/srv/repo.git");

        let git = normalize_source("git://example.test/team/repo.git").unwrap();
        assert_eq!(git.kind, CloneSourceKind::Git);
        let file = normalize_source("file:///tmp/repo.git?secret=gone").unwrap();
        assert_eq!(file.kind, CloneSourceKind::File);
        assert!(!file.argument.contains("secret"));
        assert!(!file.contacts_network);
        assert!(
            normalize_source("file://server/share/repo.git")
                .unwrap()
                .contacts_network
        );
    }

    #[test]
    fn destination_names_reject_cross_platform_hazards() {
        for invalid in [
            "", ".", "..", "CON", "aux.txt", "name.", "a/b", "a\\b", "a:b",
        ] {
            assert!(validate_destination_name(invalid).is_err(), "{invalid}");
        }
        validate_destination_name("répô-friendly").unwrap();
    }

    #[test]
    fn clone_failures_are_classified_and_redacted() {
        assert_eq!(
            classify_clone_failure(b"fatal: could not resolve host: example.test").code,
            AppErrorCode::Offline
        );
        assert_eq!(
            classify_clone_failure(b"fatal: SSL certificate problem").code,
            AppErrorCode::CertificateFailed
        );
        assert_eq!(
            classify_clone_failure(b"Host key verification failed").code,
            AppErrorCode::HostKeyFailed
        );
        let authentication = classify_clone_failure(
            b"Authentication failed for https://alice:secret@example.test/repo.git?token=hidden",
        );
        assert_eq!(authentication.code, AppErrorCode::AuthenticationFailed);
        let detail = authentication.detail.unwrap_or_default();
        assert!(!detail.contains("secret"));
        assert!(!detail.contains("token"));
    }

    #[test]
    fn cancellation_registry_never_retargets_an_operation() {
        let registry = CloneOperationRegistry::default();
        let token = registry.begin("abc-1").unwrap();
        assert_eq!(
            registry.begin("abc-1").err().unwrap().code,
            AppErrorCode::CloneOperationBusy
        );
        registry.cancel("abc-1").unwrap();
        assert!(token.is_cancelled());
        registry.finish("abc-1", &token);
        assert_eq!(
            registry.cancel("abc-1").unwrap_err().code,
            AppErrorCode::CloneOperationMissing
        );
    }

    #[test]
    fn cancellation_before_git_starts_removes_the_owned_staging_only() {
        use crate::test_support::{git_add_all, git_commit, git_init, unique_temp_dir, write_file};

        let source = unique_temp_dir("clone-cancel-source");
        git_init(&source);
        write_file(&source, "file.txt", "content\n");
        git_add_all(&source);
        git_commit(&source, "fixture");
        let parent = unique_temp_dir("clone-cancel-parent");
        let validated = validate_clone(&source, &parent, "cancelled-project").unwrap();
        let token = CancellationToken::default();
        token.cancel();
        let operation_id = "abc-ca-ce-1";
        let result = {
            let _command = application::enter_with_cancellation("clone_repository", token.clone());
            clone_with_token(validated, operation_id, &token, &mut |_| {})
        };

        assert_eq!(result.unwrap_err().code, AppErrorCode::OperationCancelled);
        assert!(!Path::new(&parent).join("cancelled-project").exists());
        assert!(!Path::new(&parent)
            .join(format!("{STAGING_PREFIX}{operation_id}"))
            .exists());
    }

    #[test]
    fn cleanup_refuses_a_staging_folder_without_the_exact_owner_marker() {
        use crate::test_support::unique_temp_dir;

        let parent = PathBuf::from(unique_temp_dir("clone-cleanup-owner"));
        let staging = prepare_staging(&parent, "abc-0-e-1").unwrap();
        fs::write(&staging.marker, "someone-else\nabc-0-e-1\n").unwrap();
        fs::write(staging.container.join("user-file.txt"), "preserve\n").unwrap();

        assert_eq!(
            cleanup_staging(&staging).unwrap_err().code,
            AppErrorCode::CloneCleanupUnavailable
        );
        assert_eq!(
            fs::read_to_string(staging.container.join("user-file.txt")).unwrap(),
            "preserve\n"
        );
    }
}
