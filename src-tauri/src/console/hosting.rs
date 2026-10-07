//! The project's hosting provider, and the read-only gh/glab shortcuts that
//! ask it about the project (task 148-12).
//!
//! Like the Git catalogue, the renderer selects one shortcut ID and Rust maps
//! it to a fixed argument template; no renderer text reaches gh or glab. The
//! remote the project publishes to decides which CLI runs. Each CLI runs in
//! the project folder with its own login, prompts, pager, colour and update
//! checks off, and the host pinned to the one GitOdile detected.

use super::{plain_text, CONSOLE_ENV};
use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git::{run_program, ExecutionPolicy, ProgramFailure};
use std::path::Path;
use std::process::Command;

/// Where the project's remote lives, as far as GitOdile can tell.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostKind {
    Github,
    Gitlab,
    Bitbucket,
    /// A Git server GitOdile has no integration for.
    Git,
    /// No remote: the project lives only on this computer.
    Local,
    /// Several remotes and none the current line publishes to or `origin`.
    Unclear,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsoleHost {
    pub(crate) kind: HostKind,
    /// The server's `host[:port]`, when there is a remote to read it from.
    pub(crate) host: Option<String>,
    /// A GitHub Enterprise Server or GitLab Self-Managed server added in
    /// Settings, rather than GitHub.com or GitLab.com.
    pub(crate) company_server: bool,
    /// The remote this was read from.
    pub(crate) remote: Option<String>,
}

impl ConsoleHost {
    fn without_remote(kind: HostKind) -> Self {
        Self {
            kind,
            host: None,
            company_server: false,
            remote: None,
        }
    }
}

/// The remote a person means by "the project's remote": the one the current
/// line publishes to, else `origin`, else the only one.
fn chosen_remote(remotes: &crate::sync::ProjectRemotes) -> Option<&crate::sync::ProjectRemote> {
    let named = |name: &str| remotes.remotes.iter().find(|remote| remote.name == name);
    remotes
        .upstream_remote
        .as_deref()
        .and_then(named)
        .or_else(|| named("origin"))
        .or_else(|| (remotes.remotes.len() == 1).then(|| &remotes.remotes[0]))
}

/// The host name, `host[:port]` authority and whether the remote names that
/// exact authority (HTTP and HTTPS) rather than only a host (SSH and the
/// scp-like form), from a remote URL in any form Git accepts. Local paths and
/// `file://` have none.
fn remote_address(url: &str) -> Option<(String, String, bool)> {
    if url.contains("://") {
        let parsed = reqwest::Url::parse(url).ok()?;
        if !matches!(parsed.scheme(), "https" | "http" | "ssh" | "git") {
            return None;
        }
        let name = parsed.host_str()?.to_ascii_lowercase();
        let authority = crate::credentials::authority(&parsed)?.to_ascii_lowercase();
        let exact = matches!(parsed.scheme(), "https" | "http");
        return Some((name, authority, exact));
    }
    // scp-like `[user@]host:path`. A single letter before the colon is a
    // Windows drive, and a slash before it makes it a local path.
    let (before, _) = url.split_once(':')?;
    if before.contains('/') || before.contains('\\') || before.len() < 2 {
        return None;
    }
    let name = before.rsplit('@').next()?.to_ascii_lowercase();
    (!name.is_empty()).then(|| (name.clone(), name, false))
}

fn host_for_address(
    name: &str,
    authority: &str,
    exact: bool,
    servers: impl Fn(&str) -> Vec<(String, &'static str)>,
) -> (HostKind, bool) {
    match name {
        "github.com" => return (HostKind::Github, false),
        "gitlab.com" => return (HostKind::Gitlab, false),
        "bitbucket.org" => return (HostKind::Bitbucket, false),
        _ => {}
    }
    // A company server matches its exact authority over HTTP(S), its host
    // name over SSH, as Git's credential checks do.
    let server = servers(name)
        .into_iter()
        .find(|(server, _)| !exact || server == authority);
    match server.map(|(_, kind)| kind) {
        Some("github") => (HostKind::Github, true),
        Some("gitlab") => (HostKind::Gitlab, true),
        _ => (HostKind::Git, false),
    }
}

fn detect(path: &str) -> Result<ConsoleHost, AppError> {
    let remotes = crate::sync::project_remotes(path)?;
    if remotes.remotes.is_empty() {
        return Ok(ConsoleHost::without_remote(HostKind::Local));
    }
    let Some(remote) = chosen_remote(&remotes) else {
        return Ok(ConsoleHost::without_remote(HostKind::Unclear));
    };
    let Some((name, authority, exact)) = remote_address(&remote.url) else {
        // A remote on a local path or a mounted folder.
        return Ok(ConsoleHost {
            remote: Some(remote.name.clone()),
            ..ConsoleHost::without_remote(HostKind::Git)
        });
    };
    let (kind, company_server) = host_for_address(
        &name,
        &authority,
        exact,
        crate::credentials::providers_named,
    );
    Ok(ConsoleHost {
        kind,
        host: Some(authority),
        company_server,
        remote: Some(remote.name.clone()),
    })
}

/// The provider the console's welcome names. Reads only the project's own
/// configuration; nothing reaches the network.
pub(crate) fn read_console_host(path: String) -> Result<ConsoleHost, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_console_host", None)?;
    detect(&path)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum HostQuery {
    Prs,
    MyPrs,
    Issues,
    Runs,
    Checks,
    Repo,
}

impl HostQuery {
    fn parse(id: &str) -> Result<Self, AppError> {
        match id {
            "prs" => Ok(Self::Prs),
            "my-prs" => Ok(Self::MyPrs),
            "issues" => Ok(Self::Issues),
            "runs" => Ok(Self::Runs),
            "checks" => Ok(Self::Checks),
            "repo" => Ok(Self::Repo),
            _ => Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "That console query isn't available.",
            )
            .with_remediation("Choose one of the listed read-only queries.")),
        }
    }

    /// The program and its fixed, read-only arguments. None of them opens a
    /// browser, writes, or prints a credential.
    fn template(self, kind: HostKind) -> Option<(&'static str, &'static [&'static str])> {
        let args: &'static [&'static str] = match (kind, self) {
            (HostKind::Github, Self::Prs) => &["pr", "list", "--limit", "20"],
            (HostKind::Github, Self::MyPrs) => &["pr", "status"],
            (HostKind::Github, Self::Issues) => &["issue", "list", "--limit", "20"],
            (HostKind::Github, Self::Runs) => &["run", "list", "--limit", "20"],
            (HostKind::Github, Self::Checks) => &["pr", "checks"],
            (HostKind::Github, Self::Repo) => &["repo", "view"],
            (HostKind::Gitlab, Self::Prs) => &["mr", "list", "--per-page", "20"],
            (HostKind::Gitlab, Self::MyPrs) => &["mr", "list", "--author=@me"],
            (HostKind::Gitlab, Self::Issues) => &["issue", "list", "--per-page", "20"],
            (HostKind::Gitlab, Self::Runs) => &["ci", "list", "--per-page", "20"],
            (HostKind::Gitlab, Self::Checks) => &["ci", "status"],
            (HostKind::Gitlab, Self::Repo) => &["repo", "view"],
            _ => return None,
        };
        Some((
            if kind == HostKind::Github {
                "gh"
            } else {
                "glab"
            },
            args,
        ))
    }
}

/// Why a hosting shortcut gave no answer of its own.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostingUnavailable {
    /// The project's remote is not on GitHub or GitLab, or there is none.
    NotSupported,
    /// gh or glab is not installed.
    CliMissing,
    /// The CLI ran and said it has no login for this host.
    SignedOut,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsoleHostingResult {
    pub(crate) operation_id: String,
    /// The command as someone would type it; absent when none could run.
    pub(crate) command: Option<String>,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) success: bool,
    pub(crate) truncated: bool,
    pub(crate) host: ConsoleHost,
    pub(crate) unavailable: Option<HostingUnavailable>,
}

impl ConsoleHostingResult {
    fn unavailable(
        operation_id: String,
        command: Option<String>,
        host: ConsoleHost,
        reason: HostingUnavailable,
    ) -> Self {
        Self {
            operation_id,
            command,
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            success: false,
            truncated: false,
            host,
            unavailable: Some(reason),
        }
    }
}

/// gh: no prompt, pager, colour, spinner, telemetry or update notice, and a
/// table as wide as the console rather than gh's tab-separated pipe output.
const GH_ENV: &[(&str, &str)] = &[
    ("NO_COLOR", "1"),
    ("CLICOLOR", "0"),
    ("GH_PROMPT_DISABLED", "1"),
    ("GH_NO_UPDATE_NOTIFIER", "1"),
    ("GH_NO_EXTENSION_UPDATE_NOTIFIER", "1"),
    ("GH_SPINNER_DISABLED", "1"),
    ("GH_TELEMETRY", "0"),
    ("GH_PAGER", ""),
    ("PAGER", ""),
    ("GH_FORCE_TTY", "100"),
];

/// glab: no prompt, colour, hyperlinks or update check.
const GLAB_ENV: &[(&str, &str)] = &[
    ("NO_COLOR", "1"),
    ("GLAB_NO_PROMPT", "1"),
    ("GLAB_CHECK_UPDATE", "false"),
    ("GLAB_DISPLAY_HYPERLINKS", "false"),
    ("GLAB_PAGER", ""),
    ("PAGER", ""),
];

/// Inherited settings that would print debugging traffic, force a terminal or
/// point the CLI at another repository or host than the detected one.
const REMOVED_ENV: &[&str] = &[
    "DEBUG",
    "GH_DEBUG",
    "GH_REPO",
    "GH_HOST",
    "GLAB_DEBUG",
    "GLAB_FORCE_TTY",
    "GITLAB_HOST",
    "GITLAB_URI",
    "GL_HOST",
    "CLICOLOR_FORCE",
];

fn command(program: &str, args: &[&str], kind: HostKind, host: &str, path: &str) -> Command {
    let mut command = Command::new(program);
    command.args(args).current_dir(Path::new(path));
    for key in REMOVED_ENV {
        command.env_remove(key);
    }
    // gh and glab run Git themselves to read the project; those processes get
    // the console's own inert Git environment.
    command.envs(CONSOLE_ENV.iter().copied());
    if kind == HostKind::Github {
        command.envs(GH_ENV.iter().copied()).env("GH_HOST", host);
    } else {
        command
            .envs(GLAB_ENV.iter().copied())
            .env("GITLAB_HOST", host);
    }
    command
}

fn looks_signed_out(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("gh auth login")
        || lower.contains("glab auth login")
        || lower.contains("not logged in")
        || lower.contains("401 unauthorized")
}

fn hosting_error(message: &str) -> AppError {
    AppError::new(AppErrorCode::GitCommandFailed, message)
}

/// Runs one hosting shortcut for the project with the installed gh or glab.
pub(crate) fn run_console_hosting_query(
    path: String,
    operation_id: String,
) -> Result<ConsoleHostingResult, AppError> {
    // Reject invalid IDs before repository discovery or any process.
    let query = HostQuery::parse(&operation_id)?;
    let (_repository, _access) =
        application::authorize_repository(&path, "run_console_hosting_query", None)?;
    let host = detect(&path)?;
    let (Some((program, args)), Some(authority)) = (query.template(host.kind), host.host.clone())
    else {
        return Ok(ConsoleHostingResult::unavailable(
            operation_id,
            None,
            host,
            HostingUnavailable::NotSupported,
        ));
    };
    let display = format!("{program} {}", args.join(" "));
    let candidates = if program == "gh" {
        crate::tooling::gh_program_candidates()
            .iter()
            .map(|candidate| (*candidate).to_string())
            .collect::<Vec<_>>()
    } else {
        crate::tooling::glab_program_candidates()
    };
    let policy: ExecutionPolicy = application::current_policy()
        .ok_or_else(|| hosting_error("The console query has no execution policy."))?;
    let cancellation = application::current_cancellation();
    for candidate in candidates {
        let process = command(&candidate, args, host.kind, &authority, &path);
        let output = match run_program(process, policy, cancellation.as_ref()) {
            Ok(output) => output,
            Err(ProgramFailure::Start(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                continue
            }
            Err(ProgramFailure::TimedOut) => {
                return Err(AppError::new(
                    AppErrorCode::GitTimeout,
                    "The hosting service took too long to answer, so the query was stopped.",
                )
                .with_remediation("Check your connection and try again."))
            }
            Err(ProgramFailure::Cancelled) => {
                return Err(AppError::new(
                    AppErrorCode::OperationCancelled,
                    "The console query was cancelled.",
                ))
            }
            Err(_) => return Err(hosting_error("The hosting CLI couldn't be run.")),
        };
        let stderr = plain_text(&output.stderr);
        let unavailable = (!output.status.success() && looks_signed_out(&stderr))
            .then_some(HostingUnavailable::SignedOut);
        return Ok(ConsoleHostingResult {
            operation_id,
            command: Some(display),
            stdout: plain_text(&output.stdout),
            stderr,
            exit_code: output.status.code(),
            success: output.status.success(),
            truncated: output.stdout_truncated || output.stderr_truncated,
            host,
            unavailable,
        });
    }
    Ok(ConsoleHostingResult::unavailable(
        operation_id,
        Some(display),
        host,
        HostingUnavailable::CliMissing,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::{ProjectRemote, ProjectRemotes};
    use crate::test_support::{git_add, git_commit, git_init, unique_temp_dir, write_file};

    fn remote(name: &str, url: &str) -> ProjectRemote {
        ProjectRemote {
            name: name.into(),
            url: url.into(),
            push_url: None,
            has_hidden_credentials: false,
        }
    }

    #[test]
    fn the_chosen_remote_is_the_upstream_then_origin_then_the_only_one() {
        let two = ProjectRemotes {
            remotes: vec![remote("fork", "a"), remote("origin", "b")],
            upstream_remote: Some("fork".into()),
        };
        assert_eq!(chosen_remote(&two).unwrap().name, "fork");
        let no_upstream = ProjectRemotes {
            upstream_remote: None,
            ..two
        };
        assert_eq!(chosen_remote(&no_upstream).unwrap().name, "origin");
        let one = ProjectRemotes {
            remotes: vec![remote("company", "c")],
            upstream_remote: None,
        };
        assert_eq!(chosen_remote(&one).unwrap().name, "company");
        let unclear = ProjectRemotes {
            remotes: vec![remote("a", "a"), remote("b", "b")],
            upstream_remote: None,
        };
        assert!(chosen_remote(&unclear).is_none());
    }

    #[test]
    fn remote_addresses_are_read_from_every_form_git_accepts() {
        for (url, expected) in [
            (
                "https://github.com/team/app.git",
                Some(("github.com", "github.com", true)),
            ),
            (
                "https://GitLab.example.com:8443/group/sub/app",
                Some(("gitlab.example.com", "gitlab.example.com:8443", true)),
            ),
            (
                "http://git.example.com/team/app.git",
                Some(("git.example.com", "git.example.com", true)),
            ),
            (
                "ssh://git@git.example.com:2222/team/app.git",
                Some(("git.example.com", "git.example.com:2222", false)),
            ),
            (
                "git@gitlab.com:group/app.git",
                Some(("gitlab.com", "gitlab.com", false)),
            ),
            (
                "bitbucket.org:team/app.git",
                Some(("bitbucket.org", "bitbucket.org", false)),
            ),
            ("C:\\work\\bare.git", None),
            ("C:/work/bare.git", None),
            ("/srv/git/app.git", None),
            ("../app.git", None),
            ("file:///srv/git/app.git", None),
        ] {
            let read = remote_address(url);
            assert_eq!(
                read.as_ref().map(|(name, authority, exact)| (
                    name.as_str(),
                    authority.as_str(),
                    *exact
                )),
                expected,
                "{url}"
            );
        }
    }

    #[test]
    fn public_hosts_company_servers_and_other_servers_are_told_apart() {
        let servers = |name: &str| match name {
            "git.corp.example" => vec![("git.corp.example".to_string(), "github")],
            "gitlab.corp.example" => vec![("gitlab.corp.example:8443".to_string(), "gitlab")],
            _ => Vec::new(),
        };
        let kind = |name: &str, authority: &str, exact: bool| {
            host_for_address(name, authority, exact, servers)
        };
        assert_eq!(
            kind("github.com", "github.com", true),
            (HostKind::Github, false)
        );
        assert_eq!(
            kind("gitlab.com", "gitlab.com", false),
            (HostKind::Gitlab, false)
        );
        assert_eq!(
            kind("bitbucket.org", "bitbucket.org", true),
            (HostKind::Bitbucket, false)
        );
        assert_eq!(
            kind("git.corp.example", "git.corp.example", true),
            (HostKind::Github, true)
        );
        // HTTP(S) must match the server's exact authority; SSH its host name.
        assert_eq!(
            kind("gitlab.corp.example", "gitlab.corp.example", true),
            (HostKind::Git, false)
        );
        assert_eq!(
            kind("gitlab.corp.example", "gitlab.corp.example:8443", true),
            (HostKind::Gitlab, true)
        );
        assert_eq!(
            kind("gitlab.corp.example", "gitlab.corp.example", false),
            (HostKind::Gitlab, true)
        );
        assert_eq!(
            kind("git.example.org", "git.example.org", true),
            (HostKind::Git, false)
        );
    }

    #[test]
    fn templates_are_fixed_reads_for_github_and_gitlab_only() {
        let queries = [
            ("prs", HostQuery::Prs),
            ("my-prs", HostQuery::MyPrs),
            ("issues", HostQuery::Issues),
            ("runs", HostQuery::Runs),
            ("checks", HostQuery::Checks),
            ("repo", HostQuery::Repo),
        ];
        for (id, query) in queries {
            assert_eq!(HostQuery::parse(id).unwrap(), query);
            for kind in [HostKind::Github, HostKind::Gitlab] {
                let (program, args) = query.template(kind).unwrap();
                assert_eq!(
                    program,
                    if kind == HostKind::Github {
                        "gh"
                    } else {
                        "glab"
                    }
                );
                for forbidden in [
                    "api",
                    "auth",
                    "alias",
                    "extension",
                    "config",
                    "browse",
                    "--web",
                    "-w",
                    "create",
                    "merge",
                    "close",
                    "delete",
                    "token",
                    "--live",
                ] {
                    assert!(!args.contains(&forbidden), "{id} {kind:?} has {forbidden}");
                }
            }
            for kind in [
                HostKind::Bitbucket,
                HostKind::Git,
                HostKind::Local,
                HostKind::Unclear,
            ] {
                assert!(query.template(kind).is_none(), "{id} {kind:?}");
            }
        }
        for id in ["", "api", "pr list", "PRS", "prs;rm", "auth"] {
            assert_eq!(
                HostQuery::parse(id).unwrap_err().code,
                AppErrorCode::InvalidSelection
            );
        }
    }

    #[test]
    fn the_renderer_lists_the_commands_rust_runs() {
        // `HOSTING_COMMANDS` in the console domain is what help and the
        // shortcut editor show; it must be exactly what runs.
        let source = include_str!("../../../src/features/console/domain.ts");
        let start = source
            .find("export const HOSTING_COMMANDS")
            .expect("the hosting commands");
        let end = source[start..].find("};").expect("its end") + start;
        let block = &source[start..end];
        for (id, query) in [
            ("prs", HostQuery::Prs),
            ("\"my-prs\"", HostQuery::MyPrs),
            ("issues", HostQuery::Issues),
            ("runs", HostQuery::Runs),
            ("checks", HostQuery::Checks),
            ("repo", HostQuery::Repo),
        ] {
            let (_, github) = query.template(HostKind::Github).unwrap();
            let (_, gitlab) = query.template(HostKind::Gitlab).unwrap();
            let row = format!(
                "{id}: {{ github: \"gh {}\", gitlab: \"glab {}\" }}",
                github.join(" "),
                gitlab.join(" ")
            );
            assert!(block.contains(&row), "missing {row}");
        }
    }

    #[test]
    fn signed_out_answers_are_recognised() {
        assert!(looks_signed_out(
            "To get started with GitHub CLI, please run:  gh auth login"
        ));
        assert!(looks_signed_out(
            "ERROR: 401 Unauthorized. Run glab auth login."
        ));
        assert!(!looks_signed_out(
            "no pull requests found for branch \"main\""
        ));
    }

    #[test]
    fn the_host_is_read_from_the_project_remote_without_the_network() {
        let path = unique_temp_dir("console-host");
        git_init(&path);
        write_file(&path, "file.txt", "first\n");
        git_add(&path, "file.txt");
        git_commit(&path, "first version");
        let _guard = application::enter("read_console_host");
        assert_eq!(detect(&path).unwrap().kind, HostKind::Local);
        let add = |name: &str, url: &str| {
            let status = std::process::Command::new("git")
                .args(["remote", "add", name, url])
                .current_dir(&path)
                .status()
                .unwrap();
            assert!(status.success());
        };
        add("origin", "https://user:secret@github.com/team/app.git");
        let host = detect(&path).unwrap();
        assert_eq!(host.kind, HostKind::Github);
        assert_eq!(host.host.as_deref(), Some("github.com"));
        assert_eq!(host.remote.as_deref(), Some("origin"));
        assert!(!host.company_server);
        add("mirror", "git@gitlab.com:team/app.git");
        // Two remotes, and origin is still the one meant.
        assert_eq!(detect(&path).unwrap().kind, HostKind::Github);
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn a_project_without_a_supported_remote_starts_no_process() {
        let path = unique_temp_dir("console-host-local");
        git_init(&path);
        write_file(&path, "file.txt", "first\n");
        git_add(&path, "file.txt");
        git_commit(&path, "first version");
        let result = run_console_hosting_query(path.clone(), "prs".into()).unwrap();
        assert_eq!(result.unavailable, Some(HostingUnavailable::NotSupported));
        assert_eq!(result.host.kind, HostKind::Local);
        assert!(result.command.is_none());
        assert!(!result.success);
        std::fs::remove_dir_all(path).unwrap();
    }
}
