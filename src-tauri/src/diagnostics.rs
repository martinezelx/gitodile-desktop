//! Privacy-safe, session-only diagnostic activity for issue reports.
//!
//! Events are typed at their source and deliberately cannot carry repository
//! paths, refs, remote names, file contents, or raw Git arguments. The bounded
//! buffer is materialized only when the user opens the report review flow.

use crate::error::{AppError, AppErrorCode};
use crate::git::OperationClass;
use crate::operation::{truncate_detail, OperationKind};
use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const EVENT_CAPACITY: usize = 200;
const MAX_REPORT_BYTES: usize = 1024 * 1024;
const MAX_ENVIRONMENT_CHARS: usize = 2_000;
const UNKNOWN_SUBCOMMAND: &str = "unknown";

#[derive(Clone, Debug, PartialEq)]
enum Event {
    Command {
        elapsed_ms: u128,
        operation_kind: OperationKind,
        operation: &'static str,
        error_code: Option<String>,
        failure_detail: Option<String>,
    },
    GitInvocation {
        elapsed_ms: u128,
        operation_kind: OperationKind,
        operation: &'static str,
        subcommand: &'static str,
        exit_code: Option<i32>,
        duration_ms: u128,
        failure_detail: Option<String>,
    },
}

#[derive(Clone)]
pub(crate) struct DiagnosticsLog {
    inner: Arc<DiagnosticsInner>,
}

struct DiagnosticsInner {
    started: Instant,
    started_at: SystemTime,
    state: Mutex<LogState>,
}

struct LogState {
    events: VecDeque<Event>,
    total_events: u64,
}

impl Default for DiagnosticsLog {
    fn default() -> Self {
        Self {
            inner: Arc::new(DiagnosticsInner {
                started: Instant::now(),
                started_at: SystemTime::now(),
                state: Mutex::new(LogState {
                    events: VecDeque::with_capacity(EVENT_CAPACITY),
                    total_events: 0,
                }),
            }),
        }
    }
}

impl DiagnosticsLog {
    fn push(&self, event: Event) {
        let mut state = self
            .inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.total_events = state.total_events.saturating_add(1);
        if state.events.len() == EVENT_CAPACITY {
            state.events.pop_front();
        }
        state.events.push_back(event);
    }

    fn elapsed_ms(&self) -> u128 {
        self.inner.started.elapsed().as_millis()
    }

    fn record_git(
        &self,
        class: OperationClass,
        operation: &'static str,
        subcommand: &'static str,
        exit_code: Option<i32>,
        duration_ms: u128,
        stderr: Option<&[u8]>,
    ) {
        let failure_detail = stderr
            .filter(|_| exit_code != Some(0))
            .map(|bytes| truncate_detail(&String::from_utf8_lossy(bytes)))
            .filter(|detail| !detail.is_empty());
        self.push(Event::GitInvocation {
            elapsed_ms: self.elapsed_ms(),
            operation_kind: operation_kind(class),
            operation,
            subcommand,
            exit_code,
            duration_ms,
            failure_detail,
        });
    }

    fn record_command(
        &self,
        class: OperationClass,
        operation: &'static str,
        error: Option<&AppError>,
    ) {
        let error_code = error.map(|error| {
            serde_json::to_value(&error.code)
                .ok()
                .and_then(|value| value.as_str().map(str::to_owned))
                .unwrap_or_else(|| "unknown_error".to_string())
        });
        self.push(Event::Command {
            elapsed_ms: self.elapsed_ms(),
            operation_kind: operation_kind(class),
            operation,
            error_code,
            failure_detail: error
                .and_then(|error| error.detail.as_deref())
                .map(truncate_detail)
                .filter(|detail| !detail.is_empty()),
        });
    }

    pub(crate) fn render(&self, environment: &str) -> String {
        let state = self
            .inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut report = String::from("Environment\n-----------\n");
        report.push_str(environment.trim());
        report.push_str("\n\nSession activity\n----------------\n");
        let retained = state.events.len();
        let omitted = state.total_events.saturating_sub(retained as u64);
        // UTC, not local time: a maintainer can line the session up against an
        // issue's own timestamps, and a public report gives away no time zone.
        report.push_str(&format!("Started: {}\n", format_utc(self.inner.started_at)));
        report.push_str(&format!(
            "Duration: {}\n",
            format_session_age(self.elapsed_ms())
        ));
        report.push_str(&format!(
            "Events: {retained} retained of {}",
            state.total_events
        ));
        if omitted > 0 {
            report.push_str(&format!(" ({omitted} older events omitted)"));
        }
        report.push('\n');
        if state.events.is_empty() {
            report.push_str("\nNo activity has been recorded in this session.\n");
            return report;
        }
        report.push('\n');
        for line in render_events(state.events.iter()) {
            report.push_str(&line);
            report.push('\n');
        }
        report
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .events
            .len()
    }
}

/// Lays the events out in fixed columns. A report is read by eye far more often
/// than it is parsed, and aligned columns are what make a hundred lines
/// scannable; the widths come from the events themselves, so no column is
/// padded for a value this session never produced.
fn render_events<'a>(events: impl Iterator<Item = &'a Event>) -> Vec<String> {
    const COLUMNS: usize = 7;
    let mut rows: Vec<([String; COLUMNS], Option<&str>)> = Vec::new();
    for event in events {
        match event {
            Event::Command {
                elapsed_ms,
                operation_kind,
                operation,
                error_code,
                failure_detail,
            } => rows.push((
                [
                    format_offset(*elapsed_ms),
                    "command".to_string(),
                    operation_kind.as_str().to_string(),
                    (*operation).to_string(),
                    String::new(),
                    error_code.clone().unwrap_or_else(|| "ok".to_string()),
                    String::new(),
                ],
                failure_detail.as_deref(),
            )),
            Event::GitInvocation {
                elapsed_ms,
                operation_kind,
                operation,
                subcommand,
                exit_code,
                duration_ms,
                failure_detail,
            } => rows.push((
                [
                    format_offset(*elapsed_ms),
                    "git".to_string(),
                    operation_kind.as_str().to_string(),
                    (*operation).to_string(),
                    (*subcommand).to_string(),
                    exit_code
                        .map(|code| format!("exit {code}"))
                        .unwrap_or_else(|| "no exit status".to_string()),
                    format_command_duration(*duration_ms),
                ],
                failure_detail.as_deref(),
            )),
        }
    }

    let mut widths = [0usize; COLUMNS];
    for (cells, _) in rows.iter() {
        for (width, cell) in widths.iter_mut().zip(cells.iter()) {
            *width = (*width).max(cell.chars().count());
        }
    }

    let mut lines = Vec::with_capacity(rows.len());
    for (cells, detail) in rows.iter() {
        let mut line = String::new();
        for (cell, width) in cells.iter().zip(widths.iter()) {
            // A column no event filled — a session with no Git invocations has
            // no subcommand — is dropped rather than reserved as blank space.
            if *width == 0 {
                continue;
            }
            if !line.is_empty() {
                line.push_str("  ");
            }
            line.push_str(cell);
            line.extend(std::iter::repeat_n(' ', width - cell.chars().count()));
        }
        lines.push(line.trim_end().to_string());
        if let Some(detail) = detail {
            // Aligned under the first column so a failure reads as belonging to
            // the event above it rather than as another event.
            lines.push(format!("{}{detail}", " ".repeat(widths[0] + 2)));
        }
    }
    lines
}

/// `+MM:SS.mmm` from the start of the session. Raw milliseconds are exact and
/// unreadable past a few seconds; this keeps the exactness and drops the
/// arithmetic a reader would otherwise do in their head.
fn format_offset(elapsed_ms: u128) -> String {
    let millis = elapsed_ms % 1_000;
    let seconds = elapsed_ms / 1_000;
    let (hours, minutes, seconds) = (seconds / 3_600, (seconds % 3_600) / 60, seconds % 60);
    if hours > 0 {
        format!("+{hours}:{minutes:02}:{seconds:02}.{millis:03}")
    } else {
        format!("+{minutes:02}:{seconds:02}.{millis:03}")
    }
}

/// How long one Git invocation took, in the unit that can be judged at a
/// glance: milliseconds while they still mean something, seconds once they do
/// not.
fn format_command_duration(duration_ms: u128) -> String {
    if duration_ms < 1_000 {
        return format!("{duration_ms} ms");
    }
    if duration_ms < 60_000 {
        return format!("{}.{} s", duration_ms / 1_000, (duration_ms % 1_000) / 100);
    }
    let seconds = duration_ms / 1_000;
    format!("{} min {} s", seconds / 60, seconds % 60)
}

/// Two units are enough for a session length that is context, not a measurement.
fn format_session_age(elapsed_ms: u128) -> String {
    let total_seconds = elapsed_ms / 1_000;
    if total_seconds < 1 {
        return "under 1 sec".to_string();
    }
    let mut remaining = total_seconds;
    let mut parts: Vec<String> = Vec::with_capacity(2);
    for (seconds, label) in [(86_400, "d"), (3_600, "hr"), (60, "min"), (1, "sec")] {
        let amount = remaining / seconds;
        if amount > 0 {
            parts.push(format!("{amount} {label}"));
            remaining %= seconds;
        }
        if parts.len() == 2 {
            break;
        }
    }
    parts.join(" ")
}

/// ISO 8601 in UTC, without a date dependency for one line of output. The
/// civil-from-days conversion is Howard Hinnant's, valid well past any clock
/// this application will run against.
fn format_utc(time: SystemTime) -> String {
    let Ok(since_epoch) = time.duration_since(UNIX_EPOCH) else {
        return "unavailable".to_string();
    };
    let seconds = since_epoch.as_secs() as i64;
    let days = seconds.div_euclid(86_400);
    let time_of_day = seconds.rem_euclid(86_400);
    let (hour, minute, second) = (
        time_of_day / 3_600,
        (time_of_day % 3_600) / 60,
        time_of_day % 60,
    );
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_position = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_position + 2) / 5 + 1;
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn operation_kind(class: OperationClass) -> OperationKind {
    match class {
        OperationClass::ReadOnly => OperationKind::ReadOnly,
        OperationClass::LocalMutation => OperationKind::LocalMutation,
        OperationClass::HistoryMutation => OperationKind::HistoryMutation,
        OperationClass::RemoteMutation => OperationKind::RemoteMutation,
        OperationClass::Destructive => OperationKind::Destructive,
        OperationClass::PlatformMutation => OperationKind::PlatformMutation,
    }
}

/// Returns only a known Git verb. Unknown input is intentionally collapsed;
/// treating an arbitrary first argument as a verb would make user-controlled
/// paths, refs, or remote URLs loggable after an innocent caller mistake.
pub(crate) fn safe_git_subcommand(value: Option<&std::ffi::OsStr>) -> &'static str {
    let Some(value) = value.and_then(std::ffi::OsStr::to_str) else {
        return UNKNOWN_SUBCOMMAND;
    };
    const ALLOWED: &[&str] = &[
        "--version",
        "add",
        "branch",
        "cat-file",
        "check-ref-format",
        "clone",
        "commit",
        "config",
        "diff",
        "fetch",
        "for-each-ref",
        "hash-object",
        "init",
        "log",
        "ls-files",
        "merge",
        "merge-base",
        "read-tree",
        "remote",
        "rev-list",
        "rev-parse",
        "show-ref",
        "status",
        "switch",
        "symbolic-ref",
        "update-index",
        "update-ref",
        "var",
        "worktree",
        "write-tree",
        "push",
    ];
    ALLOWED
        .iter()
        .copied()
        .find(|candidate| *candidate == value)
        .unwrap_or(UNKNOWN_SUBCOMMAND)
}

static GLOBAL: OnceLock<DiagnosticsLog> = OnceLock::new();

pub(crate) fn install_global() -> DiagnosticsLog {
    GLOBAL.get_or_init(DiagnosticsLog::default).clone()
}

pub(crate) fn record_git(
    class: OperationClass,
    operation: &'static str,
    subcommand: &'static str,
    exit_code: Option<i32>,
    duration_ms: u128,
    stderr: Option<&[u8]>,
) {
    if let Some(log) = GLOBAL.get() {
        log.record_git(class, operation, subcommand, exit_code, duration_ms, stderr);
    }
}

pub(crate) fn record_command(
    class: OperationClass,
    operation: &'static str,
    error: Option<&AppError>,
) {
    if let Some(log) = GLOBAL.get() {
        log.record_command(class, operation, error);
    }
}

/// The environment block is assembled in the webview and crosses the boundary
/// as free text, so it is bounded here like every other command input rather
/// than trusted for being ours. Five version lines are two hundred characters;
/// anything approaching this cap is a defect on the other side, and truncating
/// keeps the report readable instead of failing the review outright.
pub(crate) fn render_report(log: &DiagnosticsLog, environment: String) -> String {
    let bounded = match environment.char_indices().nth(MAX_ENVIRONMENT_CHARS) {
        Some((boundary, _)) => &environment[..boundary],
        None => environment.as_str(),
    };
    log.render(bounded)
}

pub(crate) fn save_report(path: String, report: String) -> Result<(), AppError> {
    if path.trim().is_empty() {
        return Err(AppError::new(
            AppErrorCode::PathMissing,
            "Choose where to save the diagnostic report.",
        ));
    }
    if report.len() > MAX_REPORT_BYTES {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "The diagnostic report is too large to save safely.",
        ));
    }
    fs::write(Path::new(&path), report.as_bytes()).map_err(|error| {
        let code = if error.kind() == std::io::ErrorKind::PermissionDenied {
            AppErrorCode::PermissionDenied
        } else {
            AppErrorCode::PathUnusable
        };
        AppError::new(code, "GitOdile couldn't save the diagnostic report.")
            .with_remediation("Choose another location and try again.")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn ring_buffer_keeps_only_the_most_recent_events() {
        let log = DiagnosticsLog::default();
        for _ in 0..EVENT_CAPACITY + 17 {
            log.record_git(
                OperationClass::ReadOnly,
                "read_status",
                "status",
                Some(0),
                1,
                None,
            );
        }
        assert_eq!(log.len(), EVENT_CAPACITY);
        assert_eq!(
            log.render("GitOdile test").matches("  git  ").count(),
            EVENT_CAPACITY
        );
    }

    #[test]
    fn reports_are_useful_before_any_activity() {
        let report = DiagnosticsLog::default().render("GitOdile test\nSystem: test");
        assert!(report.contains("Environment\n-----------\nGitOdile test\nSystem: test"));
        assert!(report.contains("No activity has been recorded in this session."));
    }

    #[test]
    fn credentials_urls_and_raw_arguments_never_reach_the_report() {
        let log = DiagnosticsLog::default();
        let raw_argument = "feature/private-customer-name";
        let remote = b"fatal: https://alice:secret@example.test/repo.git?token=abc#fragment denied";
        log.record_git(
            OperationClass::RemoteMutation,
            "publish",
            safe_git_subcommand(Some(std::ffi::OsStr::new(raw_argument))),
            Some(1),
            12,
            Some(remote),
        );
        let report = log.render("GitOdile test");
        assert!(!report.contains(raw_argument));
        assert!(!report.contains("alice"));
        assert!(!report.contains("secret"));
        assert!(!report.contains("token"));
        assert!(!report.contains("fragment"));
        assert!(report.contains("https://[redacted]@example.test/repo.git"));
        assert!(report.contains("unknown"));
    }

    #[test]
    fn app_errors_reuse_the_bounded_redaction_path() {
        let log = DiagnosticsLog::default();
        let error = AppError::new(AppErrorCode::AuthenticationFailed, "not rendered")
            .with_detail("https://user:pass@example.test/repo?secret=yes failed");
        log.record_command(OperationClass::RemoteMutation, "publish", Some(&error));
        let report = log.render("GitOdile test");
        assert!(report.contains("authentication_failed"));
        assert!(!report.contains("pass"));
        assert!(!report.contains("secret"));
    }

    #[test]
    fn successful_commands_and_omitted_event_count_preserve_the_safe_sequence() {
        let log = DiagnosticsLog::default();
        log.record_command(OperationClass::ReadOnly, "open_repository", None);
        for _ in 0..EVENT_CAPACITY {
            log.record_command(OperationClass::ReadOnly, "read_working_tree_status", None);
        }
        let report = log.render("GitOdile test");
        assert!(report.contains("Events: 200 retained of 201 (1 older events omitted)"));
        assert!(report.contains("command  read-only  read_working_tree_status  ok"));
        assert!(!report.contains("open_repository"));
    }

    #[test]
    fn timings_read_as_clock_offsets_and_adaptive_durations() {
        assert_eq!(format_offset(0), "+00:00.000");
        assert_eq!(format_offset(2_065), "+00:02.065");
        assert_eq!(format_offset(835_771), "+13:55.771");
        assert_eq!(format_offset(7_384_000), "+2:03:04.000");

        assert_eq!(format_command_duration(121), "121 ms");
        assert_eq!(format_command_duration(1_450), "1.4 s");
        assert_eq!(format_command_duration(184_000), "3 min 4 s");

        assert_eq!(format_session_age(20), "under 1 sec");
        assert_eq!(format_session_age(85_000), "1 min 25 sec");
        assert_eq!(format_session_age(7_384_000), "2 hr 3 min");

        assert_eq!(
            format_utc(UNIX_EPOCH + std::time::Duration::from_secs(1_772_640_185)),
            "2026-03-04T16:03:05Z"
        );
        assert_eq!(format_utc(UNIX_EPOCH), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn events_line_up_in_columns_and_carry_their_failure_underneath() {
        let log = DiagnosticsLog::default();
        log.record_command(OperationClass::ReadOnly, "show_main_window", None);
        log.record_git(
            OperationClass::RemoteMutation,
            "publish",
            "push",
            Some(1),
            1_450,
            Some(b"fatal: repository not found"),
        );
        let report = log.render("GitOdile test");
        let lines: Vec<&str> = report
            .lines()
            .filter(|line| line.starts_with('+') || line.starts_with("  "))
            .collect();

        // Same column starts on both rows, so a long log stays scannable.
        let starts = |line: &str, cell: &str| line.find(cell).expect("column present");
        assert_eq!(starts(lines[0], "read-only"), starts(lines[1], "remote"));
        assert_eq!(
            starts(lines[0], "show_main_window"),
            starts(lines[1], "publish")
        );
        assert!(lines[1].ends_with("exit 1  1.4 s"));
        assert!(lines[2].trim() == "fatal: repository not found");
    }

    #[test]
    fn an_oversized_environment_is_bounded_at_a_character_boundary() {
        let log = DiagnosticsLog::default();
        // Multi-byte input is what turns a naive byte slice into a panic.
        let report = render_report(&log, "á".repeat(MAX_ENVIRONMENT_CHARS + 500));

        assert_eq!(report.matches('á').count(), MAX_ENVIRONMENT_CHARS);
        assert!(report.contains("No activity has been recorded in this session."));
    }

    #[test]
    fn saved_reports_are_plain_text_at_the_exact_chosen_path() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "gitodile-diagnostic-report-{}-{nonce}.txt",
            std::process::id()
        ));
        let report = "Environment\n-----------\nGitOdile test";
        save_report(path.to_string_lossy().to_string(), report.to_string()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), report);
        fs::remove_file(path).unwrap();
    }
}
