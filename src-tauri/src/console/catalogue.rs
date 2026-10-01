//! Fixed, read-only Git queries for the console's catalogue shortcuts.
//! Shortcut names never cross this boundary; the renderer may select only one
//! catalogue ID, and each maps to a reviewed argument template.

use super::{plain_text, CONSOLE_ENV};
use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::run_git_bounded_with_env;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Query {
    Status,
    Diff,
    Staged,
    Log,
    Graph,
    Last,
    Branches,
    Tags,
    Remotes,
    Stashes,
    Authors,
}

impl Query {
    fn parse(id: &str) -> Result<Self, AppError> {
        match id {
            "status" => Ok(Self::Status),
            "diff" => Ok(Self::Diff),
            "staged" => Ok(Self::Staged),
            "log" => Ok(Self::Log),
            "graph" => Ok(Self::Graph),
            "last" => Ok(Self::Last),
            "branches" => Ok(Self::Branches),
            "tags" => Ok(Self::Tags),
            "remotes" => Ok(Self::Remotes),
            "stashes" => Ok(Self::Stashes),
            "authors" => Ok(Self::Authors),
            _ => Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "That console query isn't available.",
            )
            .with_remediation("Choose one of the listed read-only queries.")),
        }
    }

    fn args(self) -> &'static [&'static str] {
        match self {
            Self::Status => &["status"],
            Self::Diff => &["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--"],
            Self::Staged => &[
                "diff",
                "--cached",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--",
            ],
            Self::Log => &[
                "log",
                "--max-count=20",
                "--oneline",
                "--no-show-signature",
                "--no-color",
            ],
            Self::Graph => &[
                "log",
                "--graph",
                "--oneline",
                "--decorate=short",
                "--all",
                "--max-count=40",
                "--no-show-signature",
                "--no-color",
            ],
            // The newest saved version with its file summary, not its patch:
            // `diff` and `staged` are where patches are read.
            Self::Last => &[
                "show",
                "--stat",
                "--format=medium",
                "--no-show-signature",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "HEAD",
            ],
            Self::Branches => &["branch", "--list", "--no-color", "--no-column"],
            Self::Tags => &[
                "tag",
                "--list",
                "--sort=-creatordate",
                "--no-color",
                "--no-column",
            ],
            Self::Remotes => &["remote", "--verbose"],
            Self::Stashes => &["stash", "list", "--no-color"],
            // `shortlog` reads standard input when given no revision, so the
            // revision is part of the template.
            Self::Authors => &["shortlog", "--summary", "--numbered", "--no-merges", "HEAD"],
        }
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsoleQueryResult {
    pub(crate) operation_id: String,
    pub(crate) command: String,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) success: bool,
    pub(crate) truncated: bool,
}

pub(crate) fn run_console_query(
    path: String,
    operation_id: String,
) -> Result<ConsoleQueryResult, AppError> {
    // Reject invalid IDs before repository discovery or any Git process.
    let query = Query::parse(&operation_id)?;
    let (_repository, _access) =
        application::authorize_repository(&path, "run_console_query", None)?;
    let args = query.args();
    let output = run_git_bounded_with_env(&path, args, CONSOLE_ENV)?;
    Ok(ConsoleQueryResult {
        operation_id,
        command: format!("git {}", args.join(" ")),
        stdout: plain_text(&output.stdout),
        stderr: plain_text(&output.stderr),
        exit_code: output.status.code(),
        success: output.status.success(),
        truncated: output.stdout_truncated || output.stderr_truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{git_add, git_commit, git_init, unique_temp_dir, write_file};

    #[test]
    fn catalogue_is_closed_and_arguments_are_fixed() {
        let policy = application::policy("run_console_query");
        assert_eq!(policy.class, crate::git::OperationClass::ReadOnly);
        assert_eq!(policy.stdout_cap, 64 * 1024);
        assert_eq!(policy.stderr_cap, 8 * 1024);
        assert_eq!(policy.timeout, std::time::Duration::from_secs(15));
        assert_eq!(Query::Status.args(), &["status"]);
        assert_eq!(
            Query::Diff.args(),
            &["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--"]
        );
        assert_eq!(
            Query::Log.args(),
            &[
                "log",
                "--max-count=20",
                "--oneline",
                "--no-show-signature",
                "--no-color"
            ]
        );
        assert_eq!(
            Query::Branches.args(),
            &["branch", "--list", "--no-color", "--no-column"]
        );
        for (id, query) in [
            ("staged", Query::Staged),
            ("graph", Query::Graph),
            ("last", Query::Last),
            ("tags", Query::Tags),
            ("remotes", Query::Remotes),
            ("stashes", Query::Stashes),
            ("authors", Query::Authors),
        ] {
            assert_eq!(Query::parse(id).unwrap(), query);
            // No template reaches the network, an editor, a pager, colour or an
            // external diff or text conversion program.
            let args = query.args();
            for forbidden in [
                "fetch",
                "push",
                "pull",
                "--ext-diff",
                "--textconv",
                "--color",
                "-c",
            ] {
                assert!(!args.contains(&forbidden), "{id} has {forbidden}");
            }
        }
        for id in [
            "",
            "status --porcelain",
            "!rm",
            "push",
            "STATUS",
            "diff; status",
        ] {
            assert_eq!(
                Query::parse(id).unwrap_err().code,
                AppErrorCode::InvalidSelection
            );
        }
    }

    #[test]
    fn four_queries_read_a_temporary_repository() {
        let path = unique_temp_dir("console-read");
        git_init(&path);
        write_file(&path, "file.txt", "first\n");
        git_add(&path, "file.txt");
        git_commit(&path, "first version");
        write_file(&path, "file.txt", "second\n");
        for (id, needle) in [
            ("status", "modified:"),
            ("diff", "+second"),
            ("log", "first version"),
            ("branches", "* "),
        ] {
            let result = run_console_query(path.clone(), id.into()).unwrap();
            assert!(result.success, "{id}: {}", result.stderr);
            assert!(result.stdout.contains(needle), "{id}: {}", result.stdout);
            assert!(!result.truncated);
        }
        write_file(
            &path,
            "file.txt",
            &format!("first\n{}\n", "x".repeat(100_000)),
        );
        let large = run_console_query(path.clone(), "diff".into()).unwrap();
        assert!(large.success);
        assert!(large.truncated);
        assert!(large.stdout.len() <= 64 * 1024);
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn added_queries_read_a_temporary_repository() {
        let path = unique_temp_dir("console-more");
        git_init(&path);
        write_file(
            &path, "file.txt", "first
",
        );
        git_add(&path, "file.txt");
        git_commit(&path, "first version");
        let tagged = std::process::Command::new("git")
            .args(["tag", "v1"])
            .current_dir(&path)
            .status()
            .unwrap();
        assert!(tagged.success());
        write_file(
            &path, "file.txt", "staged
",
        );
        git_add(&path, "file.txt");
        for (id, needle) in [
            ("staged", "+staged"),
            ("graph", "first version"),
            ("last", "file.txt"),
            ("tags", "v1"),
            ("authors", "GitOdile Test"),
        ] {
            let result = run_console_query(path.clone(), id.into()).unwrap();
            assert!(result.success, "{id}: {}", result.stderr);
            assert!(result.stdout.contains(needle), "{id}: {}", result.stdout);
        }
        for id in ["remotes", "stashes"] {
            let result = run_console_query(path.clone(), id.into()).unwrap();
            assert!(result.success, "{id}: {}", result.stderr);
            assert!(result.stdout.is_empty(), "{id}: {}", result.stdout);
        }
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn empty_and_failed_queries_are_distinct() {
        let path = unique_temp_dir("console-empty");
        git_init(&path);
        let branches = run_console_query(path.clone(), "branches".into()).unwrap();
        assert!(branches.success);
        assert!(branches.stdout.is_empty());
        let log = run_console_query(path.clone(), "log".into()).unwrap();
        assert!(!log.success);
        assert!(!log.stderr.is_empty());
        std::fs::remove_dir_all(path).unwrap();
    }
}
