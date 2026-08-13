use crate::error::{AppError, AppErrorCode};
use crate::git_command::{checked_git_stdout, git_stdout, run_git};
use crate::{application, repository_access, session};
use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
};

pub(crate) fn display_path(path: PathBuf) -> String {
    let value = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        value
            .strip_prefix(r"\\?\UNC\")
            .map(|rest| format!(r"\\{rest}"))
            .or_else(|| value.strip_prefix(r"\\?\").map(ToString::to_string))
            .unwrap_or(value)
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

pub(crate) fn normalized_path(base: &Path, raw_path: &str) -> PathBuf {
    let path = Path::new(raw_path);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    absolute.canonicalize().unwrap_or(absolute)
}

/// Resolves branch/detached/unborn state and the current HEAD SHA for a
/// project whose branch name is already known from a status snapshot.
pub(crate) fn resolve_head_state(
    path: &str,
    branch: Option<String>,
) -> Result<(HeadState, Option<String>), AppError> {
    let verified_head = run_git(path, &["rev-parse", "--verify", "HEAD"])?;
    let head_sha = verified_head
        .status
        .success()
        .then(|| git_stdout(&verified_head));

    let head_state = if branch.is_some() {
        if head_sha.is_some() {
            HeadState::Branch
        } else {
            HeadState::Unborn
        }
    } else if head_sha.is_some() {
        HeadState::Detached
    } else {
        HeadState::Unborn
    };
    Ok((head_state, head_sha))
}

/// Uses Git's own ref parser before a branch name enters a refspec or a
/// version-line mutation.
pub(crate) fn validate_branch_ref_name(path: &str, name: &str) -> Result<(), AppError> {
    let output = run_git(path, &["check-ref-format", "--branch", name])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::InvalidRefName,
            "This version line's name isn't a valid Git reference.",
        )
        .with_remediation("Rename the version line to a valid Git branch name, then try again."))
    }
}

/// Detects an in-progress Git operation from Git's marker files rather than
/// guessing from porcelain status.
pub(crate) fn git_operation_in_progress(path: &str) -> Result<Option<&'static str>, AppError> {
    let git_dir_raw = checked_git_stdout(run_git(path, &["rev-parse", "--absolute-git-dir"])?)?;
    let git_dir = Path::new(&git_dir_raw);
    if git_dir.join("MERGE_HEAD").is_file() {
        return Ok(Some("merge"));
    }
    if git_dir.join("CHERRY_PICK_HEAD").is_file() {
        return Ok(Some("cherry-pick"));
    }
    if git_dir.join("REVERT_HEAD").is_file() {
        return Ok(Some("revert"));
    }
    if git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir() {
        return Ok(Some("rebase"));
    }
    if git_dir.join("BISECT_LOG").is_file() {
        return Ok(Some("bisect"));
    }
    Ok(None)
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryInfo {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) selected_path: String,
    pub(crate) git_dir: String,
    pub(crate) common_git_dir: String,
    pub(crate) branch: Option<String>,
    pub(crate) head_state: HeadState,
    pub(crate) kind: RepositoryKind,
    pub(crate) session_epoch: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RepositoryKind {
    Repository,
    Worktree,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HeadState {
    Branch,
    Detached,
    Unborn,
}

pub(crate) fn open_repository(
    path: String,
    session_epoch: Option<String>,
) -> Result<RepositoryInfo, AppError> {
    let _command = application::enter("open_repository");
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "That folder doesn't exist.")
                .with_remediation("Choose another folder.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "That folder can't be read.")
                .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(
            AppError::new(AppErrorCode::PathUnusable, "That path isn't a folder.")
                .with_remediation("Choose a folder instead of a file."),
        );
    }
    let selected_path_buf = repo_path.canonicalize().map_err(|_| {
        AppError::new(AppErrorCode::PathUnusable, "That folder can't be resolved.")
            .with_remediation("Check the folder permissions and try again.")
    })?;
    let selected_path = display_path(selected_path_buf.clone());

    let is_repo = run_git(&path, &["rev-parse", "--is-inside-work-tree"])?;
    if !is_repo.status.success() {
        return Err(AppError::new(
            AppErrorCode::NotRepository,
            "This folder isn't inside a Git project.",
        )
        .with_remediation("Choose a folder inside an existing Git project."));
    }
    if git_stdout(&is_repo) != "true" {
        let is_bare = run_git(&path, &["rev-parse", "--is-bare-repository"])?;
        if is_bare.status.success() && git_stdout(&is_bare) == "true" {
            return Err(AppError::new(
                AppErrorCode::BareRepository,
                "Bare Git repositories aren't supported yet.",
            )
            .with_remediation("Choose a project folder with working files."));
        }
        return Err(AppError::new(
            AppErrorCode::NotRepository,
            "This folder isn't inside a Git project.",
        )
        .with_remediation("Choose a folder inside an existing Git project."));
    }

    let root = checked_git_stdout(run_git(&path, &["rev-parse", "--show-toplevel"])?)?;
    let root_path = normalized_path(repo_path, &root);
    let git_dir_raw = checked_git_stdout(run_git(&path, &["rev-parse", "--absolute-git-dir"])?)?;
    let common_dir_raw = checked_git_stdout(run_git(&path, &["rev-parse", "--git-common-dir"])?)?;
    let git_dir_path = normalized_path(&root_path, &git_dir_raw);
    // `--git-common-dir` is relative to the directory passed to `git -C`,
    // not necessarily to the worktree root. Resolving it from `root_path`
    // misclassified a normal repository when the user selected a nested
    // folder (for example, `src` yields `../.git`).
    let common_dir_path = normalized_path(&selected_path_buf, &common_dir_raw);

    let repository_context = repository_access::RepositoryContext::from_parts(
        &root_path,
        &git_dir_path,
        &common_dir_path,
        false,
    )?;
    repository_access::global().register(
        repository_context.clone(),
        &[selected_path_buf.as_path(), root_path.as_path()],
    );
    let _access = repository_access::global().acquire(
        &repository_context,
        repository_access::AccessMode::Read,
        None,
    )?;

    // A linked worktree has its own Git directory but shares a common Git
    // directory with the main checkout.
    let kind = if git_dir_path == common_dir_path {
        RepositoryKind::Repository
    } else {
        RepositoryKind::Worktree
    };

    let symbolic_head = run_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let (branch, head_state) = if symbolic_head.status.success() {
        let branch = Some(git_stdout(&symbolic_head));
        let verified_head = run_git(&path, &["rev-parse", "--verify", "HEAD"])?;
        if verified_head.status.success() {
            (branch, HeadState::Branch)
        } else {
            (branch, HeadState::Unborn)
        }
    } else {
        let verified_head = run_git(&path, &["rev-parse", "--verify", "HEAD"])?;
        if verified_head.status.success() {
            (None, HeadState::Detached)
        } else {
            (None, HeadState::Unborn)
        }
    };

    let name = root_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path(root_path.clone()));

    let canonical_path = display_path(root_path.clone());
    let session_epoch = session::global().open(&canonical_path, session_epoch.as_deref())?;
    Ok(RepositoryInfo {
        name,
        path: canonical_path,
        selected_path,
        git_dir: display_path(git_dir_path),
        common_git_dir: display_path(common_dir_path),
        branch,
        head_state,
        kind,
        session_epoch,
    })
}
