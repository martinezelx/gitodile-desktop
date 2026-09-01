//! Configuration that belongs to one project rather than to this machine.
//!
//! `tooling.rs` owns the machine-wide answers Settings shows — the Git
//! installation, the global identity, `init.defaultBranch`, line endings. This
//! module owns the two that are properties of an open repository: the identity
//! that repository saves versions as, and the files it uses to decide what to
//! ignore. Remotes are the third per-project setting and stay in `sync`, whose
//! boundary they already are.

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{run_git, run_git_with_env};
use crate::repository_access::RepositoryContext;
use crate::tooling::{config_pattern, parse_config_entries};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

const IDENTITY_KEYS: [&str; 2] = ["user.name", "user.email"];

/// Where the identity Git will stamp on this project's next saved version comes
/// from. Reported rather than inferred by the panel, because "inherited" and
/// "overridden here" are the whole question the section answers.
#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProjectIdentitySource {
    /// This project's own config sets at least one of the two keys.
    Project,
    /// No local override; the value comes from the global or system config.
    Inherited,
    /// Nobody has set an identity, so saving a version would fail.
    Unset,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectIdentity {
    /// Set in this project's own config, when it is.
    local_name: Option<String>,
    local_email: Option<String>,
    /// What this project would use with no local override.
    inherited_name: Option<String>,
    inherited_email: Option<String>,
    /// What Git will actually use right now.
    effective_name: Option<String>,
    effective_email: Option<String>,
    source: ProjectIdentitySource,
}

/// Rejects what Git would store but nothing could read back sensibly. Git
/// itself accepts almost anything here, so this only refuses the empty value
/// and the control characters that would break the config file's own line
/// structure — the same permissiveness `tooling.rs` applies to the global
/// identity, plus the check that file format demands.
fn validate_identity_field(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidIdentity,
            "Enter both a name and an email.",
        ));
    }
    Ok(value.to_string())
}

/// `config_override` points `GIT_CONFIG_GLOBAL` at a scratch file so tests can
/// read an inherited identity without depending on — or risking a write to —
/// the developer's real global configuration. Production passes `None`.
fn identity_envs(config_override: Option<&str>) -> Vec<(&str, &str)> {
    config_override
        .map(|path| vec![("GIT_CONFIG_GLOBAL", path)])
        .unwrap_or_default()
}

fn read_scoped_identity(
    path: &str,
    scope: Option<&str>,
    config_override: Option<&str>,
) -> HashMap<String, String> {
    let pattern = config_pattern(&IDENTITY_KEYS);
    let mut args = vec!["config"];
    if let Some(scope) = scope {
        args.push(scope);
    }
    args.extend(["-z", "--get-regexp", pattern.as_str()]);
    let envs = identity_envs(config_override);
    // A scope with none of these keys exits non-zero, which is an answer and
    // not a failure, so both cases produce an empty map.
    let Ok(output) = run_git_with_env(path, args, envs.as_slice()) else {
        return HashMap::new();
    };
    if !output.status.success() {
        return HashMap::new();
    }
    parse_config_entries(&String::from_utf8_lossy(&output.stdout))
}

/// One `(scope, key, value)` as `--show-scope` reports it.
struct ScopedValue {
    is_project: bool,
    key: String,
    value: String,
}

/// `git config -z --show-scope --get-regexp` writes `scope\0key\nvalue\0`
/// per entry, in Git's own precedence order — system, then global, then
/// this repository — so the last entry for a key is the one Git will use.
fn parse_scoped_config(stdout: &str) -> Vec<ScopedValue> {
    let mut fields = stdout.split('\0');
    let mut values = Vec::new();
    while let (Some(scope), Some(entry)) = (fields.next(), fields.next()) {
        if scope.is_empty() {
            continue;
        }
        let Some((key, value)) = entry.split_once('\n') else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        values.push(ScopedValue {
            // A worktree-scoped value belongs to this checkout as much as a
            // repository-scoped one does; both are "set here" to the reader.
            is_project: scope == "local" || scope == "worktree",
            key: key.to_string(),
            value: value.to_string(),
        });
    }
    values
}

fn identity_from_scoped_values(values: &[ScopedValue]) -> ProjectIdentity {
    // Last wins, which is Git's own rule for a key set more than once.
    let local = |key: &str| -> Option<String> {
        values
            .iter()
            .rfind(|value| value.key == key && value.is_project)
            .map(|value| value.value.clone())
    };
    let inherited = |key: &str| -> Option<String> {
        values
            .iter()
            .rfind(|value| value.key == key && !value.is_project)
            .map(|value| value.value.clone())
    };

    let local_name = local("user.name");
    let local_email = local("user.email");
    let inherited_name = inherited("user.name");
    let inherited_email = inherited("user.email");
    // Git's own precedence, stated once: this project's value when it has one,
    // and what it inherits when it does not.
    let effective_name = local_name.clone().or_else(|| inherited_name.clone());
    let effective_email = local_email.clone().or_else(|| inherited_email.clone());

    let source = if local_name.is_some() || local_email.is_some() {
        ProjectIdentitySource::Project
    } else if effective_name.is_some() || effective_email.is_some() {
        ProjectIdentitySource::Inherited
    } else {
        ProjectIdentitySource::Unset
    };

    ProjectIdentity {
        local_name,
        local_email,
        inherited_name,
        inherited_email,
        effective_name,
        effective_email,
        source,
    }
}

/// Every scope in one process.
///
/// `None` means this Git cannot answer that way — `--show-scope` arrived in
/// 2.26 and GitOdile supports 2.23 — not that nothing is set. A usage error
/// exits 129; exit 1 is Git's ordinary "no key matched", which is a real and
/// empty answer.
fn read_identity_with_scopes(path: &str, config_override: Option<&str>) -> Option<ProjectIdentity> {
    let pattern = config_pattern(&IDENTITY_KEYS);
    let envs = identity_envs(config_override);
    let output = run_git_with_env(
        path,
        [
            "config",
            "-z",
            "--show-scope",
            "--get-regexp",
            pattern.as_str(),
        ],
        envs.as_slice(),
    )
    .ok()?;
    if !output.status.success() && output.status.code() != Some(1) {
        return None;
    }
    Some(identity_from_scoped_values(&parse_scoped_config(
        &String::from_utf8_lossy(&output.stdout),
    )))
}

/// Three reads where Git cannot report scopes: what this project sets, what the
/// machine sets, and what Git resolves. Kept as the fallback for Git 2.23–2.25,
/// which the app still supports.
fn read_identity_by_scope_queries(path: &str, config_override: Option<&str>) -> ProjectIdentity {
    let local = read_scoped_identity(path, Some("--local"), config_override);
    let global = read_scoped_identity(path, Some("--global"), config_override);
    let effective = read_scoped_identity(path, None, config_override);

    let value = |values: &HashMap<String, String>, key: &str| values.get(key).cloned();
    let local_name = value(&local, "user.name");
    let local_email = value(&local, "user.email");
    let effective_name = value(&effective, "user.name");
    let effective_email = value(&effective, "user.email");
    // With no local override the effective value *is* the inherited one, which
    // also covers a system-level identity the global config never mentions.
    let inherited_name = if local_name.is_none() {
        effective_name.clone()
    } else {
        value(&global, "user.name")
    };
    let inherited_email = if local_email.is_none() {
        effective_email.clone()
    } else {
        value(&global, "user.email")
    };

    let source = if local_name.is_some() || local_email.is_some() {
        ProjectIdentitySource::Project
    } else if effective_name.is_some() || effective_email.is_some() {
        ProjectIdentitySource::Inherited
    } else {
        ProjectIdentitySource::Unset
    };

    ProjectIdentity {
        local_name,
        local_email,
        inherited_name,
        inherited_email,
        effective_name,
        effective_email,
        source,
    }
}

/// One process where Git can report scopes, three where it cannot.
///
/// The panel waits on this before it can say anything about the identity, and a
/// process spawn costs roughly 55 ms on Windows — the same arithmetic that made
/// Settings read all of its global keys in one call.
fn read_identity(path: &str, config_override: Option<&str>) -> ProjectIdentity {
    read_identity_with_scopes(path, config_override)
        .unwrap_or_else(|| read_identity_by_scope_queries(path, config_override))
}

fn write_local_config(path: &str, key: &str, value: &str) -> Result<(), AppError> {
    let output = run_git(path, &["config", "--local", key, value])?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitConfigWriteFailed,
            format!("Git couldn't save {key} for this project."),
        )
        .with_remediation("Check that the project's Git configuration is writable."));
    }
    Ok(())
}

/// `--unset` reports "nothing to unset" with exit code 5, which is the outcome
/// this asks for rather than a failure.
fn unset_local_config(path: &str, key: &str) -> Result<(), AppError> {
    let output = run_git(path, &["config", "--local", "--unset-all", key])?;
    if output.status.success() || output.status.code() == Some(5) {
        return Ok(());
    }
    Err(AppError::new(
        AppErrorCode::GitConfigWriteFailed,
        format!("Git couldn't remove {key} from this project."),
    )
    .with_remediation("Check that the project's Git configuration is writable."))
}

fn set_identity_with_override(
    path: &str,
    name: &str,
    email: &str,
    config_override: Option<&str>,
) -> Result<ProjectIdentity, AppError> {
    let name = validate_identity_field(name)?;
    let email = validate_identity_field(email)?;
    write_local_config(path, "user.name", &name)?;
    write_local_config(path, "user.email", &email)?;
    Ok(read_identity(path, config_override))
}

fn clear_identity_with_override(
    path: &str,
    config_override: Option<&str>,
) -> Result<ProjectIdentity, AppError> {
    for key in IDENTITY_KEYS {
        unset_local_config(path, key)?;
    }
    Ok(read_identity(path, config_override))
}

pub(crate) fn read_project_identity(path: String) -> Result<ProjectIdentity, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_project_identity", None)?;
    Ok(read_identity(&path, None))
}

pub(crate) fn set_project_identity(
    path: String,
    name: String,
    email: String,
) -> Result<ProjectIdentity, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "set_project_identity", None)?;
    set_identity_with_override(&path, &name, &email, None)
}

pub(crate) fn clear_project_identity(path: String) -> Result<ProjectIdentity, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "clear_project_identity", None)?;
    clear_identity_with_override(&path, None)
}

/// Which of the two ignore files a call is about.
///
/// They are separated because who *sees* them differs: `.gitignore` is part of
/// the project and reaches everyone who has it, while `.git/info/exclude` never
/// leaves this copy. Offering only the first would push one person's editor
/// noise into everyone else's project.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum IgnoreScope {
    Project,
    Personal,
}

impl IgnoreScope {
    fn parse(scope: &str) -> Result<Self, AppError> {
        match scope {
            "project" => Ok(Self::Project),
            "personal" => Ok(Self::Personal),
            _ => Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "That isn't one of the ignore files.",
            )),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Personal => "personal",
        }
    }

    fn relative_path(self) -> &'static str {
        match self {
            Self::Project => ".gitignore",
            Self::Personal => ".git/info/exclude",
        }
    }

    fn locate(self, repository: &RepositoryContext) -> PathBuf {
        match self {
            Self::Project => repository.worktree_root.backend_path().join(".gitignore"),
            // The worktree's own Git directory, not the common one: a linked
            // worktree has its own `info/exclude`, and Git reads that one.
            Self::Personal => repository
                .git_dir
                .backend_path()
                .join("info")
                .join("exclude"),
        }
    }
}

/// Why a file cannot be edited here. `None` means it can.
#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub(crate) enum IgnoreFileUnavailable {
    TooLarge,
    NotText,
    Unreadable,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IgnoreFile {
    scope: &'static str,
    /// Shown so the panel never has to spell a path Rust already knows.
    relative_path: &'static str,
    exists: bool,
    /// Newlines normalized to `\n` for the editor; the file's own style is
    /// restored on write.
    contents: Option<String>,
    /// What the file was when it was read. A write carrying a stale token is
    /// refused rather than overwriting an edit made outside GitOdile.
    state_token: Option<String>,
    byte_length: u64,
    unavailable: Option<IgnoreFileUnavailable>,
}

/// Large enough for any ignore file a person wrote, small enough that the panel
/// never loads a file it would be unable to display. Beyond it the file is
/// reported as too large rather than silently truncated, because a truncated
/// save would delete rules.
const IGNORE_FILE_MAX_BYTES: u64 = 256 * 1024;

const ABSENT_STATE_TOKEN: &str = "absent";

fn state_token(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.len().hash(&mut hasher);
    bytes.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn unavailable(scope: IgnoreScope, byte_length: u64, reason: IgnoreFileUnavailable) -> IgnoreFile {
    IgnoreFile {
        scope: scope.name(),
        relative_path: scope.relative_path(),
        exists: true,
        contents: None,
        state_token: None,
        byte_length,
        unavailable: Some(reason),
    }
}

fn read_ignore(scope: IgnoreScope, file: &Path) -> IgnoreFile {
    let Ok(metadata) = fs::metadata(file) else {
        return IgnoreFile {
            scope: scope.name(),
            relative_path: scope.relative_path(),
            exists: false,
            contents: Some(String::new()),
            state_token: Some(ABSENT_STATE_TOKEN.to_string()),
            byte_length: 0,
            unavailable: None,
        };
    };
    if !metadata.is_file() {
        return unavailable(scope, 0, IgnoreFileUnavailable::Unreadable);
    }
    if metadata.len() > IGNORE_FILE_MAX_BYTES {
        return unavailable(scope, metadata.len(), IgnoreFileUnavailable::TooLarge);
    }
    let Ok(bytes) = fs::read(file) else {
        return unavailable(scope, metadata.len(), IgnoreFileUnavailable::Unreadable);
    };
    let token = state_token(&bytes);
    let length = bytes.len() as u64;
    match String::from_utf8(bytes) {
        Ok(text) => IgnoreFile {
            scope: scope.name(),
            relative_path: scope.relative_path(),
            exists: true,
            contents: Some(text.replace("\r\n", "\n")),
            state_token: Some(token),
            byte_length: length,
            unavailable: None,
        },
        Err(_) => unavailable(scope, length, IgnoreFileUnavailable::NotText),
    }
}

/// Whether every line in the file ends `\r\n`.
///
/// One CRLF pair is not enough to call the file a Windows one: a file both a
/// Windows editor and a Unix tool have touched holds a few of each, and
/// rewriting all of it in the majority style would change lines the user never
/// edited. A mixed file has no style of its own to preserve, so it is written
/// back the way Git and every ignore file convention spell it.
fn is_entirely_crlf(bytes: &[u8]) -> bool {
    let mut saw_line_ending = false;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' {
            saw_line_ending = true;
            if index == 0 || bytes[index - 1] != b'\r' {
                return false;
            }
        }
    }
    saw_line_ending
}

/// Restores the file's own line endings and guarantees the trailing newline Git
/// expects. A rule on the last line without one still applies, but every editor
/// that later appends to the file would join two rules into one.
fn ignore_file_bytes(contents: &str, uses_crlf: bool) -> Vec<u8> {
    let mut normalized = contents.replace("\r\n", "\n").replace('\r', "\n");
    if !normalized.is_empty() && !normalized.ends_with('\n') {
        normalized.push('\n');
    }
    if uses_crlf {
        normalized = normalized.replace('\n', "\r\n");
    }
    normalized.into_bytes()
}

pub(crate) fn read_ignore_file(path: String, scope: String) -> Result<IgnoreFile, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "read_ignore_file", None)?;
    let scope = IgnoreScope::parse(&scope)?;
    Ok(read_ignore(scope, &scope.locate(&repository)))
}

pub(crate) fn write_ignore_file(
    path: String,
    scope: String,
    contents: String,
    state_token_from_read: String,
) -> Result<IgnoreFile, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "write_ignore_file", None)?;
    let scope = IgnoreScope::parse(&scope)?;
    let file = scope.locate(&repository);

    if contents.contains('\0') {
        return Err(AppError::new(
            AppErrorCode::IgnoreFileNotText,
            "This ignore file has to be plain text.",
        )
        .with_remediation("Remove the unsupported characters and try again."));
    }
    if contents.len() as u64 > IGNORE_FILE_MAX_BYTES {
        return Err(AppError::new(
            AppErrorCode::IgnoreFileTooLarge,
            "This ignore file is too large for GitOdile to save.",
        )
        .with_remediation("Edit it in a text editor instead."));
    }

    // Checked before the file is read, exactly as the read path does: the token
    // comparison below would reject an oversized file anyway, but only after
    // pulling all of it into memory.
    if let Ok(metadata) = fs::metadata(&file) {
        if metadata.len() > IGNORE_FILE_MAX_BYTES {
            return Err(AppError::new(
                AppErrorCode::IgnoreFileTooLarge,
                "This ignore file is too large for GitOdile to save.",
            )
            .with_remediation("Edit it in a text editor instead."));
        }
    }

    let current = fs::read(&file).ok();
    let current_token = current
        .as_deref()
        .map_or_else(|| ABSENT_STATE_TOKEN.to_string(), state_token);
    if current_token != state_token_from_read {
        return Err(AppError::new(
            AppErrorCode::StaleIgnoreFile,
            "This ignore file changed outside GitOdile since it was opened.",
        )
        .with_remediation("Reopen it to see the current rules before saving again."));
    }

    let uses_crlf = current.as_deref().is_some_and(is_entirely_crlf);
    let bytes = ignore_file_bytes(&contents, uses_crlf);

    let write_failed = |detail: &str| {
        AppError::new(
            AppErrorCode::IgnoreFileWriteFailed,
            "GitOdile couldn't save this ignore file.",
        )
        .with_remediation("Check that the file and its folder are writable, then try again.")
        .with_detail(detail.to_string())
    };
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| write_failed(&error.to_string()))?;
    }
    // Written beside the file and renamed over it, so an interrupted save
    // cannot leave the user with a half-written ignore file.
    let temporary = file.with_extension("gitodile-temp");
    fs::write(&temporary, &bytes).map_err(|error| write_failed(&error.to_string()))?;
    if let Err(error) = fs::rename(&temporary, &file) {
        let _ = fs::remove_file(&temporary);
        return Err(write_failed(&error.to_string()));
    }

    Ok(read_ignore(scope, &file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git_command::in_test_frame;
    use crate::test_support::{git_init, unique_temp_dir, write_test_identity_config};

    fn context(path: &str) -> RepositoryContext {
        in_test_frame(|| crate::repository_access::global().context(Path::new(path))).unwrap()
    }

    #[test]
    fn ignore_file_bytes_keep_the_files_own_line_endings() {
        assert_eq!(
            ignore_file_bytes("build\nnode_modules", false),
            b"build\nnode_modules\n"
        );
        assert_eq!(
            ignore_file_bytes("build\r\nnode_modules\r\n", true),
            b"build\r\nnode_modules\r\n"
        );
        // A file that was empty stays empty rather than gaining a blank line.
        assert_eq!(ignore_file_bytes("", false), Vec::<u8>::new());
    }

    #[test]
    fn scoped_config_is_parsed_in_gits_own_precedence_order() {
        // `scope\0key\nvalue\0`, system first and this repository last.
        let values = parse_scoped_config(
            "system\0user.name\nSystem Person\0global\0user.name\nGlobal Person\0\
             global\0user.email\nglobal@example.test\0local\0user.name\nProject Person\0",
        );
        let identity = identity_from_scoped_values(&values);
        assert_eq!(identity.local_name.as_deref(), Some("Project Person"));
        assert_eq!(identity.local_email, None);
        // The global name wins over the system one, and the email nobody set
        // locally is inherited whole.
        assert_eq!(identity.inherited_name.as_deref(), Some("Global Person"));
        assert_eq!(
            identity.inherited_email.as_deref(),
            Some("global@example.test")
        );
        assert_eq!(identity.effective_name.as_deref(), Some("Project Person"));
        assert_eq!(
            identity.effective_email.as_deref(),
            Some("global@example.test")
        );
        assert_eq!(identity.source, ProjectIdentitySource::Project);

        // A system-only identity is inherited, which the three-query fallback
        // could only report by asking Git a third time.
        let system_only =
            identity_from_scoped_values(&parse_scoped_config("system\0user.name\nOnly System\0"));
        assert_eq!(system_only.source, ProjectIdentitySource::Inherited);
        assert_eq!(system_only.inherited_name.as_deref(), Some("Only System"));

        assert_eq!(
            identity_from_scoped_values(&parse_scoped_config("")).source,
            ProjectIdentitySource::Unset
        );
    }

    #[test]
    fn a_files_line_endings_are_only_kept_when_they_all_agree() {
        assert!(is_entirely_crlf(b"a\r\nb\r\n"));
        assert!(
            !is_entirely_crlf(b"a\r\nb\n"),
            "a mixed file has no style of its own to keep"
        );
        assert!(!is_entirely_crlf(b"a\nb\n"));
        assert!(!is_entirely_crlf(b"no line ending at all"));
    }

    #[test]
    fn the_two_read_paths_agree_about_one_repository() {
        let repo = unique_temp_dir("identity-read-paths");
        git_init(&repo);
        let global = write_test_identity_config("identity-read-paths-global");
        in_test_frame(|| {
            set_identity_with_override(
                &repo,
                "Project Person",
                "person@example.test",
                Some(&global),
            )
        })
        .unwrap();

        // The fast path is what production uses; the fallback is what Git
        // 2.23–2.25 gets. They must not disagree about the same repository.
        let fast = in_test_frame(|| read_identity_with_scopes(&repo, Some(&global)))
            .expect("this Git supports --show-scope");
        let fallback = in_test_frame(|| read_identity_by_scope_queries(&repo, Some(&global)));
        assert_eq!(fast, fallback);
        assert_eq!(fast.local_name.as_deref(), Some("Project Person"));
        assert_eq!(fast.inherited_name.as_deref(), Some("GitOdile Test"));
    }

    #[test]
    fn project_identity_reports_inheritance_override_and_removal() {
        let repo = unique_temp_dir("project-identity");
        git_init(&repo);
        let global = write_test_identity_config("project-identity-global");
        let read = || in_test_frame(|| read_identity(&repo, Some(&global)));

        let inherited = read();
        assert_eq!(inherited.source, ProjectIdentitySource::Inherited);
        assert_eq!(inherited.local_name, None);
        assert_eq!(inherited.effective_name.as_deref(), Some("GitOdile Test"));

        let overridden = in_test_frame(|| {
            set_identity_with_override(
                &repo,
                "Project Person",
                "person@example.test",
                Some(&global),
            )
        })
        .unwrap();
        assert_eq!(overridden.source, ProjectIdentitySource::Project);
        assert_eq!(overridden.local_name.as_deref(), Some("Project Person"));
        assert_eq!(
            overridden.effective_email.as_deref(),
            Some("person@example.test")
        );
        assert_eq!(overridden.inherited_name.as_deref(), Some("GitOdile Test"));

        let cleared = in_test_frame(|| clear_identity_with_override(&repo, Some(&global))).unwrap();
        assert_eq!(cleared.source, ProjectIdentitySource::Inherited);
        assert_eq!(cleared.local_name, None);
        assert_eq!(cleared.effective_name.as_deref(), Some("GitOdile Test"));

        // Clearing twice is the same outcome, not a failure.
        assert!(in_test_frame(|| clear_identity_with_override(&repo, Some(&global))).is_ok());
        assert_eq!(read().source, ProjectIdentitySource::Inherited);

        assert_eq!(
            in_test_frame(|| set_identity_with_override(
                &repo,
                "  ",
                "person@example.test",
                Some(&global)
            ))
            .unwrap_err()
            .code,
            AppErrorCode::InvalidIdentity
        );
    }

    #[test]
    fn ignore_files_are_created_read_and_guarded_against_outside_edits() {
        let repo = unique_temp_dir("ignore-files");
        git_init(&repo);
        let repository = context(&repo);

        let absent = read_ignore_file(repo.clone(), "project".into()).unwrap();
        assert!(!absent.exists);
        assert_eq!(absent.state_token.as_deref(), Some(ABSENT_STATE_TOKEN));

        let written = write_ignore_file(
            repo.clone(),
            "project".into(),
            "build\nnode_modules".into(),
            ABSENT_STATE_TOKEN.into(),
        )
        .unwrap();
        assert!(written.exists);
        assert_eq!(written.contents.as_deref(), Some("build\nnode_modules\n"));
        assert_eq!(
            fs::read_to_string(repository.worktree_root.backend_path().join(".gitignore")).unwrap(),
            "build\nnode_modules\n"
        );

        // The token from the first read is stale now.
        assert_eq!(
            write_ignore_file(
                repo.clone(),
                "project".into(),
                "other".into(),
                ABSENT_STATE_TOKEN.into(),
            )
            .unwrap_err()
            .code,
            AppErrorCode::StaleIgnoreFile
        );

        let personal = write_ignore_file(
            repo.clone(),
            "personal".into(),
            "scratch/".into(),
            read_ignore_file(repo.clone(), "personal".into())
                .unwrap()
                .state_token
                .unwrap(),
        )
        .unwrap();
        assert_eq!(personal.relative_path, ".git/info/exclude");
        assert!(fs::read_to_string(
            repository
                .git_dir
                .backend_path()
                .join("info")
                .join("exclude")
        )
        .unwrap()
        .contains("scratch/"));

        assert_eq!(
            read_ignore_file(repo.clone(), "everything".into())
                .unwrap_err()
                .code,
            AppErrorCode::InvalidSelection
        );
        assert_eq!(
            write_ignore_file(
                repo,
                "project".into(),
                "a\0b".into(),
                written.state_token.unwrap()
            )
            .unwrap_err()
            .code,
            AppErrorCode::IgnoreFileNotText
        );
    }

    #[test]
    fn an_oversized_ignore_file_is_refused_by_the_write_path_too() {
        let repo = unique_temp_dir("ignore-oversized-write");
        git_init(&repo);
        let repository = context(&repo);
        let file = repository.worktree_root.backend_path().join(".gitignore");
        fs::write(&file, vec![b'a'; (IGNORE_FILE_MAX_BYTES + 1) as usize]).unwrap();

        // Refused on the file's size, before its bytes are pulled into memory
        // to be hashed — the read path already refuses it the same way.
        assert_eq!(
            write_ignore_file(repo, "project".into(), "build/".into(), "anything".into())
                .unwrap_err()
                .code,
            AppErrorCode::IgnoreFileTooLarge
        );
    }

    #[test]
    fn an_oversized_ignore_file_is_reported_rather_than_truncated() {
        let repo = unique_temp_dir("ignore-oversized");
        git_init(&repo);
        let repository = context(&repo);
        let file = repository.worktree_root.backend_path().join(".gitignore");
        fs::write(&file, vec![b'a'; (IGNORE_FILE_MAX_BYTES + 1) as usize]).unwrap();

        let read = read_ignore_file(repo, "project".into()).unwrap();
        assert_eq!(read.unavailable, Some(IgnoreFileUnavailable::TooLarge));
        assert_eq!(read.contents, None);
        assert!(read.byte_length > IGNORE_FILE_MAX_BYTES);
    }
}
