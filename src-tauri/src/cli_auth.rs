//! Shared bounded authentication CLI runner. Raw output stays native.
use crate::git::CancellationToken;
use serde::Serialize;
use std::io::{ErrorKind, Read};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};
use zeroize::{Zeroize, Zeroizing};
const OUTPUT_CAP: usize = 64 * 1024;
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

pub(crate) struct ProcessOutput {
    pub(crate) success: bool,
    pub(crate) stdout: Vec<u8>,
}

/// Drain both streams. The caller may extract a device code from bounded stderr
/// lines; raw lines and stdout stay native and are wiped, including error paths.
pub(crate) fn run(
    mut command: Command,
    token: &CancellationToken,
    timeout: Duration,
    on_code: impl Fn(&str) + Send + Sync,
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
        let mut stdout = out.join().map_err(|_| AuthState::Failed)??;
        err.join().map_err(|_| AuthState::Failed)?;
        Ok(ProcessOutput {
            success: result?,
            stdout: std::mem::take(&mut *stdout),
        })
    })
}

fn read_stdout(mut reader: impl Read) -> Result<Zeroizing<Vec<u8>>, AuthState> {
    let mut retained = Zeroizing::new(Vec::new());
    let mut overflow = false;
    let mut chunk = Zeroizing::new([0u8; 4096]);
    loop {
        let count = reader.read(&mut *chunk).map_err(|_| AuthState::Failed)?;
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

pub(crate) fn read_login_lines(mut reader: impl Read, on_code: impl Fn(&str)) {
    let mut line = Zeroizing::new(Vec::new());
    let mut discard = false;
    let mut chunk = Zeroizing::new([0u8; 1024]);
    while let Ok(count) = reader.read(&mut *chunk) {
        if count == 0 {
            break;
        }
        for byte in &chunk[..count] {
            if *byte == b'\n' {
                if !discard {
                    let text = Zeroizing::new(String::from_utf8_lossy(&line).into_owned());
                    on_code(&text);
                }
                line.zeroize();
                discard = false;
            } else if line.len() < 4096 && !discard {
                line.push(*byte);
            } else {
                line.zeroize();
                discard = true;
            }
        }
    }
}

impl Drop for ProcessOutput {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.stdout.zeroize();
    }
}
