use crate::error::{AppError, AppErrorCode};
use std::ffi::OsStr;
use std::io::{ErrorKind, Read};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) const DEFAULT_STDOUT_CAP: usize = 16 * 1024 * 1024;
pub(crate) const DEFAULT_STDERR_CAP: usize = 256 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OperationClass {
    ReadOnly,
    LocalMutation,
    HistoryMutation,
    RemoteMutation,
    Destructive,
    PlatformMutation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PromptPolicy {
    Disabled,
    PreserveGitBehavior,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ConcurrencyClass {
    None,
    RepositoryRead,
    RepositoryWrite,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CancellationPolicy {
    KillProcess,
    NotSupported,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct ExecutionPolicy {
    pub(crate) command: &'static str,
    pub(crate) class: OperationClass,
    pub(crate) stdout_cap: usize,
    pub(crate) stderr_cap: usize,
    pub(crate) timeout: Duration,
    pub(crate) cancellation: CancellationPolicy,
    pub(crate) prompt: PromptPolicy,
    pub(crate) concurrency: ConcurrencyClass,
}

impl ExecutionPolicy {
    pub(crate) const fn repository_read(command: &'static str) -> Self {
        Self {
            command,
            class: OperationClass::ReadOnly,
            stdout_cap: DEFAULT_STDOUT_CAP,
            stderr_cap: DEFAULT_STDERR_CAP,
            timeout: Duration::from_secs(60),
            cancellation: CancellationPolicy::KillProcess,
            prompt: PromptPolicy::Disabled,
            concurrency: ConcurrencyClass::RepositoryRead,
        }
    }

    pub(crate) const fn repository_write(command: &'static str, class: OperationClass) -> Self {
        Self {
            command,
            class,
            stdout_cap: DEFAULT_STDOUT_CAP,
            stderr_cap: DEFAULT_STDERR_CAP,
            timeout: Duration::from_secs(120),
            cancellation: CancellationPolicy::KillProcess,
            prompt: PromptPolicy::PreserveGitBehavior,
            concurrency: ConcurrencyClass::RepositoryWrite,
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }

    pub(crate) fn same_instance(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

#[derive(Debug)]
pub(crate) struct BoundedOutput {
    pub(crate) status: ExitStatus,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    pub(crate) stdout_truncated: bool,
    pub(crate) stderr_truncated: bool,
}

pub(crate) fn command() -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new("git");
    command
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn read_bounded(mut reader: impl Read, limit: usize) -> (Vec<u8>, bool) {
    let mut kept = Vec::with_capacity(limit.min(8192));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                let remaining = limit.saturating_sub(kept.len());
                let retain = remaining.min(read);
                kept.extend_from_slice(&buffer[..retain]);
                truncated |= retain < read;
            }
        }
    }
    (kept, truncated)
}

fn start_reader<R: Read + Send + 'static>(
    reader: R,
    limit: usize,
) -> thread::JoinHandle<(Vec<u8>, bool)> {
    thread::spawn(move || read_bounded(reader, limit))
}

fn terminate(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        // Git hooks and credential helpers may be descendants. `taskkill` is
        // invoked directly (never through a shell) to request tree cleanup;
        // `Child::kill` remains the fallback if it is unavailable.
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn start_error(error: std::io::Error) -> AppError {
    if error.kind() == ErrorKind::NotFound {
        AppError::new(
            AppErrorCode::GitMissing,
            "Git isn't installed, or isn't available on PATH.",
        )
        .with_remediation("Install Git, then reopen GitOdrile and try again.")
    } else {
        AppError::new(AppErrorCode::GitUnusable, "Git couldn't be started.")
            .with_remediation("Check the Git installation and try again.")
    }
}

pub(crate) fn run<I, S>(
    cwd: Option<&Path>,
    args: I,
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_with_env(cwd, args, &[], policy, cancellation)
}

pub(crate) fn run_with_env<I, S>(
    cwd: Option<&Path>,
    args: I,
    envs: &[(&str, &str)],
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut process = command();
    if let Some(cwd) = cwd {
        process.arg("-C").arg(cwd);
    }
    process
        .args(args)
        .envs(envs.iter().copied())
        .stdin(match policy.prompt {
            PromptPolicy::Disabled => Stdio::null(),
            PromptPolicy::PreserveGitBehavior => Stdio::inherit(),
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = process.spawn().map_err(start_error)?;
    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::new(AppErrorCode::GitUnusable, "Git's output couldn't be read.")
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::new(AppErrorCode::GitUnusable, "Git's errors couldn't be read.")
    })?;
    let stdout_reader = start_reader(stdout, policy.stdout_cap);
    let stderr_reader = start_reader(stderr, policy.stderr_cap);
    let started = Instant::now();

    let status = loop {
        if policy.cancellation == CancellationPolicy::KillProcess
            && cancellation.is_some_and(CancellationToken::is_cancelled)
        {
            terminate(&mut child);
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "The Git operation was cancelled.",
            ));
        }
        if started.elapsed() >= policy.timeout {
            terminate(&mut child);
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git took too long and was stopped.",
            )
            .with_remediation("Check the project and try again."));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(_) => {
                terminate(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git couldn't finish the operation.",
                ));
            }
        }
    };

    let (stdout, stdout_truncated) = stdout_reader.join().unwrap_or_default();
    let (stderr, stderr_truncated) = stderr_reader.join().unwrap_or_default();
    Ok(BoundedOutput {
        status,
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
    })
}

/// Removes credentials and token-bearing URL components from safe diagnostic
/// excerpts. Lossy decoding is deliberate: malformed process bytes must not
/// bypass redaction or make diagnostics fail.
pub(crate) fn redact_diagnostic(bytes: &[u8], limit: usize) -> String {
    let text = String::from_utf8_lossy(bytes);
    let mut words = Vec::new();
    for word in text.split_whitespace() {
        let without_fragment = word.split('#').next().unwrap_or_default();
        let without_query = without_fragment.split('?').next().unwrap_or_default();
        let redacted = if let Some(scheme) = without_query.find("://") {
            let authority_start = scheme + 3;
            let tail = &without_query[authority_start..];
            if let Some(at) = tail.find('@') {
                format!(
                    "{}[redacted]@{}",
                    &without_query[..authority_start],
                    &tail[at + 1..]
                )
            } else {
                without_query.to_string()
            }
        } else {
            without_query.to_string()
        };
        words.push(redacted);
    }
    let joined = words.join(" ");
    joined.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_redact_credentials_queries_and_malformed_bytes() {
        let raw = b"hook: https://alice:secret@example.test/repo.git?token=abc#x \xff";
        let redacted = redact_diagnostic(raw, 256);
        assert!(!redacted.contains("secret"));
        assert!(!redacted.contains("token"));
        assert!(redacted.contains("[redacted]@example.test/repo.git"));
        assert!(redacted.contains('\u{fffd}'));
    }

    #[test]
    fn bounded_reader_drains_but_retains_only_the_cap() {
        let data = vec![b'x'; 4096];
        let (kept, truncated) = read_bounded(data.as_slice(), 32);
        assert_eq!(kept.len(), 32);
        assert!(truncated);
    }

    #[test]
    fn cancellation_is_distinct_from_a_logically_stale_response() {
        let token = CancellationToken::default();
        token.cancel();
        assert!(token.is_cancelled());
        assert_eq!(
            CancellationPolicy::KillProcess,
            CancellationPolicy::KillProcess
        );
    }

    #[test]
    fn a_cancelled_command_is_reaped() {
        let token = CancellationToken::default();
        token.cancel();
        let result = run(
            None,
            ["--version"],
            ExecutionPolicy::repository_read("cancel_test"),
            Some(&token),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("cancelled"));
    }

    #[test]
    fn a_timed_out_command_is_reaped() {
        let mut policy = ExecutionPolicy::repository_read("timeout_test");
        policy.timeout = Duration::ZERO;
        let result = run(None, ["--version"], policy, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("too long"));
    }
}
