//! Application-aware Git command facade.
//!
//! `git.rs` owns process execution. This module binds that infrastructure to
//! the execution policy and cancellation frame selected by `application.rs`.
//! Domain modules depend on this facade instead of reaching into Tauri or
//! constructing processes themselves.

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git;
use std::ffi::OsStr;
use std::path::Path;
#[cfg(test)]
use std::process::Command;
use std::process::{ExitStatus, Output};

#[cfg(test)]
pub(crate) fn base_git_command() -> Command {
    git::command()
}

#[cfg(test)]
pub(crate) fn git_command(repo_path: &str) -> Command {
    let mut command = base_git_command();
    command.arg("-C").arg(repo_path);
    command
}

/// Returns the execution policy of the command this thread is running.
///
/// There is deliberately no fallback: a Git call without an application
/// frame would also bypass repository-access coordination.
pub(crate) fn require_policy() -> Result<git::ExecutionPolicy, AppError> {
    match application::current_policy() {
        Some(policy) => Ok(policy),
        None => {
            debug_assert!(
                false,
                "a Git process was started outside a registered command; \
                 enter `application::enter` or `application::authorize_repository` first",
            );
            Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdrile couldn't run this Git command safely.",
            )
            .with_remediation("Restart GitOdrile, and please report this if it happens again."))
        }
    }
}

#[cfg(test)]
pub(crate) fn test_git(repo_path: &str, args: &[&str]) -> Result<Output, AppError> {
    let _frame = application::enter_test_frame();
    run_git(repo_path, args)
}

#[cfg(test)]
pub(crate) fn in_test_frame<T>(run: impl FnOnce() -> T) -> T {
    let _frame = application::enter_test_frame();
    run()
}

pub(crate) fn run_git(repo_path: &str, args: &[&str]) -> Result<Output, AppError> {
    run_git_with_env(repo_path, args, &[])
}

pub(crate) fn run_git_with_env<I, S>(
    repo_path: &str,
    args: I,
    envs: &[(&str, &str)],
) -> Result<Output, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let policy = require_policy()?;
    let cancellation = application::current_cancellation();
    let output = git::run_with_env(
        Some(Path::new(repo_path)),
        args,
        envs,
        policy,
        cancellation.as_ref(),
    )?;
    let _stderr_was_truncated = output.stderr_truncated;
    Ok(Output {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

pub(crate) fn run_global_git_with_env<I, S>(
    args: I,
    envs: &[(&str, &str)],
) -> Result<Output, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let policy = require_policy()?;
    let cancellation = application::current_cancellation();
    let output = git::run_with_env(None, args, envs, policy, cancellation.as_ref())?;
    Ok(Output {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

pub(crate) struct CappedOutput {
    pub(crate) status: ExitStatus,
    pub(crate) stdout: Vec<u8>,
    pub(crate) limit_exceeded: bool,
}

pub(crate) fn run_git_capped(
    repo_path: &str,
    args: &[&str],
    limit: usize,
) -> Result<CappedOutput, AppError> {
    let mut policy = require_policy()?;
    policy.stdout_cap = limit;
    let cancellation = application::current_cancellation();
    let output = git::run(
        Some(Path::new(repo_path)),
        args,
        policy,
        cancellation.as_ref(),
    )?;
    Ok(CappedOutput {
        status: output.status,
        stdout: output.stdout,
        limit_exceeded: output.stdout_truncated,
    })
}

pub(crate) fn run_git_with_input_capped(
    repo_path: &str,
    args: &[&str],
    input: &[u8],
    limit: usize,
) -> Result<CappedOutput, AppError> {
    let mut policy = require_policy()?;
    policy.stdout_cap = limit;
    let cancellation = application::current_cancellation();
    let output = git::run_with_input(
        Some(Path::new(repo_path)),
        args,
        input,
        policy,
        cancellation.as_ref(),
    )?;
    Ok(CappedOutput {
        status: output.status,
        stdout: output.stdout,
        limit_exceeded: output.stdout_truncated,
    })
}

pub(crate) fn git_stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

pub(crate) fn checked_git_stdout(output: Output) -> Result<String, AppError> {
    if output.status.success() {
        Ok(git_stdout(&output))
    } else {
        Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."))
    }
}
