//! The project console: fixed catalogue queries and typed Git commands.
//!
//! A typed line crosses IPC once, as text, to [`plan_console_command`]. Rust
//! tokenizes it without a shell ([`tokenize`]), classifies it into a
//! permission tier ([`classify`]) and keeps the resulting argument vector as a
//! single-use plan. A read runs through [`run_console_plan`]; a change,
//! allowed only in advanced mode ([`settings`]), runs through
//! [`run_console_change`] after the person answers yes (unless they turned
//! change confirmations off) and only while the
//! repository still matches what the plan's pre-flight read saw
//! ([`preview`]). The renderer never decides what is safe and never hands Git
//! an argument of its own. See ADR 0017.
//!
//! Each submodule is a separate owner: the tokenizer and the classifier work
//! on text alone, the preview only reads the repository, and the settings
//! only persist one choice. The fixed queries of task 134 stay in
//! [`catalogue`] for the catalogue shortcuts.

mod catalogue;
mod classify;
mod preview;
mod settings;
mod tokenize;

pub(crate) use catalogue::{run_console_query, ConsoleQueryResult};
pub(crate) use settings::{ConsoleModes, ConsoleSettings};

use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::run_git_bounded_with_env;
use crate::sync::looks_like_authentication_failure;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Every console process runs with no pager, no terminal prompt, no editor,
/// no optional index lock and no filesystem monitor program.
const CONSOLE_ENV: &[(&str, &str)] = &[
    ("GIT_PAGER", ""),
    ("GIT_TERMINAL_PROMPT", "0"),
    ("GIT_OPTIONAL_LOCKS", "0"),
    ("GIT_EDITOR", "false"),
    ("GIT_SEQUENCE_EDITOR", "false"),
    ("GIT_CONFIG_COUNT", "1"),
    ("GIT_CONFIG_KEY_0", "core.fsmonitor"),
    ("GIT_CONFIG_VALUE_0", "false"),
];

/// What a command may do, from least to most consequential. `Never` is for
/// commands no mode runs.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Tier {
    Read,
    LocalChange,
    HistoryChange,
    Remote,
    Destructive,
    Never,
}

/// The plain-language consequence a plan states before it runs.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Effect {
    ReadsOnly,
    ChangesProject,
    ChangesHistory,
    ReachesRemote,
    CanLoseWork,
}

impl Tier {
    fn effect(self) -> Option<Effect> {
        match self {
            Self::Read => Some(Effect::ReadsOnly),
            Self::LocalChange => Some(Effect::ChangesProject),
            Self::HistoryChange => Some(Effect::ChangesHistory),
            Self::Remote => Some(Effect::ReachesRemote),
            Self::Destructive => Some(Effect::CanLoseWork),
            Self::Never => None,
        }
    }

    /// Read runs for everyone; Local change and Remote only in advanced
    /// mode. History and Destructive wait for recovery points (task 139).
    fn allowed(self, advanced_mode: bool) -> bool {
        match self {
            Self::Read => true,
            Self::LocalChange | Self::Remote => advanced_mode,
            Self::HistoryChange | Self::Destructive | Self::Never => false,
        }
    }
}

/// What the person must answer before a plan runs.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Confirmation {
    None,
    /// `¿Continuar? [s/N]`: only yes runs. A change plan asks unless the
    /// person turned change confirmations off.
    YesNo,
}

/// The output's known layout, which the renderer uses only to choose colours.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OutputShape {
    Status,
    /// Commits, their summaries and patches: log, show, diff, blame, reflog.
    Commits,
    Graph,
    Branches,
    Remotes,
    Stashes,
    Authors,
    Plain,
}

/// What a change plan previews, as the classifier read it from the words.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum Intent {
    None,
    /// `add`: a dry run with the same arguments lists the files.
    Stage,
    Commit {
        all: bool,
        paths: bool,
    },
    Switch {
        target: String,
        create: bool,
    },
    /// `checkout <name>`: a line to switch to, or a path to restore, which
    /// only the repository can tell.
    CheckoutName(String),
    CreateLine(String),
    CreateTag(String),
    SetAside,
    ApplySetAside(Option<String>),
    Revert(String),
    CherryPick(String),
    Fetch(Option<String>),
    Pull(Option<String>),
    Push {
        remote: Option<String>,
        line: Option<String>,
        /// Nothing named: Git pushes the current line to its upstream.
        plain: bool,
    },
    AskRemote(Option<String>),
}

/// One statement of what a change plan will do, for the renderer to phrase.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum PlanFact {
    Stages {
        files: Vec<String>,
        total: usize,
    },
    /// `files` is absent when the command names its own paths.
    Commits {
        line: Option<String>,
        files: Option<usize>,
    },
    Switches {
        target: String,
        create: bool,
    },
    CreatesLine {
        name: String,
    },
    CreatesTag {
        name: String,
    },
    SetsAside {
        files: usize,
    },
    AppliesSetAside {
        stash: String,
    },
    Reverts {
        version: String,
    },
    CopiesVersion {
        version: String,
    },
    Fetches {
        remote: Option<String>,
    },
    Pulls {
        remote: Option<String>,
    },
    Publishes {
        remote: Option<String>,
        line: Option<String>,
        versions: Option<usize>,
    },
    AsksRemote {
        remote: Option<String>,
    },
    /// The project's hooks will not run: typed by the person, or added because
    /// hooks are turned off in Settings.
    SkipsHooks {
        typed: bool,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RefusalReason {
    TooLong,
    ControlCharacter,
    UnclosedQuote,
    ShellSyntax,
    NotGit,
    MissingSubcommand,
    GlobalOption,
    UnknownSubcommand,
    NotAvailable,
    RunsProgram,
    WritesFile,
    LeavesProject,
    NeedsTerminal,
    /// The command is understood, and its tier is not allowed here.
    TierNotAllowed,
}

/// Why a line will not run, with the word that decided it.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Refusal {
    pub(crate) reason: RefusalReason,
    pub(crate) subject: Option<String>,
}

impl Refusal {
    fn new(reason: RefusalReason, subject: Option<String>) -> Self {
        Self { reason, subject }
    }

    /// A refusal no mode lifts: the command is understood and never runs.
    fn never(reason: RefusalReason, subject: &str) -> Self {
        Self::new(reason, Some(subject.to_string()))
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsolePlan {
    /// Present only when the plan may run.
    pub(crate) plan_id: Option<String>,
    /// The exact command that will run, or the line as it was read when it is
    /// refused; absent when the line could not be read at all.
    pub(crate) command: Option<String>,
    pub(crate) tier: Option<Tier>,
    pub(crate) effect: Option<Effect>,
    pub(crate) confirmation: Confirmation,
    pub(crate) shape: OutputShape,
    pub(crate) facts: Vec<PlanFact>,
    pub(crate) refusal: Option<Refusal>,
    /// The mode Rust planned under, so the console can say what to change.
    pub(crate) advanced_mode: bool,
}

/// What Git's free-text answer most likely means when a change failed. A
/// hint only: the output is always shown as Git wrote it.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RunFailure {
    HookRejected,
    SigningFailed,
    AuthenticationFailed,
    RemoteRejected,
    NotFastForward,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsoleRunResult {
    pub(crate) command: String,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) success: bool,
    pub(crate) truncated: bool,
    pub(crate) shape: OutputShape,
    pub(crate) failure: Option<RunFailure>,
}

struct StoredPlan {
    id: String,
    path: String,
    session_epoch: String,
    arguments: Vec<String>,
    tier: Tier,
    shape: OutputShape,
    confirmation: Confirmation,
    /// The repository state a change plan described; reads bind none.
    fingerprint: Option<String>,
    created: Instant,
}

/// Issued plans waiting to run. Each is single-use, bound to one project
/// session and short-lived; the oldest are dropped past a small bound, since
/// a plan the renderer never ran is simply forgotten.
#[derive(Default)]
struct PlanStore {
    plans: Mutex<VecDeque<StoredPlan>>,
    next: AtomicU64,
}

const MAX_PLANS: usize = 32;
const PLAN_LIFETIME: Duration = Duration::from_secs(10 * 60);

impl PlanStore {
    fn issue(&self, mut plan: StoredPlan) -> String {
        let sequence = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        plan.id = format!("console-{nanos:x}-{sequence:x}");
        let id = plan.id.clone();
        let mut plans = self
            .plans
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        plans.retain(|stored| stored.created.elapsed() < PLAN_LIFETIME);
        while plans.len() >= MAX_PLANS {
            plans.pop_front();
        }
        plans.push_back(plan);
        id
    }

    fn take(&self, id: &str, path: &str, session_epoch: &str) -> Result<StoredPlan, AppError> {
        let mut plans = self
            .plans
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let index = plans.iter().position(|stored| stored.id == id);
        let plan = index.and_then(|index| plans.remove(index));
        match plan {
            Some(plan)
                if plan.path == path
                    && plan.session_epoch == session_epoch
                    && plan.created.elapsed() < PLAN_LIFETIME =>
            {
                Ok(plan)
            }
            _ => Err(stale_plan_error()),
        }
    }
}

fn plans() -> &'static PlanStore {
    static PLANS: OnceLock<PlanStore> = OnceLock::new();
    PLANS.get_or_init(PlanStore::default)
}

fn stale_plan_error() -> AppError {
    AppError::new(
        AppErrorCode::StalePreview,
        "That console command is no longer ready to run.",
    )
    .with_remediation("Type the command again.")
}

fn refused(
    command: Option<String>,
    tier: Option<Tier>,
    refusal: Refusal,
    advanced_mode: bool,
) -> ConsolePlan {
    ConsolePlan {
        plan_id: None,
        command,
        tier,
        effect: tier.and_then(Tier::effect),
        confirmation: Confirmation::None,
        shape: OutputShape::Plain,
        facts: Vec::new(),
        refusal: Some(refusal),
        advanced_mode,
    }
}

fn with_git(arguments: &[String]) -> String {
    let mut line = Vec::with_capacity(arguments.len() + 1);
    line.push("git".to_string());
    line.extend(arguments.iter().cloned());
    tokenize::display(&line)
}

/// Whether the arguments already skip the project's hooks: `--no-verify`,
/// or `commit -n`.
fn skips_hooks(arguments: &[String]) -> bool {
    let subcommand = arguments.first().map(String::as_str);
    arguments.iter().skip(1).any(|argument| {
        argument == "--no-verify"
            || (subcommand == Some("commit")
                && argument.starts_with('-')
                && !argument.starts_with("--")
                && argument[1..]
                    .chars()
                    .take_while(|letter| !"mFCct".contains(*letter))
                    .any(|letter| letter == 'n'))
    })
}

/// Reads a typed line and, when its tier may run, issues a plan for it. A
/// refusal is an answer, not an error: the console prints why.
///
/// `run_hooks` is the Settings switch the guided flows follow too: when it is
/// off, the plan adds `--no-verify` to `commit` and `push` and says so.
pub(crate) fn plan_console_command(
    settings: &ConsoleSettings,
    path: String,
    session_epoch: String,
    line: String,
    run_hooks: bool,
) -> Result<ConsolePlan, AppError> {
    let modes = settings.modes();
    let advanced_mode = modes.advanced_mode;
    let tokens = match tokenize::tokenize(&line) {
        Ok(tokens) => tokens,
        Err(refusal) => return Ok(refused(None, None, refusal, advanced_mode)),
    };
    let mut classified = match classify::classify(&tokens) {
        Ok(classified) => classified,
        Err(refusal) => {
            // A reason the classifier found in the words means no mode runs it.
            let tier = if matches!(
                refusal.reason,
                RefusalReason::NotGit | RefusalReason::MissingSubcommand
            ) {
                None
            } else {
                Some(Tier::Never)
            };
            return Ok(refused(
                Some(tokenize::display(&tokens)),
                tier,
                refusal,
                advanced_mode,
            ));
        }
    };
    // Repository access is taken only for the pre-flight reads below; a line
    // refused from its words never reaches the repository.
    let mut access = None;
    if let Intent::CheckoutName(name) = classified.intent.clone() {
        access = Some(application::authorize_repository(
            &path,
            "plan_console_command",
            None,
        )?);
        if preview::names_a_line(&path, &name)? {
            classified.tier = Tier::LocalChange;
            classified.intent = Intent::Switch {
                target: name,
                create: false,
            };
        }
    }
    let subcommand = classified.arguments.first().cloned().unwrap_or_default();
    if !classified.tier.allowed(advanced_mode) {
        return Ok(refused(
            Some(with_git(&classified.arguments)),
            Some(classified.tier),
            Refusal::new(RefusalReason::TierNotAllowed, Some(subcommand)),
            advanced_mode,
        ));
    }
    let (confirmation, fingerprint, facts) = if classified.tier == Tier::Read {
        (Confirmation::None, None, Vec::new())
    } else {
        if access.is_none() {
            access = Some(application::authorize_repository(
                &path,
                "plan_console_command",
                None,
            )?);
        }
        let mut facts = preview::facts(&path, &classified.intent, &classified.arguments)?;
        let typed = skips_hooks(&classified.arguments);
        if !run_hooks && !typed && matches!(subcommand.as_str(), "commit" | "push") {
            classified.arguments.insert(1, "--no-verify".to_string());
        }
        if skips_hooks(&classified.arguments) {
            facts.push(PlanFact::SkipsHooks { typed });
        }
        let confirmation = if modes.confirm_changes {
            Confirmation::YesNo
        } else {
            Confirmation::None
        };
        (confirmation, Some(preview::fingerprint(&path)?), facts)
    };
    drop(access);
    let command = with_git(&classified.arguments);
    let plan_id = plans().issue(StoredPlan {
        id: String::new(),
        path,
        session_epoch,
        arguments: classified.arguments,
        tier: classified.tier,
        shape: classified.shape,
        confirmation,
        fingerprint,
        created: Instant::now(),
    });
    Ok(ConsolePlan {
        plan_id: Some(plan_id),
        command: Some(command),
        tier: Some(classified.tier),
        effect: classified.tier.effect(),
        confirmation,
        shape: classified.shape,
        facts,
        refusal: None,
        advanced_mode,
    })
}

/// Runs a read plan issued by [`plan_console_command`] for this project
/// session. A plan that needs an answer goes through [`run_console_change`].
pub(crate) fn run_console_plan(
    path: String,
    session_epoch: String,
    plan_id: String,
) -> Result<ConsoleRunResult, AppError> {
    let plan = plans().take(&plan_id, &path, &session_epoch)?;
    // Checked again at run time: the gate is the plan's, not the caller's.
    if plan.tier != Tier::Read || plan.confirmation != Confirmation::None {
        return Err(stale_plan_error());
    }
    let (_repository, _access) =
        application::authorize_repository(&path, "run_console_plan", None)?;
    run(&path, plan)
}

/// Whether the person's answer to `[s/N]` means yes. Anything else is no.
fn is_yes(answer: &str) -> bool {
    matches!(
        answer.trim().to_lowercase().as_str(),
        "s" | "si" | "sí" | "y" | "yes"
    )
}

/// Runs a change plan after the person answered yes, or at once when change
/// confirmations are off: only in advanced mode, only under the confirmation
/// setting the plan was made with, and only while the repository still
/// matches the plan's preview.
pub(crate) fn run_console_change(
    settings: &ConsoleSettings,
    path: String,
    session_epoch: String,
    plan_id: String,
    answer: String,
) -> Result<ConsoleRunResult, AppError> {
    let plan = plans().take(&plan_id, &path, &session_epoch)?;
    if plan.tier == Tier::Read {
        return Err(stale_plan_error());
    }
    let modes = settings.modes();
    match plan.confirmation {
        Confirmation::YesNo if !is_yes(&answer) => {
            return Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "This console command runs only after you answer yes.",
            ));
        }
        // Planned without a question: only while confirmations stay off.
        Confirmation::None if modes.confirm_changes => {
            return Err(AppError::new(
                AppErrorCode::StalePreview,
                "Change confirmations were turned back on, so this command didn't run.",
            )
            .with_remediation("Type the command again to confirm it."));
        }
        _ => {}
    }
    if !plan.tier.allowed(modes.advanced_mode) {
        return Err(AppError::new(
            AppErrorCode::StalePreview,
            "Advanced console mode was turned off, so this command no longer runs.",
        )
        .with_remediation(
            "Choose advanced or root in Settings › Console › Console mode to run it.",
        ));
    }
    let (_repository, _access) =
        application::authorize_repository(&path, "run_console_change", None)?;
    if plan.fingerprint.as_deref() != Some(preview::fingerprint(&path)?.as_str()) {
        return Err(AppError::new(
            AppErrorCode::StalePreview,
            "The project changed after this command was previewed, so it didn't run.",
        )
        .with_remediation("Type the command again to see what it would do now."));
    }
    run(&path, plan)
}

fn run(path: &str, plan: StoredPlan) -> Result<ConsoleRunResult, AppError> {
    let arguments = plan
        .arguments
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let output = run_git_bounded_with_env(path, &arguments, CONSOLE_ENV)?;
    let stderr = plain_text(&output.stderr);
    let failure = if output.status.success() || plan.tier == Tier::Read {
        None
    } else {
        failure_hint(path, &plan.arguments, &stderr)
    };
    Ok(ConsoleRunResult {
        command: with_git(&plan.arguments),
        stdout: plain_text(&output.stdout),
        stderr,
        exit_code: output.status.code(),
        success: output.status.success(),
        truncated: output.stdout_truncated || output.stderr_truncated,
        shape: plan.shape,
        failure,
    })
}

/// A best-effort reading of why a change failed. Git gives no structured
/// reason, so this mirrors the guided flows: credentials, the remote's own
/// rules and a moved remote from the text; a signing failure from the text;
/// and a hook only when one is installed and was allowed to run.
fn failure_hint(path: &str, arguments: &[String], stderr: &str) -> Option<RunFailure> {
    let lower = stderr.to_lowercase();
    let subcommand = arguments.first().map(String::as_str).unwrap_or_default();
    if looks_like_authentication_failure(&lower) {
        return Some(RunFailure::AuthenticationFailed);
    }
    if lower.contains("[remote rejected]") || lower.contains("hook declined") {
        return Some(RunFailure::RemoteRejected);
    }
    if lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || lower.contains("not possible to fast-forward")
        || lower.contains("[rejected]")
    {
        return Some(RunFailure::NotFastForward);
    }
    if matches!(subcommand, "commit" | "tag")
        && (lower.contains("gpg failed to sign") || lower.contains("unable to sign"))
    {
        return Some(RunFailure::SigningFailed);
    }
    if !skips_hooks(arguments) && preview::hook_installed(path, subcommand) {
        return Some(RunFailure::HookRejected);
    }
    None
}

/// Explicit bidirectional embeddings, overrides and isolates. A path or a
/// commit subject carrying them can display as different text from what it
/// holds (the "Trojan Source" trick), so the console shows them as U+FFFD.
fn is_bidi_control(ch: char) -> bool {
    matches!(ch, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
}

/// Strip terminal controls before the renderer sees them. React renders the
/// result as text, but escape sequences and cursor controls would still make
/// copied output misleading or unreadable.
fn plain_text(bytes: &[u8]) -> String {
    let decoded = String::from_utf8_lossy(bytes);
    let mut chars = decoded.chars().peekable();
    let mut clean = String::with_capacity(decoded.len());
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    for next in chars.by_ref() {
                        if ('@'..='~').contains(&next) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    while let Some(next) = chars.next() {
                        if next == '\u{7}' {
                            break;
                        }
                        if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                _ => {
                    chars.next();
                }
            }
        } else if ch == '\r' {
            if chars.peek() == Some(&'\n') {
                chars.next();
            }
            clean.push('\n');
        } else if ch == '\n' || ch == '\t' || !(ch.is_control() || is_bidi_control(ch)) {
            clean.push(ch);
        } else {
            clean.push('\u{fffd}');
        }
    }
    clean
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git_command::test_git;
    use crate::test_support::{git_add, git_commit, git_init, unique_temp_dir, write_file};
    use std::path::Path;

    const EPOCH: &str = "epoch-1";

    fn plan(path: &str, line: &str) -> ConsolePlan {
        plan_console_command(&read_only(), path.into(), EPOCH.into(), line.into(), true).unwrap()
    }

    /// Settings with advanced mode off, as a new install has them.
    fn read_only() -> ConsoleSettings {
        ConsoleSettings::load(Path::new(&unique_temp_dir("console-settings-off")))
    }

    fn run(path: &str, line: &str) -> ConsoleRunResult {
        let plan = plan(path, line);
        let id = plan
            .plan_id
            .unwrap_or_else(|| panic!("{line} was refused: {:?}", plan.refusal));
        run_console_plan(path.into(), EPOCH.into(), id).unwrap()
    }

    fn git(path: &str, args: &[&str]) -> String {
        let output = test_git(path, args).unwrap();
        assert!(
            output.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    /// What a read must leave exactly as it was: the staged content, every
    /// ref and where HEAD points.
    fn repository_state(path: &str) -> (String, String, String) {
        (
            git(path, &["ls-files", "--stage"]),
            git(path, &["for-each-ref", "--format=%(refname) %(objectname)"]),
            std::fs::read_to_string(Path::new(path).join(".git/HEAD")).unwrap(),
        )
    }

    fn lock_files(directory: &Path) -> Vec<String> {
        let mut found = Vec::new();
        for entry in std::fs::read_dir(directory).unwrap().flatten() {
            let path = entry.path();
            if path.is_dir() {
                found.extend(lock_files(&path));
            } else if path
                .extension()
                .is_some_and(|extension| extension == "lock")
            {
                found.push(path.display().to_string());
            }
        }
        found
    }

    fn fixture(label: &str) -> String {
        let path = unique_temp_dir(label);
        git_init(&path);
        write_file(&path, "file.txt", "first\nsecond\n");
        git_add(&path, "file.txt");
        git_commit(&path, "first version");
        git(&path, &["tag", "v1"]);
        git(
            &path,
            &[
                "remote",
                "add",
                "origin",
                "https://example.invalid/demo.git",
            ],
        );
        write_file(&path, "file.txt", "first\nset aside\n");
        git(
            &path,
            &[
                "-c",
                "user.name=T",
                "-c",
                "user.email=t@example.invalid",
                "stash",
                "push",
                "-q",
                "-m",
                "aside",
            ],
        );
        write_file(&path, "file.txt", "first\nchanged\n");
        path
    }

    #[test]
    fn output_is_inert_and_lossy_text() {
        assert_eq!(
            plain_text(b"one\x1b[31m red\x1b[0m\x00\r\xff"),
            "one red\u{fffd}\n\u{fffd}"
        );
        assert_eq!(plain_text(b"x\x1b]0;title\x07y"), "xy");
        assert_eq!(plain_text(b"one\r\ntwo\rthree"), "one\ntwo\nthree");
        assert_eq!(
            plain_text("a\u{202e}txt.exe\u{2066}b".as_bytes()),
            "a\u{fffd}txt.exe\u{fffd}b"
        );
        assert_eq!(plain_text("señal ✓".as_bytes()), "señal ✓");
    }

    #[test]
    fn every_built_in_shortcut_is_a_read() {
        // The renderer's catalogue commands and built-in command lines, from
        // the query map down to the list of default line shortcuts.
        let source = include_str!("../../../src/features/console/domain.ts");
        let start = source
            .find("export const QUERY_COMMANDS")
            .expect("the query commands");
        let end = source[start..]
            .find("export type DefaultLineName")
            .expect("the default lines")
            + start;
        let lines = source[start..end]
            .split('"')
            .filter(|text| text.starts_with("git "))
            .collect::<Vec<_>>();
        assert_eq!(lines.len(), 20, "{lines:?}");
        for line in lines {
            let tokens = tokenize::tokenize(line).unwrap();
            let classified =
                classify::classify(&tokens).unwrap_or_else(|refusal| panic!("{line}: {refusal:?}"));
            assert_eq!(classified.tier, Tier::Read, "{line}");
        }
    }

    #[test]
    fn typed_reads_share_the_console_budget() {
        let policy = application::policy("run_console_plan");
        assert_eq!(policy.class, crate::git::OperationClass::ReadOnly);
        assert_eq!(policy.stdout_cap, 64 * 1024);
        assert_eq!(policy.stderr_cap, 8 * 1024);
        assert_eq!(policy.timeout, Duration::from_secs(15));
        assert_eq!(
            application::policy("plan_console_command").concurrency,
            crate::git::ConcurrencyClass::RepositoryRead
        );
    }

    #[test]
    fn every_read_subcommand_runs_bounded_and_inert_without_writing() {
        let path = fixture("console-typed-reads");
        let before = repository_state(&path);
        for line in [
            "git status",
            "git log --graph --oneline -- file.txt",
            "git log -p -1",
            "git show HEAD:file.txt",
            "git show --stat HEAD",
            "git diff",
            "git diff --stat HEAD",
            "git blame -L 1,2 file.txt",
            "git annotate file.txt",
            "git grep -n first",
            "git branch -a",
            "git branch --show-current",
            "git tag -l 'v*'",
            "git reflog",
            "git reflog show HEAD",
            "git stash list",
            "git stash show -p",
            "git remote -v",
            "git remote get-url origin",
            "git ls-files",
            "git ls-tree HEAD",
            "git cat-file -p HEAD",
            "git cat-file -t HEAD",
            "git cat-file -s HEAD:file.txt",
            "git rev-parse --abbrev-ref HEAD",
            "git describe --always --dirty",
            "git shortlog -sn",
            "git count-objects -v",
            "git name-rev HEAD",
            "git merge-base HEAD v1",
            "git for-each-ref refs/tags",
            "git show-ref --tags",
            "git version",
            "git --version",
        ] {
            let result = run(&path, line);
            assert!(result.success, "{line}: {}", result.stderr);
            assert!(!result.stdout.is_empty(), "{line} printed nothing");
            assert!(!result.truncated, "{line}");
            assert!(
                !result
                    .stdout
                    .chars()
                    .any(|ch| ch.is_control() && ch != '\n' && ch != '\t'),
                "{line} returned terminal controls"
            );
            assert_eq!(
                repository_state(&path),
                before,
                "{line} changed the repository"
            );
            assert!(
                lock_files(&Path::new(&path).join(".git")).is_empty(),
                "{line} left a lock"
            );
        }
        // `whatchanged` is on its way out of Git: newer versions answer with
        // a notice instead of a log, and either is a bounded read.
        let whatchanged = run(&path, "git whatchanged -1");
        assert!(whatchanged.success || !whatchanged.stderr.is_empty());
        assert_eq!(repository_state(&path), before);

        let result = run(&path, "git log --graph --oneline -- file.txt");
        assert_eq!(
            result.command,
            "git log --no-ext-diff --no-textconv --no-show-signature --graph --oneline -- file.txt"
        );
        assert_eq!(result.shape, OutputShape::Graph);
        assert!(result.stdout.contains("first version"));
        assert_eq!(
            run(&path, "git show HEAD:file.txt").stdout,
            "first\nsecond\n"
        );

        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn a_large_output_is_cut_at_the_console_budget() {
        let path = fixture("console-typed-large");
        write_file(&path, "file.txt", &"x\n".repeat(100_000));
        let result = run(&path, "git diff");
        assert!(result.success);
        assert!(result.truncated);
        assert!(result.stdout.len() <= 64 * 1024);
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn configured_programs_never_run_from_a_read() {
        let path = fixture("console-typed-programs");
        let marker = Path::new(&path).join("ran.txt");
        let marker_arg = marker.display().to_string().replace('\\', "/");
        let touch = format!("touch '{marker_arg}'");
        git(&path, &["config", "diff.external", &touch]);
        git(&path, &["config", "diff.marker.textconv", &touch]);
        write_file(&path, ".gitattributes", "*.txt diff=marker\n");
        // Without the console's flags, both programs do run: the check below
        // is not vacuous.
        test_git(&path, &["diff"]).unwrap();
        assert!(
            marker.exists(),
            "the external diff should run for plain git diff"
        );
        std::fs::remove_file(&marker).unwrap();
        test_git(&path, &["log", "-p", "-1"]).unwrap();
        assert!(
            marker.exists(),
            "text conversion should run for plain git log -p"
        );
        std::fs::remove_file(&marker).unwrap();

        for line in [
            "git diff",
            "git diff HEAD",
            "git log -p -1",
            "git show HEAD",
            "git show HEAD:file.txt",
            "git blame file.txt",
            "git grep first",
            "git stash show -p",
        ] {
            let result = run(&path, line);
            assert!(result.success, "{line}: {}", result.stderr);
            assert!(!marker.exists(), "{line} ran a configured program");
        }
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn aliases_in_the_project_config_are_never_run() {
        let path = fixture("console-typed-alias");
        let marker = Path::new(&path).join("alias-ran.txt");
        let marker_arg = marker.display().to_string().replace('\\', "/");
        git(&path, &["config", "alias.st", "status"]);
        git(
            &path,
            &["config", "alias.pwn", &format!("!touch '{marker_arg}'")],
        );
        for (line, subject) in [("git st", "st"), ("git pwn", "pwn")] {
            let plan = plan(&path, line);
            assert!(plan.plan_id.is_none(), "{line}");
            assert_eq!(
                plan.refusal,
                Some(Refusal::never(RefusalReason::UnknownSubcommand, subject))
            );
            assert_eq!(plan.tier, Some(Tier::Never));
        }
        assert!(!marker.exists());
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn refusals_are_answers_decided_before_any_process() {
        // A path with no repository: planning never touches it.
        let nowhere = unique_temp_dir("console-typed-nowhere");
        std::fs::remove_dir_all(&nowhere).unwrap();
        for (line, tier, reason, subject) in [
            (
                "git push",
                Some(Tier::Remote),
                RefusalReason::TierNotAllowed,
                Some("push"),
            ),
            (
                "git commit -m 'save'",
                Some(Tier::LocalChange),
                RefusalReason::TierNotAllowed,
                Some("commit"),
            ),
            (
                "git rebase main",
                Some(Tier::HistoryChange),
                RefusalReason::TierNotAllowed,
                Some("rebase"),
            ),
            (
                "git reset --hard",
                Some(Tier::Destructive),
                RefusalReason::TierNotAllowed,
                Some("reset"),
            ),
            (
                "git log --output=x",
                Some(Tier::Never),
                RefusalReason::WritesFile,
                Some("--output"),
            ),
            (
                "git -C .. status",
                Some(Tier::Never),
                RefusalReason::GlobalOption,
                Some("-C"),
            ),
            (
                "git status; rm -rf .",
                None,
                RefusalReason::ShellSyntax,
                Some(";"),
            ),
            ("git log 'open", None, RefusalReason::UnclosedQuote, None),
            ("git", None, RefusalReason::MissingSubcommand, None),
        ] {
            let plan = plan(&nowhere, line);
            assert!(plan.plan_id.is_none(), "{line}");
            assert_eq!(plan.tier, tier, "{line}");
            assert_eq!(
                plan.refusal,
                Some(Refusal::new(reason, subject.map(String::from))),
                "{line}"
            );
            assert_eq!(plan.effect, tier.and_then(Tier::effect), "{line}");
        }
        let push = plan(&nowhere, "git push origin main");
        assert_eq!(push.command.as_deref(), Some("git push origin main"));
        assert_eq!(push.effect, Some(Effect::ReachesRemote));
        assert!(!Path::new(&nowhere).exists());
    }

    #[test]
    fn a_plan_runs_once_for_its_own_project_session() {
        let path = fixture("console-typed-plans");
        let issued = plan(&path, "git status");
        assert_eq!(issued.tier, Some(Tier::Read));
        assert_eq!(issued.effect, Some(Effect::ReadsOnly));
        assert_eq!(issued.confirmation, Confirmation::None);
        let id = issued.plan_id.unwrap();
        run_console_plan(path.clone(), EPOCH.into(), id.clone()).unwrap();
        let reused = run_console_plan(path.clone(), EPOCH.into(), id).unwrap_err();
        assert_eq!(reused.code, AppErrorCode::StalePreview);

        let other_epoch = plan(&path, "git status").plan_id.unwrap();
        let error = run_console_plan(path.clone(), "epoch-2".into(), other_epoch).unwrap_err();
        assert_eq!(error.code, AppErrorCode::StalePreview);

        let other_path = plan(&path, "git status").plan_id.unwrap();
        let error =
            run_console_plan(format!("{path}-other"), EPOCH.into(), other_path).unwrap_err();
        assert_eq!(error.code, AppErrorCode::StalePreview);

        let invented =
            run_console_plan(path.clone(), EPOCH.into(), "console-0-1".into()).unwrap_err();
        assert_eq!(invented.code, AppErrorCode::StalePreview);
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn the_plan_store_stays_small() {
        let store = PlanStore::default();
        let stored = |index: usize| StoredPlan {
            id: String::new(),
            path: "/repo".into(),
            session_epoch: EPOCH.into(),
            arguments: vec![format!("{index}")],
            tier: Tier::Read,
            shape: OutputShape::Plain,
            confirmation: Confirmation::None,
            fingerprint: None,
            created: Instant::now(),
        };
        let first = store.issue(stored(0));
        for index in 1..=MAX_PLANS {
            store.issue(stored(index));
        }
        assert_eq!(store.plans.lock().unwrap().len(), MAX_PLANS);
        assert_eq!(
            store
                .take(&first, "/repo", EPOCH)
                .err()
                .map(|error| error.code),
            Some(AppErrorCode::StalePreview)
        );
    }
}

#[cfg(test)]
mod change_tests {
    use super::*;
    use crate::git_command::test_git;
    use crate::test_support::{git_add, git_commit, git_init, unique_temp_dir, write_file};
    use std::path::Path;

    const EPOCH: &str = "epoch-changes";

    fn advanced(label: &str) -> ConsoleSettings {
        let settings = ConsoleSettings::load(Path::new(&unique_temp_dir(label)));
        settings.set_advanced_mode(true, true).unwrap();
        settings
    }

    fn git(path: &str, args: &[&str]) -> String {
        let output = test_git(path, args).unwrap();
        assert!(
            output.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn repository(label: &str) -> (String, String) {
        let path = unique_temp_dir(label);
        git_init(&path);
        git(&path, &["config", "user.name", "Console Test"]);
        git(&path, &["config", "user.email", "console@example.invalid"]);
        write_file(&path, "file.txt", "first\n");
        git_add(&path, "file.txt");
        git_commit(&path, "first version");
        let line = git(&path, &["symbolic-ref", "--short", "HEAD"]);
        (path, line)
    }

    fn plan_with(
        settings: &ConsoleSettings,
        path: &str,
        line: &str,
        run_hooks: bool,
    ) -> ConsolePlan {
        plan_console_command(settings, path.into(), EPOCH.into(), line.into(), run_hooks).unwrap()
    }

    fn change(settings: &ConsoleSettings, path: &str, plan: ConsolePlan) -> ConsoleRunResult {
        let id = plan
            .plan_id
            .unwrap_or_else(|| panic!("refused: {:?}", plan.refusal));
        run_console_change(settings, path.into(), EPOCH.into(), id, "s".into()).unwrap()
    }

    /// Plans with hooks on, runs on yes, and requires success.
    fn apply(
        settings: &ConsoleSettings,
        path: &str,
        line: &str,
    ) -> (Vec<PlanFact>, ConsoleRunResult) {
        let plan = plan_with(settings, path, line, true);
        assert_eq!(plan.confirmation, Confirmation::YesNo, "{line}");
        let facts = plan.facts.clone();
        let result = change(settings, path, plan);
        assert!(result.success, "{line}: {}", result.stderr);
        (facts, result)
    }

    #[test]
    fn only_advanced_mode_plans_a_change_and_only_yes_runs_it() {
        let (path, _) = repository("console-change-gate");
        let off = ConsoleSettings::load(Path::new(&unique_temp_dir("console-change-off")));
        let refused = plan_with(&off, &path, "git add .", true);
        assert!(refused.plan_id.is_none());
        assert!(!refused.advanced_mode);
        assert_eq!(refused.tier, Some(Tier::LocalChange));
        assert_eq!(
            refused.refusal,
            Some(Refusal::new(
                RefusalReason::TierNotAllowed,
                Some("add".into())
            ))
        );

        let settings = advanced("console-change-on");
        write_file(&path, "new.txt", "new\n");
        let issued = plan_with(&settings, &path, "git add .", true);
        assert!(issued.advanced_mode);
        assert_eq!(issued.effect, Some(Effect::ChangesProject));
        // A change never runs through the read path, nor on anything but yes.
        let id = issued.plan_id.unwrap();
        assert_eq!(
            run_console_plan(path.clone(), EPOCH.into(), id)
                .unwrap_err()
                .code,
            AppErrorCode::StalePreview
        );
        let id = plan_with(&settings, &path, "git add .", true)
            .plan_id
            .unwrap();
        assert_eq!(
            run_console_change(&settings, path.clone(), EPOCH.into(), id, "n".into())
                .unwrap_err()
                .code,
            AppErrorCode::InvalidSelection
        );
        // Turning the mode off stops a plan issued while it was on.
        let id = plan_with(&settings, &path, "git add .", true)
            .plan_id
            .unwrap();
        settings.set_advanced_mode(false, false).unwrap();
        assert_eq!(
            run_console_change(&settings, path.clone(), EPOCH.into(), id, "s".into())
                .unwrap_err()
                .code,
            AppErrorCode::StalePreview
        );
        assert!(git(&path, &["diff", "--cached", "--name-only"]).is_empty());

        // History and destructive commands wait for recovery points.
        settings.set_advanced_mode(true, true).unwrap();
        for (line, tier) in [
            ("git commit --amend -m x", Tier::HistoryChange),
            ("git reset --hard", Tier::Destructive),
            ("git push --force", Tier::Destructive),
            ("git pull --rebase", Tier::HistoryChange),
        ] {
            let plan = plan_with(&settings, &path, line, true);
            assert!(plan.plan_id.is_none(), "{line}");
            assert_eq!(plan.tier, Some(tier), "{line}");
        }
        for answer in ["s", "S", " sí ", "y", "Yes"] {
            assert!(is_yes(answer), "{answer}");
        }
        for answer in ["", "n", "no", "ss", "sure"] {
            assert!(!is_yes(answer), "{answer}");
        }
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn with_confirmations_off_a_change_runs_without_an_answer() {
        let (path, _) = repository("console-change-unconfirmed");
        let settings = advanced("console-change-unconfirmed-settings");
        settings.set_confirm_changes(false, true).unwrap();
        write_file(
            &path, "a.txt", "a
",
        );
        let plan = plan_with(&settings, &path, "git add a.txt", true);
        assert_eq!(plan.confirmation, Confirmation::None);
        // The plan is still printed, and still checked against the repository.
        assert_eq!(
            plan.facts,
            [PlanFact::Stages {
                files: vec!["a.txt".into()],
                total: 1
            }]
        );
        let result = run_console_change(
            &settings,
            path.clone(),
            EPOCH.into(),
            plan.plan_id.unwrap(),
            String::new(),
        )
        .unwrap();
        assert!(result.success, "{}", result.stderr);
        assert_eq!(git(&path, &["diff", "--cached", "--name-only"]), "a.txt");
        // Not a read: it never runs through the read path.
        let id = plan_with(&settings, &path, "git add a.txt", true)
            .plan_id
            .unwrap();
        assert_eq!(
            run_console_plan(path.clone(), EPOCH.into(), id)
                .unwrap_err()
                .code,
            AppErrorCode::StalePreview
        );

        // Turning confirmations back on stops a plan made without a question.
        write_file(
            &path, "b.txt", "b
",
        );
        let unasked = plan_with(&settings, &path, "git add b.txt", true);
        settings.set_confirm_changes(true, false).unwrap();
        let error = run_console_change(
            &settings,
            path.clone(),
            EPOCH.into(),
            unasked.plan_id.unwrap(),
            "s".into(),
        )
        .unwrap_err();
        assert_eq!(error.code, AppErrorCode::StalePreview);
        assert_eq!(git(&path, &["diff", "--cached", "--name-only"]), "a.txt");
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn each_local_change_previews_then_runs() {
        let (path, main) = repository("console-change-local");
        let settings = advanced("console-change-local-settings");

        write_file(&path, "new.txt", "new\n");
        let (facts, _) = apply(&settings, &path, "git add new.txt");
        assert_eq!(
            facts,
            [PlanFact::Stages {
                files: vec!["new.txt".into()],
                total: 1
            }]
        );
        assert_eq!(git(&path, &["diff", "--cached", "--name-only"]), "new.txt");

        apply(&settings, &path, "git restore --staged new.txt");
        assert!(git(&path, &["diff", "--cached", "--name-only"]).is_empty());

        apply(&settings, &path, "git add new.txt");
        let (facts, result) = apply(&settings, &path, "git commit -m 'second version'");
        assert_eq!(
            facts,
            [PlanFact::Commits {
                line: Some(main.clone()),
                files: Some(1)
            }]
        );
        assert!(result.stdout.contains("second version"));

        apply(&settings, &path, "git mv new.txt moved.txt");
        apply(&settings, &path, "git commit -m moved");

        let (facts, _) = apply(&settings, &path, "git switch -c try");
        assert_eq!(
            facts,
            [PlanFact::Switches {
                target: "try".into(),
                create: true
            }]
        );
        write_file(&path, "try.txt", "try\n");
        apply(&settings, &path, "git add try.txt");
        apply(&settings, &path, "git commit -m 'on try'");
        let on_try = git(&path, &["rev-parse", "HEAD"]);

        // `checkout <line>` is a switch once the plan finds the line.
        let plan = plan_with(&settings, &path, &format!("git checkout {main}"), true);
        assert_eq!(plan.tier, Some(Tier::LocalChange));
        assert_eq!(
            plan.facts,
            [PlanFact::Switches {
                target: main.clone(),
                create: false
            }]
        );
        change(&settings, &path, plan);
        assert_eq!(git(&path, &["symbolic-ref", "--short", "HEAD"]), main);
        // A file name is not a line: it stays refused.
        let restore = plan_with(&settings, &path, "git checkout file.txt", true);
        assert_eq!(restore.tier, Some(Tier::Destructive));
        assert!(restore.plan_id.is_none());

        let (facts, _) = apply(&settings, &path, "git branch feature");
        assert_eq!(
            facts,
            [PlanFact::CreatesLine {
                name: "feature".into()
            }]
        );
        let (facts, _) = apply(&settings, &path, "git tag -a v2 -m 'release'");
        assert_eq!(facts, [PlanFact::CreatesTag { name: "v2".into() }]);
        assert_eq!(git(&path, &["tag", "--list", "v2"]), "v2");

        let (facts, _) = apply(&settings, &path, &format!("git cherry-pick {on_try}"));
        assert_eq!(facts, [PlanFact::CopiesVersion { version: on_try }]);
        assert!(Path::new(&path).join("try.txt").exists());

        let (facts, result) = apply(&settings, &path, "git revert HEAD");
        assert_eq!(
            facts,
            [PlanFact::Reverts {
                version: "HEAD".into()
            }]
        );
        assert!(result.command.starts_with("git revert --no-edit"));
        assert!(!Path::new(&path).join("try.txt").exists());

        write_file(&path, "file.txt", "first\nchanged\n");
        let (facts, _) = apply(&settings, &path, "git stash push -m wip");
        assert_eq!(facts, [PlanFact::SetsAside { files: 1 }]);
        assert!(git(&path, &["stash", "list"]).contains("wip"));
        let (facts, _) = apply(&settings, &path, "git stash apply");
        assert_eq!(
            facts,
            [PlanFact::AppliesSetAside {
                stash: "stash@{0}".into()
            }]
        );
        assert_eq!(
            std::fs::read_to_string(Path::new(&path).join("file.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "first\nchanged\n"
        );
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn a_plan_is_refused_once_the_repository_moves() {
        let (path, _) = repository("console-change-stale");
        let settings = advanced("console-change-stale-settings");
        write_file(&path, "a.txt", "a\n");
        let staged = plan_with(&settings, &path, "git add a.txt", true);
        // Something else changes the project between preview and yes.
        write_file(&path, "b.txt", "b\n");
        let error = run_console_change(
            &settings,
            path.clone(),
            EPOCH.into(),
            staged.plan_id.unwrap(),
            "s".into(),
        )
        .unwrap_err();
        assert_eq!(error.code, AppErrorCode::StalePreview);
        assert!(git(&path, &["diff", "--cached", "--name-only"]).is_empty());

        git(&path, &["add", "a.txt", "b.txt"]);
        let commit = plan_with(&settings, &path, "git commit -m ours", true);
        git(&path, &["commit", "-q", "-m", "theirs"]);
        let error = run_console_change(
            &settings,
            path.clone(),
            EPOCH.into(),
            commit.plan_id.unwrap(),
            "s".into(),
        )
        .unwrap_err();
        assert_eq!(error.code, AppErrorCode::StalePreview);
        assert!(!git(&path, &["log", "--format=%s"]).contains("ours"));
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn hooks_run_unless_settings_or_the_command_skip_them() {
        let (path, _) = repository("console-change-hooks");
        let settings = advanced("console-change-hooks-settings");
        let hooks = Path::new(&path).join(".git/hooks");
        std::fs::create_dir_all(&hooks).unwrap();
        std::fs::write(
            hooks.join("pre-commit"),
            "#!/bin/sh\necho 'blocked by the project' >&2\nexit 1\n",
        )
        .unwrap();
        write_file(&path, "file.txt", "second\n");
        git(&path, &["add", "file.txt"]);

        let blocked = plan_with(&settings, &path, "git commit -m blocked", true);
        assert!(!blocked
            .facts
            .iter()
            .any(|fact| matches!(fact, PlanFact::SkipsHooks { .. })));
        let result = change(&settings, &path, blocked);
        assert!(!result.success);
        assert_eq!(result.failure, Some(RunFailure::HookRejected));
        assert!(result.stderr.contains("blocked by the project"));

        // Hooks turned off in Settings: the plan adds and states `--no-verify`.
        let skipped = plan_with(&settings, &path, "git commit -m skipped", false);
        assert_eq!(
            skipped.command.as_deref(),
            Some("git commit --no-verify -m skipped")
        );
        assert!(skipped
            .facts
            .contains(&PlanFact::SkipsHooks { typed: false }));
        assert!(change(&settings, &path, skipped).success);

        // Typed by the person, it is honoured and stated, never added twice.
        write_file(&path, "file.txt", "third\n");
        git(&path, &["add", "file.txt"]);
        let typed = plan_with(&settings, &path, "git commit -n -m typed", false);
        assert_eq!(typed.command.as_deref(), Some("git commit -n -m typed"));
        assert!(typed.facts.contains(&PlanFact::SkipsHooks { typed: true }));
        assert!(change(&settings, &path, typed).success);
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn remote_changes_reach_a_local_bare_remote() {
        let (path, main) = repository("console-change-remote");
        let settings = advanced("console-change-remote-settings");
        let bare = unique_temp_dir("console-change-remote-bare");
        git(&bare, &["init", "-q", "--bare"]);
        git(&path, &["remote", "add", "origin", &bare]);

        let (facts, _) = apply(&settings, &path, &format!("git push -u origin {main}"));
        assert_eq!(
            facts,
            [PlanFact::Publishes {
                remote: Some("origin".into()),
                line: Some(main.clone()),
                versions: None
            }]
        );
        write_file(&path, "file.txt", "second\n");
        git(&path, &["commit", "-q", "-am", "second"]);
        let (facts, _) = apply(&settings, &path, "git push");
        assert_eq!(
            facts,
            [PlanFact::Publishes {
                remote: Some("origin".into()),
                line: Some(main.clone()),
                versions: Some(1)
            }]
        );
        assert_eq!(
            git(&bare, &["rev-parse", &main]),
            git(&path, &["rev-parse", "HEAD"])
        );

        // A teammate publishes; fetch, then a fast-forward pull, bring it in.
        let teammate = unique_temp_dir("console-change-remote-teammate");
        std::fs::remove_dir_all(&teammate).unwrap();
        test_git(&path, &["clone", "-q", &bare, &teammate]).unwrap();
        git(&teammate, &["config", "user.name", "Teammate"]);
        git(
            &teammate,
            &["config", "user.email", "teammate@example.invalid"],
        );
        write_file(&teammate, "theirs.txt", "theirs\n");
        git(&teammate, &["add", "theirs.txt"]);
        git(&teammate, &["commit", "-q", "-m", "theirs"]);
        git(&teammate, &["push", "-q", "origin", &main]);

        let (facts, _) = apply(&settings, &path, "git fetch");
        assert_eq!(
            facts,
            [PlanFact::Fetches {
                remote: Some("origin".into())
            }]
        );
        let (facts, result) = apply(&settings, &path, "git pull");
        assert_eq!(
            facts,
            [PlanFact::Pulls {
                remote: Some("origin".into())
            }]
        );
        assert!(result.command.starts_with("git pull --no-rebase --ff-only"));
        assert!(Path::new(&path).join("theirs.txt").exists());

        apply(&settings, &path, "git ls-remote origin");
        apply(&settings, &path, "git remote show origin");

        // Both sides move on: the push is refused, and says why.
        write_file(&teammate, "theirs.txt", "again\n");
        git(&teammate, &["commit", "-q", "-am", "again"]);
        git(&teammate, &["push", "-q", "origin", &main]);
        write_file(&path, "file.txt", "ours\n");
        git(&path, &["commit", "-q", "-am", "ours"]);
        let rejected = change(
            &settings,
            &path,
            plan_with(&settings, &path, "git push", true),
        );
        assert!(!rejected.success);
        assert_eq!(rejected.failure, Some(RunFailure::NotFastForward));
        // Pulling now needs a merge, which only a fast-forward plan refuses.
        let pull = change(
            &settings,
            &path,
            plan_with(&settings, &path, "git pull", true),
        );
        assert!(!pull.success);
        assert_eq!(pull.failure, Some(RunFailure::NotFastForward));

        for directory in [path, bare, teammate] {
            std::fs::remove_dir_all(directory).unwrap();
        }
    }
}
