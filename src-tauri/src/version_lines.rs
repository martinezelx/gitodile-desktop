use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{
    checked_git_stdout, git_stdout, run_git, run_git_capped, run_git_with_input_capped,
};
use crate::index::prepare_index;
use crate::operation::{truncate_detail, OperationKind};
use crate::recovery::{
    create_history_recovery_for, plan_history_recovery_for, verify_history_recovery,
    HistoryRecoveryMetadata, HistoryRecoveryOperation, HistoryRecoveryPreview,
};
use crate::repository::{
    display_path, git_operation_in_progress, resolve_head_state, validate_branch_ref_name,
    HeadState,
};
use crate::status::{read_working_tree_status, ChangeCategory, WorkingTreeStatus};
use crate::tooling::parse_git_version;
use std::{path::PathBuf, process::Output};

// ---- Version lines (task 016) ----
//
// "Version line" is simple-mode wording for a local Git branch. This section
// owns discovery (read-only) and the create/switch/delete plan-then-execute
// contracts. Every mutation here requires `git switch` support (Git >= 2.23,
// see `require_git_switch_support`) — this is the first Git-version floor
// enforced anywhere in the app; task 002 deliberately left minimum-version
// enforcement out of scope, so the check stays local to these commands
// instead of a global gate.

/// Safety cap on how many local branches a single discovery call reports in
/// full. Chosen to comfortably cover ordinary projects while keeping the
/// per-branch reachability/uniqueness queries below bounded; counts stay
/// exact even when the list itself is truncated.
pub(crate) const VERSION_LINE_LIST_CAP: usize = 300;

pub(crate) fn git_version_at_least(version: &str, minimum: (u32, u32, u32)) -> bool {
    let mut parts = version
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty());
    let major: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let minor: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    (major, minor, patch) >= minimum
}

pub(crate) fn git_supports_switch(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["--version"])?;
    if !output.status.success() {
        return Ok(false);
    }
    Ok(git_version_at_least(
        &parse_git_version(&git_stdout(&output)),
        (2, 23, 0),
    ))
}

/// Gate shared by create/switch/delete. Discovery (`get_version_lines`) never
/// calls this — read-only listing stays available regardless of Git version.
pub(crate) fn require_git_switch_support(path: &str) -> Result<(), AppError> {
    if git_supports_switch(path)? {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::GitVersionTooOld,
            "This version of Git is too old for GitOdile to change version lines safely.",
        )
        .with_remediation("Update Git to version 2.23 or newer, then try again."))
    }
}

pub(crate) struct WorktreeEntry {
    pub(crate) path: String,
    pub(crate) branch: Option<String>,
}

/// Parses `git worktree list --porcelain`: repeated blocks of `key value`
/// lines separated by a blank line, one block per worktree (the main one
/// first). A block with no `branch` line is detached there, which is simply
/// reported as no occupied branch for that worktree.
pub(crate) fn parse_worktree_list_porcelain(text: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(path) = current_path.take() {
                entries.push(WorktreeEntry {
                    path,
                    branch: current_branch.take(),
                });
            }
            current_path = Some(path.to_string());
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            current_branch = branch_ref.strip_prefix("refs/heads/").map(str::to_string);
        } else if line.is_empty() {
            if let Some(path) = current_path.take() {
                entries.push(WorktreeEntry {
                    path,
                    branch: current_branch.take(),
                });
            }
        }
    }
    if let Some(path) = current_path.take() {
        entries.push(WorktreeEntry {
            path,
            branch: current_branch.take(),
        });
    }
    entries
}

pub(crate) fn list_worktrees(path: &str) -> Result<Vec<WorktreeEntry>, AppError> {
    let output = checked_git_stdout(run_git(path, &["worktree", "list", "--porcelain"])?)?;
    Ok(parse_worktree_list_porcelain(&output))
}

/// Local branch names that this app can represent exactly. See
/// `parse_version_line_refs` for why unrepresentable names are skipped rather
/// than lossily converted.
pub(crate) fn list_branch_names(path: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(
        path,
        &["for-each-ref", "--format=%(refname:short)%00", "refs/heads"],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project's version-line names.",
        )
        .with_remediation("Check that the project's Git references are readable."));
    }
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty() && *field != b"\n" && *field != b"\r\n")
        .filter_map(|field| {
            let field = field.strip_prefix(b"\n").unwrap_or(field);
            let field = field.strip_suffix(b"\r").unwrap_or(field);
            // Skipping an unrepresentable name is safe for every caller here:
            // this list exists to reject an exact or case-only duplicate of a
            // *new* name, and a new name is always valid UTF-8, so it can
            // never collide with bytes that are not.
            std::str::from_utf8(field).ok().map(str::to_string)
        })
        .collect())
}

/// Refs (local branches or remote-tracking refs) other than `name` itself
/// whose history already contains `tip` — the "is this work retained
/// elsewhere" proof required before any deletion, and the same signal used
/// to flag a line as safely retained in discovery.
pub(crate) fn retaining_refs(path: &str, name: &str, tip: &str) -> Result<Vec<String>, AppError> {
    let own_ref = format!("refs/heads/{name}");
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--contains",
            tip,
            "--format=%(refname)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(git_stdout(&output)
        .lines()
        .filter(|line| *line != own_ref)
        .map(str::to_string)
        .collect())
}

/// The lines a remote calls its default, read from `refs/remotes/<remote>/HEAD`.
///
/// This is the only signal for it that is both cheap and true: `init.defaultBranch`
/// is a *global* preference for repositories yet to be created, and a name like
/// `main` or `master` is a guess. A project with no remote — or one whose remote
/// HEAD was never fetched — simply has no default line, and nothing is protected
/// on the strength of a guess.
pub(crate) fn default_branch_names(path: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(symref)",
            "refs/remotes/*/HEAD",
        ],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for line in git_stdout(&output).lines() {
        let Some((refname, symref)) = line.split_once('\0') else {
            continue;
        };
        // `refs/remotes/origin/HEAD` minus `HEAD` is the prefix every branch of
        // that remote carries, so stripping it is exact even for a branch whose
        // own name looks like a remote's.
        let Some(prefix) = refname.strip_suffix("HEAD") else {
            continue;
        };
        if let Some(name) = symref.strip_prefix(prefix) {
            if !name.is_empty() && !names.iter().any(|known| known == name) {
                names.push(name.to_string());
            }
        }
    }
    Ok(names)
}

/// Refuses a change that would take a remote's default line out from under the
/// project. Shared by delete and rename, which are the two ways to do it.
pub(crate) fn ensure_not_default_branch(path: &str, name: &str) -> Result<(), AppError> {
    if default_branch_names(path)?
        .iter()
        .any(|known| known == name)
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineIsDefault,
            format!("\"{name}\" is this project's main version line."),
        )
        .with_remediation(
            "It's where the project's shared work lives, so GitOdile keeps it as it is.",
        ));
    }
    Ok(())
}

pub(crate) fn add_reaching_ref(references: &mut Vec<String>, reference: &str) {
    if references.iter().any(|existing| existing == reference) {
        return;
    }
    // Inventory only needs to know whether at least one *other* ref reaches a
    // branch tip. Keeping two distinct names is sufficient to answer that for
    // every branch while bounding memory even in repositories with many refs.
    if references.len() < 2 {
        references.push(reference.to_string());
    }
}

/// Computes the refs that can reach every commit in one graph walk. This
/// replaces one `for-each-ref --contains` process per listed branch during
/// discovery; delete planning still asks Git for the exact retained-by list.
pub(crate) fn reaching_refs_by_commit(
    path: &str,
) -> Result<std::collections::HashMap<String, Vec<String>>, AppError> {
    use std::collections::HashMap;

    let refs_output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(refname)%00",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    if !refs_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect which references retain these version lines.",
        ));
    }

    let mut reaching: HashMap<String, Vec<String>> = HashMap::new();
    let mut fields = refs_output.stdout.split(|byte| *byte == 0);
    while let Some(commit_bytes) = fields.next() {
        if commit_bytes.is_empty() || commit_bytes == b"\n" || commit_bytes == b"\r\n" {
            continue;
        }
        let commit_bytes = commit_bytes.strip_prefix(b"\n").unwrap_or(commit_bytes);
        let Some(reference_bytes) = fields.next() else {
            break;
        };
        let reference_bytes = reference_bytes
            .strip_suffix(b"\r")
            .unwrap_or(reference_bytes);
        // A ref this app cannot name is dropped rather than failing the walk.
        // That errs toward "we cannot prove this line is retained elsewhere",
        // which shows the branch as carrying unique work — the cautious
        // answer. Deletion safety does not rest on it either way:
        // `git branch -d` remains the actual enforcement.
        let (Ok(commit), Ok(reference)) = (
            std::str::from_utf8(commit_bytes),
            std::str::from_utf8(reference_bytes),
        ) else {
            continue;
        };
        add_reaching_ref(reaching.entry(commit.to_string()).or_default(), reference);
    }

    let graph = run_git(
        path,
        &[
            "rev-list",
            "--topo-order",
            "--parents",
            "--branches",
            "--remotes",
        ],
    )?;
    if !graph.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect version-line reachability.",
        ));
    }
    let graph_text = std::str::from_utf8(&graph.stdout).map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned commit identifiers that couldn't be represented safely.",
        )
    })?;
    for line in graph_text.lines() {
        let mut commits = line.split_ascii_whitespace();
        let Some(commit) = commits.next() else {
            continue;
        };
        let sources = reaching.get(commit).cloned().unwrap_or_default();
        if sources.is_empty() {
            continue;
        }
        for parent in commits {
            let parent_sources = reaching.entry(parent.to_string()).or_default();
            for source in &sources {
                add_reaching_ref(parent_sources, source);
            }
        }
    }
    Ok(reaching)
}

/// Versions reachable from `tip` and not from `base` — the main line's ref.
pub(crate) fn branch_unique_commit_count(path: &str, base: Option<&str>, tip: &str) -> Option<u32> {
    let base = base?;
    let output = run_git(path, &["rev-list", "--count", &format!("{base}..{tip}")]).ok()?;
    if !output.status.success() {
        return None;
    }
    git_stdout(&output).parse().ok()
}

pub(crate) fn split_nul_list(output: &Output) -> Vec<String> {
    String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

/// Cheap, deterministic fingerprint of a typed working-tree status. Reuses
/// the status this command already fetched for its own validation, so
/// building a state token never costs an extra Git process — unlike
/// save-version's `compute_state_token`, which needs a real tree hash because
/// it must detect drift in a *selected subset* of files.
pub(crate) fn status_fingerprint(status: &WorkingTreeStatus) -> String {
    let mut fingerprint = format!("clean:{}|total:{}|", status.is_clean, status.counts.total);
    for entry in &status.entries {
        fingerprint.push_str(&entry.path);
        fingerprint.push(':');
        fingerprint.push_str(match entry.category {
            ChangeCategory::Changed => "c",
            ChangeCategory::New => "n",
            ChangeCategory::Deleted => "d",
            ChangeCategory::Renamed => "r",
            ChangeCategory::Conflicted => "x",
        });
        fingerprint.push(if entry.is_prepared { '1' } else { '0' });
        fingerprint.push('|');
    }
    fingerprint
}

/// Fingerprint used when creating a line with unsaved/prepared work. The
/// status shape alone cannot detect editing the same already-modified file
/// after preview, so include both the complete worktree tree and the exact
/// staged-content tree. `prepare_index` uses a temporary index and never
/// mutates the user's real one; `write-tree` reads the real index without
/// depending on volatile stat-cache bytes.
pub(crate) fn create_version_line_state_fingerprint(
    path: &str,
    head_state: &HeadState,
    status: &WorkingTreeStatus,
) -> Result<String, AppError> {
    let prepared_index = prepare_index(path, head_state, None)?;
    let worktree_tree = &prepared_index.tree;
    let index_tree = checked_git_stdout(run_git(path, &["write-tree"])?)?;
    Ok(format!(
        "{}|worktree-tree:{worktree_tree}|index-tree:{index_tree}",
        status_fingerprint(status),
    ))
}

pub(crate) fn compute_version_line_state_token(
    head: Option<&str>,
    branch: Option<&str>,
    status_fingerprint: &str,
    extra: &str,
) -> String {
    use std::hash::{Hash, Hasher};
    let fingerprint = format!(
        "head:{}|branch:{}|status:{status_fingerprint}|extra:{extra}|",
        head.unwrap_or("unborn"),
        branch.unwrap_or("detached"),
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLineTip {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) subject: String,
    pub(crate) committed_at: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLine {
    pub(crate) name: String,
    pub(crate) tip: VersionLineTip,
    pub(crate) is_active: bool,
    pub(crate) upstream: Option<String>,
    pub(crate) is_retained_elsewhere: bool,
    pub(crate) unique_commit_count: Option<u32>,
    pub(crate) worktree_path: Option<String>,
    /// Commits on this line not yet on `upstream`. `None` when there is no
    /// upstream to compare against; `Some(0)` means fully pushed.
    pub(crate) upstream_ahead: Option<u32>,
    /// Commits on `upstream` not yet on this line. Same `None`/`Some(0)`
    /// convention as `upstream_ahead`.
    pub(crate) upstream_behind: Option<u32>,
    /// The configured upstream ref was deleted on the remote (Git reports
    /// this as `[gone]`). `ahead`/`behind` are meaningless in this state —
    /// there is nothing left to compare against.
    pub(crate) upstream_gone: bool,
    /// This is a remote's default line (`refs/remotes/<remote>/HEAD` points at
    /// it). Deleting or renaming it locally is almost never what someone
    /// means, so both are refused and the screen does not offer them.
    pub(crate) is_default: bool,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLinesSnapshot {
    pub(crate) branch: Option<String>,
    pub(crate) head_state: HeadState,
    pub(crate) current_commit: Option<String>,
    pub(crate) lines: Vec<VersionLine>,
    pub(crate) total_count: usize,
    pub(crate) is_truncated: bool,
    /// Local branches whose exact bytes this app cannot represent, and which
    /// are therefore absent from `lines`. Surfaced so the screen can say so
    /// instead of quietly showing an incomplete list.
    pub(crate) unreadable_count: usize,
}

#[derive(Debug)]
pub(crate) struct VersionLineRaw {
    pub(crate) name: String,
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) subject: String,
    pub(crate) committed_at: String,
    pub(crate) upstream: Option<String>,
    /// Raw `%(upstream:track)` text, e.g. `[ahead 2, behind 1]` or `[gone]`.
    /// Empty when there is no upstream, or when the upstream is fully in
    /// sync — those two cases are told apart using `upstream` itself.
    pub(crate) upstream_track: String,
    pub(crate) unique_commit_count: Option<u32>,
    pub(crate) worktree_path: Option<String>,
}

/// Parsed form of `%(upstream:track)`.
pub(crate) struct UpstreamTrack {
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
    pub(crate) gone: bool,
}

/// Git has printed this atom as `[ahead N]`, `[behind N]`,
/// `[ahead N, behind M]`, `[gone]`, or empty (no drift, or no upstream —
/// callers that need to tell those two apart check `upstream` separately)
/// since long before this app's minimum supported Git version.
pub(crate) fn parse_upstream_track(raw: &str) -> UpstreamTrack {
    let inner = raw.trim().trim_start_matches('[').trim_end_matches(']');
    if inner == "gone" {
        return UpstreamTrack {
            ahead: 0,
            behind: 0,
            gone: true,
        };
    }
    let mut ahead = 0;
    let mut behind = 0;
    for part in inner.split(',') {
        let part = part.trim();
        if let Some(count) = part.strip_prefix("ahead ") {
            ahead = count.trim().parse().unwrap_or(0);
        } else if let Some(count) = part.strip_prefix("behind ") {
            behind = count.trim().parse().unwrap_or(0);
        }
    }
    UpstreamTrack {
        ahead,
        behind,
        gone: false,
    }
}

/// Parses one `for-each-ref` record per line, fields separated by the literal
/// NUL bytes `%00` writes into the format string. Machine-readable and
/// version-agnostic — this is the read-only half of the feature and must stay
/// usable regardless of `require_git_switch_support`.
/// Parsed inventory plus the number of records skipped because their bytes
/// are not valid UTF-8.
pub(crate) struct ParsedVersionLines {
    pub(crate) lines: Vec<VersionLineRaw>,
    pub(crate) unreadable_count: usize,
}

/// Git ref names are bytes, not text, so a name this app cannot represent is
/// possible. Such a record is skipped and counted, never lossily converted:
/// showing a name peppered with replacement characters would invite the user
/// to act on something that does not exist, and every mutation is keyed by
/// exact name. Skipping one record rather than failing the whole read keeps
/// the other lines usable, which is the same "show what is true, say what is
/// missing" contract `is_truncated` already follows.
pub(crate) fn parse_version_line_refs(bytes: &[u8]) -> ParsedVersionLines {
    let mut lines = Vec::new();
    let mut unreadable_count = 0;
    for line in bytes.split(|byte| *byte == b'\n') {
        if line.is_empty() {
            continue;
        }
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let fields = line.split(|byte| *byte == 0).collect::<Vec<_>>();
        if fields.len() < 3 {
            continue;
        }
        let decode = |field: &[u8]| -> Option<String> {
            std::str::from_utf8(field).ok().map(str::to_string)
        };
        // The ref name decides whether this record counts as unreadable; a
        // malformed line that is not a local branch at all is simply not ours.
        let Some(refname) = decode(fields[0]) else {
            unreadable_count += 1;
            continue;
        };
        let Some(name) = refname.strip_prefix("refs/heads/") else {
            continue;
        };
        let (Some(commit), Some(short_commit)) = (decode(fields[1]), decode(fields[2])) else {
            unreadable_count += 1;
            continue;
        };
        // Metadata that cannot be represented degrades to empty rather than
        // dropping an otherwise addressable line: the name is what mutations
        // need, and the subject and date are decoration.
        lines.push(VersionLineRaw {
            name: name.to_string(),
            commit,
            short_commit,
            subject: fields
                .get(3)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            committed_at: fields
                .get(4)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            upstream: fields
                .get(5)
                .and_then(|field| decode(field))
                .filter(|value| !value.trim().is_empty()),
            upstream_track: fields
                .get(6)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            // Git >= 2.41 can calculate both values inside the inventory's
            // single graph walk. Older versions return only the base seven
            // fields and use the compatibility path in `get_version_lines`.
            unique_commit_count: fields
                .get(7)
                .and_then(|field| decode(field))
                .and_then(|counts| counts.split_ascii_whitespace().next()?.parse().ok()),
            worktree_path: fields
                .get(8)
                .and_then(|field| decode(field))
                .filter(|value| !value.trim().is_empty()),
        });
    }
    ParsedVersionLines {
        lines,
        unreadable_count,
    }
}

/// `%(upstream:track)` has been available since long before this app's
/// minimum supported Git version (unlike `ahead-behind`/`worktreepath`
/// below), so it lives in the base format and is available on the legacy
/// path too.
pub(crate) const VERSION_LINE_BASE_FORMAT: &str =
    "%(refname)%00%(objectname)%00%(objectname:short)%00%(contents:subject)%00%(committerdate:iso-strict)%00%(upstream:short)%00%(upstream:track)";

/// Git 2.41 added `ahead-behind:<committish>` to `for-each-ref`; together
/// with `worktreepath`, it folds the old one-process-per-line count and the
/// separate worktree inventory into the branch inventory's existing graph
/// walk. Discovery still supports older Git versions: an unsupported atom
/// makes this first command fail without mutating anything, then the legacy
/// format and helpers provide exactly the previous answer.
///
/// `count_base` is what the ahead count is measured against: the main line's
/// ref when the project has one, otherwise the current commit — whose counts
/// the caller then discards, keeping the one inventory walk for the worktree
/// paths it also answers.
pub(crate) fn read_version_line_refs(
    path: &str,
    count_base: Option<&str>,
) -> Result<(ParsedVersionLines, bool), AppError> {
    if let Some(base) = count_base {
        let format = format!(
            "--format={VERSION_LINE_BASE_FORMAT}%00%(ahead-behind:{base})%00%(worktreepath)"
        );
        let batched = run_git(
            path,
            &[
                "for-each-ref",
                &format,
                "--sort=-committerdate",
                "refs/heads",
            ],
        )?;
        if batched.status.success() {
            return Ok((parse_version_line_refs(&batched.stdout), true));
        }
    }

    let legacy_format = format!("--format={VERSION_LINE_BASE_FORMAT}");
    let legacy = run_git(
        path,
        &[
            "for-each-ref",
            &legacy_format,
            "--sort=-committerdate",
            "refs/heads",
        ],
    )?;
    if !legacy.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project's version lines.",
        ));
    }
    Ok((parse_version_line_refs(&legacy.stdout), false))
}

/// Read-only, local-only branch inventory. Never contacts a remote; any
/// upstream/reachability information reflects only what is already known
/// from local refs, exactly like the rest of the app's "no fresh remote
/// truth" convention for non-network commands.
pub(crate) fn get_version_lines(path: String) -> Result<VersionLinesSnapshot, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "get_version_lines", None)?;
    let symbolic_head = run_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    // One verification answers both questions: whether HEAD exists and which
    // commit it names. The previous implementation launched this same command
    // twice on every refresh.
    let verified_head = run_git(&path, &["rev-parse", "--verify", "HEAD"])?;
    let current_commit = verified_head
        .status
        .success()
        .then(|| git_stdout(&verified_head));
    let head_state = match (branch.is_some(), current_commit.is_some()) {
        (true, true) => HeadState::Branch,
        (false, true) => HeadState::Detached,
        (_, false) => HeadState::Unborn,
    };

    // Each line's own versions are counted against the main line — the
    // remote's default, held locally — the same line the detail's route is
    // drawn against, so the two never disagree. Without one there is no
    // count: "not on the active line" would be a different question with the
    // same words.
    let default_names = default_branch_names(&path)?;
    let mut main_line = None;
    for name in &default_names {
        let main_ref = format!("refs/heads/{name}");
        if run_git(&path, &["show-ref", "--verify", "--quiet", &main_ref])?
            .status
            .success()
        {
            main_line = Some((name.clone(), main_ref));
            break;
        }
    }
    let main_ref = main_line.as_ref().map(|(_, reference)| reference.as_str());
    let (parsed, has_batched_metadata) =
        read_version_line_refs(&path, main_ref.or(current_commit.as_deref()))?;
    let worktrees = if has_batched_metadata {
        Vec::new()
    } else {
        list_worktrees(&path).unwrap_or_default()
    };
    let unreadable_count = parsed.unreadable_count;
    let mut raw_lines = parsed.lines;
    // Counts only what is actually representable; the skipped records are
    // reported separately rather than being folded into a total the list
    // cannot account for.
    let total_count = raw_lines.len();
    let is_truncated = total_count > VERSION_LINE_LIST_CAP;
    raw_lines.truncate(VERSION_LINE_LIST_CAP);

    let reaching_refs = reaching_refs_by_commit(&path)?;
    let mut unique_counts_by_tip = std::collections::HashMap::new();
    let mut lines = Vec::with_capacity(raw_lines.len());
    for raw in raw_lines {
        let is_active = branch.as_deref() == Some(raw.name.as_str());
        let is_default = default_names.contains(&raw.name);
        let worktree_path = if is_active {
            None
        } else if has_batched_metadata {
            raw.worktree_path
                .as_deref()
                .map(|worktree| display_path(PathBuf::from(worktree)))
        } else {
            worktrees
                .iter()
                .find(|worktree| worktree.branch.as_deref() == Some(raw.name.as_str()))
                .map(|worktree| display_path(PathBuf::from(&worktree.path)))
        };
        let own_ref = format!("refs/heads/{}", raw.name);
        let is_retained_elsewhere = reaching_refs
            .get(&raw.commit)
            .map(|references| references.iter().any(|reference| reference != &own_ref))
            .unwrap_or(false);
        let is_main_line = main_line
            .as_ref()
            .is_some_and(|(name, _)| name == &raw.name);
        let unique_commit_count = if main_ref.is_none() || is_main_line {
            None
        } else if has_batched_metadata {
            raw.unique_commit_count
        } else {
            *unique_counts_by_tip
                .entry(raw.commit.clone())
                .or_insert_with(|| branch_unique_commit_count(&path, main_ref, &raw.commit))
        };
        // Ahead/behind is only meaningful relative to a configured upstream;
        // an empty `upstream_track` on a line with no upstream must not read
        // as "0 ahead, 0 behind" (fully in sync), which is a different fact.
        let track = raw
            .upstream
            .is_some()
            .then(|| parse_upstream_track(&raw.upstream_track));
        lines.push(VersionLine {
            name: raw.name,
            tip: VersionLineTip {
                commit: raw.commit,
                short_commit: raw.short_commit,
                subject: raw.subject,
                committed_at: raw.committed_at,
            },
            is_active,
            upstream: raw.upstream,
            is_retained_elsewhere,
            unique_commit_count,
            worktree_path,
            upstream_ahead: track.as_ref().map(|track| track.ahead),
            upstream_behind: track.as_ref().map(|track| track.behind),
            upstream_gone: track.as_ref().is_some_and(|track| track.gone),
            is_default,
        });
    }

    Ok(VersionLinesSnapshot {
        branch,
        head_state,
        current_commit,
        lines,
        total_count,
        is_truncated,
        unreadable_count,
    })
}

// ---- One line's saved versions (read-only) ----
//
// The inventory above answers "which lines exist" for every branch at once,
// and deliberately stops at each line's tip: anything deeper would cost one
// Git process per branch on every refresh. This asks the deeper question for
// exactly one line — the one the user has selected — so the cost is two
// processes per selection rather than two per branch.

/// How many recent versions one call reports. The detail panel shows the tip
/// in full and the ones before it as a list, then hands the rest to History; a
/// longer list here would be paging, which is History's job and not this
/// screen's. Four left that list three rows long under a panel with room for
/// twice that, which is a preview too short to be worth the section.
pub(crate) const VERSION_LINE_HISTORY_LIMIT: usize = 8;

/// `%s` is the subject — the first line of the message by definition — so a
/// record can be newline-delimited with NUL between its fields, the same
/// shape `parse_version_line_refs` reads.
const VERSION_LINE_HISTORY_FORMAT: &str = "%H%x00%h%x00%s%x00%an%x00%cI";

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLineVersion {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) subject: String,
    pub(crate) author_name: String,
    /// ISO 8601 (`%cI`), matching `VersionLineTip::committed_at`.
    pub(crate) committed_at: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLineHistory {
    pub(crate) name: String,
    /// Saved versions reachable from this line's tip. `None` in a shallow
    /// clone, where the history this machine holds is not the history that
    /// exists — a number that would be wrong is worse than no number.
    pub(crate) total_count: Option<u32>,
    pub(crate) versions: Vec<VersionLineVersion>,
    /// Whether the line has versions beyond the ones listed. Read from one
    /// extra record rather than from `total_count`, so it stays true when the
    /// count is unavailable.
    pub(crate) has_more: bool,
    /// Where this line left the project's main line, and how far each has
    /// moved since. `None` for the main line itself, for a project with no
    /// main line, in a shallow clone, and whenever Git cannot say — it is
    /// extra detail, and the rest of the answer stands without it.
    pub(crate) route: Option<VersionLineRoute>,
}

/// A line's route against the project's main line: the saved version where
/// the two parted and when, the versions each saved while apart, and — for a
/// line that has come back — the merge that brought it in and what the main
/// line has saved since. Every count comes with up to
/// `VERSION_LINE_ROUTE_VERSIONS` of the versions it counts, newest first, so a
/// drawn dot is a real saved version the reader can hover.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLineRoute {
    /// The main line, by its local name.
    pub(crate) base: String,
    pub(crate) fork_commit: String,
    /// ISO 8601 (`%cI`) of the version where the two parted.
    pub(crate) forked_at: String,
    /// Versions this line saved away from the main line — still away from it,
    /// or until it came back. Zero for a line whose versions were always the
    /// main line's own (created and never saved to, or fast-forwarded into it).
    pub(crate) own_count: u32,
    pub(crate) own_versions: Vec<VersionLineVersion>,
    /// Versions the main line saved after the parting: up to now, or, for a
    /// line that came back, up to the merge that brought it in.
    pub(crate) base_count: u32,
    pub(crate) base_versions: Vec<VersionLineVersion>,
    /// The merge by which this line's versions came back into the main line.
    pub(crate) merge: Option<VersionLineMerge>,
    /// What the line changes against the main line — from the parting to its
    /// tip, the way a pull request compares — or, for a line that came back,
    /// what it brought. `None` for a line that never left the main line, and
    /// when Git cannot say.
    pub(crate) changes: Option<LineChanges>,
}

/// The files a line changes since it parted from the main line, and by how
/// much. The totals cover every file; `files` is the ones that change most,
/// at most `MAX_LINE_CHANGE_FILES`.
#[derive(serde::Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LineChanges {
    pub(crate) files_changed: u32,
    pub(crate) additions: u32,
    pub(crate) deletions: u32,
    pub(crate) files: Vec<ChangedFile>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangedFile {
    pub(crate) path: String,
    pub(crate) status: ChangedFileStatus,
    /// `None` for a binary file, which has no lines to count.
    pub(crate) additions: Option<u32>,
    pub(crate) deletions: Option<u32>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ChangedFileStatus {
    Added,
    Deleted,
    Modified,
    Renamed,
}

/// How many of a line's changed files come with the route: more than any
/// panel shows, few enough that the answer stays small.
pub(crate) const MAX_LINE_CHANGE_FILES: usize = 40;
const MAX_LINE_CHANGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionLineMerge {
    /// How the line's work came back: its own versions, by a merge; or copies
    /// of them, squashed into one version or rebased one by one — in which
    /// case the line's own versions still exist only on the line.
    pub(crate) kind: MergeKind,
    /// The main line's version that brought the work in: the merge, the
    /// squashed copy, or the newest of the rebased copies.
    pub(crate) commit: String,
    /// ISO 8601 (`%cI`) of that version.
    pub(crate) merged_at: String,
    /// Versions the main line saved after the merge, and the newest of them.
    pub(crate) after_count: u32,
    pub(crate) after_versions: Vec<VersionLineVersion>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MergeKind {
    Merge,
    Squash,
    Rebase,
}

/// How much of the main line's history, as patches, the copy check reads
/// before giving up: past this the line is too far behind for "is its work
/// already there" to be worth the read, and the route says only what it knows.
const MAX_COPY_CHECK_COMMITS: usize = 1000;
const MAX_COPY_CHECK_BYTES: usize = 32 * 1024 * 1024;

/// How many of a lane's versions come with the route: the drawing shows at
/// most this many dots a lane, each one a real version.
pub(crate) const VERSION_LINE_ROUTE_VERSIONS: usize = 8;

/// The first-parent walk that finds the merge is capped: a main line whose
/// history since this line's tip outgrows it is too far on to draw the return
/// anyway, and the route then says only that the work is on the main line.
const MAX_ROUTE_WALK_BYTES: usize = 4 * 1024 * 1024;

/// The main line is the remote's default (`default_branch_names`), and only a
/// local line of that name — a route is drawn between two lines this project
/// holds. Only ever for the one line the reader selected, cached with the rest
/// of its history read, and as few Git processes deep as the questions allow:
/// the ones that do not depend on each other run side by side (`in_parallel`),
/// because on Windows it is the process launches, not the walks, that the
/// reader waits for.
fn read_line_route(
    path: &str,
    name: &str,
    branch_ref: &str,
    tip: &str,
) -> Result<Option<VersionLineRoute>, AppError> {
    let defaults = default_branch_names(path)?;
    // The main line has no route: every other line is measured against it.
    if defaults.iter().any(|default| default == name) {
        return Ok(None);
    }
    for base in defaults {
        let base_ref = format!("refs/heads/{base}");
        // Fails both for a main line this project does not hold locally and
        // for two lines with no saved version in common: neither has a route.
        let Some(merge_base) = rev_parse_commit(path, &["merge-base", &base_ref, branch_ref])?
        else {
            continue;
        };
        if merge_base == tip {
            return read_returned_route(path, base, &base_ref, branch_ref, tip);
        }
        // Still away from the main line: the two sides of the parting — and,
        // asked alongside them, whether its work came back anyway as copies.
        let own_range = format!("{base_ref}..{branch_ref}");
        let base_range = format!("{branch_ref}..{base_ref}");
        let (((counts, forked_at), (own_versions, base_versions)), copy) = in_parallel(
            || {
                in_parallel(
                    || {
                        in_parallel(
                            || count_left_right(path, &format!("{base_ref}...{branch_ref}")),
                            || commit_date(path, &merge_base),
                        )
                    },
                    || {
                        in_parallel(
                            || route_versions(path, &own_range),
                            || route_versions(path, &base_range),
                        )
                    },
                )
            },
            // A failed check is a question unanswered, not an error: the
            // route then says what it knows — that the line is still away.
            || {
                in_parallel(
                    || detect_copy(path, &base_ref, branch_ref, &merge_base).unwrap_or(None),
                    || read_line_changes(path, &merge_base, branch_ref).unwrap_or(None),
                )
            },
        );
        let (copy, changes) = copy;
        let (
            Some((base_count, own_count)),
            Some(forked_at),
            Some(own_versions),
            Some(base_versions),
        ) = (counts?, forked_at?, own_versions?, base_versions?)
        else {
            return Ok(None);
        };
        let merge = match copy {
            Some((kind, commit)) => read_copy_return(path, &base_ref, branch_ref, kind, commit)?,
            None => None,
        };
        let (base_count, base_versions, merge) = match merge {
            Some((before_count, before_versions, merge)) => {
                (before_count, before_versions, Some(merge))
            }
            None => (base_count, base_versions, None),
        };
        return Ok(Some(VersionLineRoute {
            base,
            fork_commit: merge_base,
            forked_at,
            own_count,
            own_versions,
            base_count,
            base_versions,
            merge,
            changes,
        }));
    }
    Ok(None)
}

/// A line whose every version is on the main line. Either it came back by a
/// merge — the first commit on the main line's first-parent chain that
/// descends from the tip, when the tip is not on that chain itself — and the
/// route is its excursion: where it left, what it saved, where it came back.
/// Or its versions were always the main line's own (fast-forwarded into it, or
/// never saved to), and the route is a mark on the main line at its tip.
fn read_returned_route(
    path: &str,
    base: String,
    base_ref: &str,
    branch_ref: &str,
    tip: &str,
) -> Result<Option<VersionLineRoute>, AppError> {
    let walk = run_git_capped(
        path,
        &[
            "rev-list",
            "--first-parent",
            "--ancestry-path",
            &format!("{branch_ref}..{base_ref}"),
            "--",
        ],
        MAX_ROUTE_WALK_BYTES,
    )?;
    let merge = (walk.status.success() && !walk.limit_exceeded)
        .then(|| {
            String::from_utf8_lossy(&walk.stdout)
                .lines()
                .map(str::trim)
                .rfind(|line| is_object_id(line))
                .map(str::to_string)
        })
        .flatten();

    if let Some(merge) = merge {
        let first_parent = format!("{merge}^1");
        let (fast_forwarded, fork) = in_parallel(
            || {
                run_git(
                    path,
                    &["merge-base", "--is-ancestor", branch_ref, &first_parent],
                )
            },
            || rev_parse_commit(path, &["merge-base", &first_parent, branch_ref]),
        );
        if !fast_forwarded?.status.success() {
            let Some(fork) = fork? else {
                return Ok(None);
            };
            let own_range = format!("{first_parent}..{branch_ref}");
            let base_range = format!("{branch_ref}..{first_parent}");
            let after_range = format!("{merge}..{base_ref}");
            let (
                (counts, (dates, changes)),
                ((own_versions, base_versions), (after_count, after_versions)),
            ) = in_parallel(
                || {
                    in_parallel(
                        || count_left_right(path, &format!("{first_parent}...{branch_ref}")),
                        || {
                            in_parallel(
                                || commit_dates(path, &[&fork, &merge]),
                                // What it brought: the line's own change
                                // from the parting to its tip.
                                || read_line_changes(path, &fork, branch_ref).unwrap_or(None),
                            )
                        },
                    )
                },
                || {
                    in_parallel(
                        || {
                            in_parallel(
                                || route_versions(path, &own_range),
                                || route_versions(path, &base_range),
                            )
                        },
                        || {
                            in_parallel(
                                || count_range(path, &after_range),
                                || route_versions(path, &after_range),
                            )
                        },
                    )
                },
            );
            let (
                Some((base_count, own_count)),
                Some([forked_at, merged_at]),
                Some(own_versions),
                Some(base_versions),
                Some(after_count),
                Some(after_versions),
            ) = (
                counts?,
                dates?.and_then(|dates| <[String; 2]>::try_from(dates).ok()),
                own_versions?,
                base_versions?,
                after_count?,
                after_versions?,
            )
            else {
                return Ok(None);
            };
            return Ok(Some(VersionLineRoute {
                base,
                fork_commit: fork,
                forked_at,
                own_count,
                own_versions,
                base_count,
                base_versions,
                merge: Some(VersionLineMerge {
                    kind: MergeKind::Merge,
                    commit: merge,
                    merged_at,
                    after_count,
                    after_versions,
                }),
                changes,
            }));
        }
    }

    // On the main line's own history: a mark at the tip, and what the main
    // line saved after it.
    let after_range = format!("{branch_ref}..{base_ref}");
    let (forked_at, (base_count, base_versions)) = in_parallel(
        || commit_date(path, tip),
        || {
            in_parallel(
                || count_range(path, &after_range),
                || route_versions(path, &after_range),
            )
        },
    );
    let (Some(forked_at), Some(base_count), Some(base_versions)) =
        (forked_at?, base_count?, base_versions?)
    else {
        return Ok(None);
    };
    Ok(Some(VersionLineRoute {
        base,
        fork_commit: tip.to_string(),
        forked_at,
        own_count: 0,
        own_versions: Vec::new(),
        base_count,
        base_versions,
        merge: None,
        changes: None,
    }))
}

/// Whether a line still away from the main line has come back anyway, as
/// copies of its versions: squashed into one version on the main line (its
/// whole change since the parting is one of the main line's changes since),
/// or rebased onto it one by one (each of its versions' changes is one of
/// them). Compared by `git patch-id --stable` — the change, not the commit —
/// and read only: nothing is written to the repository to ask it. Returns
/// how, and the main line's version that brought the work in (the newest of
/// the copies, for a rebase).
fn detect_copy(
    path: &str,
    base_ref: &str,
    branch_ref: &str,
    fork: &str,
) -> Result<Option<(MergeKind, String)>, AppError> {
    let max_count = format!("--max-count={MAX_COPY_CHECK_COMMITS}");
    let base_log_range = format!("{fork}..{base_ref}");
    let own_log_range = format!("{base_ref}..{branch_ref}");
    let (base_patches, (whole_change, own_patches)) = in_parallel(
        || {
            run_git_capped(
                path,
                &[
                    "log",
                    "-p",
                    "--no-merges",
                    "--no-color",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--format=commit %H",
                    &max_count,
                    &base_log_range,
                    "--",
                ],
                MAX_COPY_CHECK_BYTES,
            )
        },
        || {
            in_parallel(
                || {
                    run_git_capped(
                        path,
                        &[
                            "diff",
                            "--no-color",
                            "--no-ext-diff",
                            "--no-textconv",
                            fork,
                            branch_ref,
                            "--",
                        ],
                        MAX_COPY_CHECK_BYTES,
                    )
                },
                || {
                    run_git_capped(
                        path,
                        &[
                            "log",
                            "-p",
                            "--no-merges",
                            "--no-color",
                            "--no-ext-diff",
                            "--no-textconv",
                            "--format=commit %H",
                            &max_count,
                            &own_log_range,
                            "--",
                        ],
                        MAX_COPY_CHECK_BYTES,
                    )
                },
            )
        },
    );
    let (base_patches, whole_change, own_patches) = (base_patches?, whole_change?, own_patches?);
    let complete = |output: &crate::git_command::CappedOutput| {
        output.status.success() && !output.limit_exceeded
    };
    if !complete(&base_patches) || !complete(&whole_change) || base_patches.stdout.is_empty() {
        return Ok(None);
    }

    // The main line's changes since the parting, newest first: the first
    // commit to carry a change is the one that brought it in.
    let Some(base_ids) = patch_ids(path, &base_patches.stdout)? else {
        return Ok(None);
    };
    let find = |id: &str| {
        base_ids
            .iter()
            .find(|(patch, _)| patch == id)
            .map(|(_, commit)| commit.clone())
    };

    if let Some(whole) =
        patch_ids(path, &whole_change.stdout)?.and_then(|ids| ids.into_iter().next())
    {
        if let Some(commit) = find(&whole.0) {
            return Ok(Some((MergeKind::Squash, commit)));
        }
    }

    if !complete(&own_patches) {
        return Ok(None);
    }
    let Some(own_ids) = patch_ids(path, &own_patches.stdout)? else {
        return Ok(None);
    };
    if own_ids.is_empty() {
        return Ok(None);
    }
    // Every one of the line's versions has its copy on the main line: the
    // newest of those copies is where the work came back.
    let mut newest: Option<usize> = None;
    for (patch, _) in &own_ids {
        let Some(index) = base_ids
            .iter()
            .position(|(base_patch, _)| base_patch == patch)
        else {
            return Ok(None);
        };
        newest = Some(newest.map_or(index, |current| current.min(index)));
    }
    Ok(newest.map(|index| (MergeKind::Rebase, base_ids[index].1.clone())))
}

/// `git patch-id --stable` over a stream of patches: one `(patch id, commit)`
/// per change, in the stream's order. A bare diff has no commit, and Git names
/// it all zeros.
fn patch_ids(path: &str, patches: &[u8]) -> Result<Option<Vec<(String, String)>>, AppError> {
    if patches.is_empty() {
        return Ok(Some(Vec::new()));
    }
    let output = run_git_with_input_capped(
        path,
        &["patch-id", "--stable"],
        patches,
        MAX_COPY_CHECK_BYTES,
    )?;
    if !output.status.success() || output.limit_exceeded {
        return Ok(None);
    }
    Ok(Some(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| {
                let (patch, commit) = line.trim().split_once(' ')?;
                (is_object_id(patch) && is_object_id(commit))
                    .then(|| (patch.to_string(), commit.to_string()))
            })
            .collect(),
    ))
}

/// The main line around the version that brought a line's copied work in:
/// what it saved between the parting and that version, and after it.
fn read_copy_return(
    path: &str,
    base_ref: &str,
    branch_ref: &str,
    kind: MergeKind,
    commit: String,
) -> Result<Option<(u32, Vec<VersionLineVersion>, VersionLineMerge)>, AppError> {
    let before_range = format!("{branch_ref}..{commit}^");
    let after_range = format!("{commit}..{base_ref}");
    let ((before_count, before_versions), ((after_count, after_versions), merged_at)) = in_parallel(
        || {
            in_parallel(
                || count_range(path, &before_range),
                || route_versions(path, &before_range),
            )
        },
        || {
            in_parallel(
                || {
                    in_parallel(
                        || count_range(path, &after_range),
                        || route_versions(path, &after_range),
                    )
                },
                || commit_date(path, &commit),
            )
        },
    );
    let (
        Some(before_count),
        Some(before_versions),
        Some(after_count),
        Some(after_versions),
        Some(merged_at),
    ) = (
        before_count?,
        before_versions?,
        after_count?,
        after_versions?,
        merged_at?,
    )
    else {
        return Ok(None);
    };
    Ok(Some((
        before_count,
        before_versions,
        VersionLineMerge {
            kind,
            commit,
            merged_at,
            after_count,
            after_versions,
        },
    )))
}

/// What a line changes between `from` and `to`: `--numstat` for the counts,
/// `--name-status` for what happened to each file, asked side by side. Renames
/// are followed, so a moved file is one change and not a deletion and an
/// addition. Read only; `None` when either answer is missing or too large.
fn read_line_changes(path: &str, from: &str, to: &str) -> Result<Option<LineChanges>, AppError> {
    let (numstat, statuses) = in_parallel(
        || {
            run_git_capped(
                path,
                &[
                    "diff",
                    "--numstat",
                    "-z",
                    "-M",
                    "--no-color",
                    "--no-ext-diff",
                    "--no-textconv",
                    from,
                    to,
                    "--",
                ],
                MAX_LINE_CHANGE_BYTES,
            )
        },
        || {
            run_git_capped(
                path,
                &[
                    "diff",
                    "--name-status",
                    "-z",
                    "-M",
                    "--no-color",
                    "--no-ext-diff",
                    from,
                    to,
                    "--",
                ],
                MAX_LINE_CHANGE_BYTES,
            )
        },
    );
    let (numstat, statuses) = (numstat?, statuses?);
    let complete = |output: &crate::git_command::CappedOutput| {
        output.status.success() && !output.limit_exceeded
    };
    if !complete(&numstat) || !complete(&statuses) {
        return Ok(None);
    }
    Ok(Some(parse_line_changes(
        &numstat.stdout,
        &statuses.stdout,
        MAX_LINE_CHANGE_FILES,
    )))
}

/// Joins `git diff --numstat -z` and `--name-status -z` into one list,
/// largest change first. A path that is not valid UTF-8 is shown lossily —
/// it names a file in a summary, and nothing addresses it.
pub(crate) fn parse_line_changes(numstat: &[u8], statuses: &[u8], limit: usize) -> LineChanges {
    let text = |bytes: &[u8]| String::from_utf8_lossy(bytes).into_owned();

    // `--name-status -z`: `M\0path\0`, or `R100\0old\0new\0` for a rename.
    let mut status_of = std::collections::HashMap::new();
    let mut fields = statuses
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    while let Some(code) = fields.next() {
        let status = match code.first() {
            Some(b'A') => ChangedFileStatus::Added,
            Some(b'D') => ChangedFileStatus::Deleted,
            Some(b'R') | Some(b'C') => ChangedFileStatus::Renamed,
            _ => ChangedFileStatus::Modified,
        };
        if matches!(code.first(), Some(b'R') | Some(b'C')) {
            let _old = fields.next();
        }
        if let Some(path) = fields.next() {
            status_of.insert(text(path), status);
        }
    }

    // `--numstat -z`: `added\tdeleted\tpath\0`, or, for a rename,
    // `added\tdeleted\t\0old\0new\0`; `-` counts for a binary file.
    let mut files = Vec::new();
    let mut records = numstat.split(|byte| *byte == 0);
    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(3, |byte| *byte == b'\t');
        let (Some(added), Some(deleted), Some(rest)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let path = if rest.is_empty() {
            let _old = records.next();
            match records.next() {
                Some(new) => text(new),
                None => continue,
            }
        } else {
            text(rest)
        };
        let count = |value: &[u8]| {
            std::str::from_utf8(value)
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
        };
        files.push(ChangedFile {
            status: status_of
                .get(&path)
                .copied()
                .unwrap_or(ChangedFileStatus::Modified),
            path,
            additions: count(added),
            deletions: count(deleted),
        });
    }

    let mut changes = LineChanges {
        files_changed: u32::try_from(files.len()).unwrap_or(u32::MAX),
        additions: files.iter().filter_map(|file| file.additions).sum(),
        deletions: files.iter().filter_map(|file| file.deletions).sum(),
        files: Vec::new(),
    };
    let churn = |file: &ChangedFile| file.additions.unwrap_or(0) + file.deletions.unwrap_or(0);
    files.sort_by(|left, right| {
        churn(right)
            .cmp(&churn(left))
            .then_with(|| left.path.cmp(&right.path))
    });
    files.truncate(limit);
    changes.files = files;
    changes
}

/// Runs `second` on a scoped worker thread while `first` runs here, and
/// returns both. The worker carries the running command's policy frame
/// (`application::inherit_command`), so its Git processes run under the same
/// policy and cancellation; it joins before this returns, so the frame never
/// outlives the command. Read-only questions only — nothing that mutates may
/// race another process.
fn in_parallel<A, B>(first: impl FnOnce() -> A, second: impl FnOnce() -> B + Send) -> (A, B)
where
    B: Send,
{
    let inherited = application::inherit_command();
    std::thread::scope(|scope| {
        let worker = scope.spawn(move || {
            let _frame = inherited.map(application::InheritedCommand::enter);
            second()
        });
        let first = first();
        let second = worker
            .join()
            .unwrap_or_else(|panic| std::panic::resume_unwind(panic));
        (first, second)
    })
}

/// A command that prints one commit id, or `None` when it fails or prints
/// something else.
fn rev_parse_commit(path: &str, args: &[&str]) -> Result<Option<String>, AppError> {
    let output = run_git(path, args)?;
    let commit = git_stdout(&output);
    Ok((output.status.success() && is_object_id(&commit)).then_some(commit))
}

fn commit_date(path: &str, commit: &str) -> Result<Option<String>, AppError> {
    let output = run_git(path, &["show", "-s", "--format=%cI", commit, "--"])?;
    Ok(output.status.success().then(|| git_stdout(&output)))
}

/// The commit dates of several commits in one process, in the order asked.
fn commit_dates(path: &str, commits: &[&str]) -> Result<Option<Vec<String>>, AppError> {
    let mut args = vec!["show", "-s", "--format=%cI"];
    args.extend_from_slice(commits);
    args.push("--");
    let output = run_git(path, &args)?;
    Ok(output
        .status
        .success()
        .then(|| {
            git_stdout(&output)
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|dates| dates.len() == commits.len()))
}

fn count_range(path: &str, range: &str) -> Result<Option<u32>, AppError> {
    let output = run_git(path, &["rev-list", "--count", range, "--"])?;
    Ok(output
        .status
        .success()
        .then(|| git_stdout(&output).parse().ok())
        .flatten())
}

fn count_left_right(path: &str, range: &str) -> Result<Option<(u32, u32)>, AppError> {
    let output = run_git(path, &["rev-list", "--left-right", "--count", range, "--"])?;
    Ok(output
        .status
        .success()
        .then(|| parse_left_right_count(&git_stdout(&output)))
        .flatten())
}

/// The newest versions in `range`, in the shape the history read lists them.
fn route_versions(path: &str, range: &str) -> Result<Option<Vec<VersionLineVersion>>, AppError> {
    let max_count = format!("--max-count={VERSION_LINE_ROUTE_VERSIONS}");
    let format = format!("--format={VERSION_LINE_HISTORY_FORMAT}");
    let output = run_git(
        path,
        &["log", &max_count, &format, "--no-color", range, "--"],
    )?;
    Ok(output
        .status
        .success()
        .then(|| parse_version_line_history(&output.stdout, VERSION_LINE_ROUTE_VERSIONS).0))
}

fn is_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// `rev-list --left-right --count A...B` prints the two sides separated by
/// whitespace: versions only on `A`, then versions only on `B`.
pub(crate) fn parse_left_right_count(text: &str) -> Option<(u32, u32)> {
    let mut parts = text.split_whitespace();
    let left = parts.next()?.parse().ok()?;
    let right = parts.next()?.parse().ok()?;
    parts.next().is_none().then_some((left, right))
}

/// Author names and subjects are bytes, and unlike a ref name nothing here is
/// used to address anything: the commit id beside them is hex. So a record
/// that is not valid UTF-8 is decoded lossily and still shown, rather than
/// being dropped the way an unrepresentable *branch name* has to be.
pub(crate) fn parse_version_line_history(
    bytes: &[u8],
    limit: usize,
) -> (Vec<VersionLineVersion>, bool) {
    let mut versions = Vec::new();
    let mut has_more = false;
    for line in bytes.split(|byte| *byte == b'\n') {
        if line.is_empty() {
            continue;
        }
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let fields = line.split(|byte| *byte == 0).collect::<Vec<_>>();
        if fields.len() < 2 {
            continue;
        }
        if versions.len() == limit {
            has_more = true;
            break;
        }
        let text = |index: usize| -> String {
            fields
                .get(index)
                .map(|field| String::from_utf8_lossy(field).into_owned())
                .unwrap_or_default()
        };
        versions.push(VersionLineVersion {
            commit: text(0),
            short_commit: text(1),
            subject: text(2),
            author_name: text(3),
            committed_at: text(4),
        });
    }
    (versions, has_more)
}

pub(crate) fn get_version_line_history(
    path: String,
    name: String,
) -> Result<VersionLineHistory, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "get_version_line_history", None)?;
    validate_branch_ref_name(&path, &name)?;
    let branch_ref = format!("refs/heads/{name}");
    // The fully qualified ref: a bare name could resolve to a tag or a
    // remote-tracking branch of the same name, and this screen is only ever
    // describing a local line. One process answers both whether it exists and
    // which version it stands on — the route needs the second.
    let Some(tip) = rev_parse_commit(
        &path,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{branch_ref}^{{commit}}"),
        ],
    )?
    else {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    };
    let shallow = run_git(&path, &["rev-parse", "--is-shallow-repository"])?;
    let is_shallow = shallow.status.success() && git_stdout(&shallow) == "true";

    // The versions and the route are separate questions, so they are asked
    // side by side: the route is most of this read's Git processes, and the
    // total count below can walk the whole history.
    let (listed, route) = in_parallel(
        || read_listed_versions(&path, &branch_ref, is_shallow),
        || {
            // A shallow clone's merge base is where this machine's history
            // stops, not where the lines parted; a failed read is extra detail
            // missing, not an error for the whole answer.
            if is_shallow {
                None
            } else {
                read_line_route(&path, &name, &branch_ref, &tip).unwrap_or(None)
            }
        },
    );
    let (versions, has_more, total_count) = listed?;

    Ok(VersionLineHistory {
        name,
        total_count,
        versions,
        has_more,
        route,
    })
}

/// The newest versions on a line, whether there are more, and how many there
/// are in all — `None` in a shallow clone.
fn read_listed_versions(
    path: &str,
    branch_ref: &str,
    is_shallow: bool,
) -> Result<(Vec<VersionLineVersion>, bool, Option<u32>), AppError> {
    // One more than the panel shows, so `has_more` is answered by the same
    // walk instead of a second one.
    let max_count = format!("--max-count={}", VERSION_LINE_HISTORY_LIMIT + 1);
    let format = format!("--format={VERSION_LINE_HISTORY_FORMAT}");
    let log = run_git(
        path,
        &["log", &max_count, &format, "--no-color", branch_ref, "--"],
    )?;
    if !log.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this version line's saved versions.",
        )
        .with_detail(truncate_detail(&String::from_utf8_lossy(&log.stderr))));
    }
    let (versions, has_more) = parse_version_line_history(&log.stdout, VERSION_LINE_HISTORY_LIMIT);

    let total_count = if is_shallow {
        None
    } else {
        let counted = run_git(path, &["rev-list", "--count", branch_ref, "--"])?;
        counted
            .status
            .success()
            .then(|| git_stdout(&counted).parse().ok())
            .flatten()
    };
    Ok((versions, has_more, total_count))
}

// ---- Create a version line ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateVersionLinePlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) name: String,
    pub(crate) head_state: HeadState,
    pub(crate) starting_commit: Option<String>,
    /// Whether `starting_commit` is a saved version the user picked rather than
    /// wherever the project happens to be standing. The preview says different
    /// things about the two, and only the first can be true while `HEAD` is
    /// somewhere else entirely.
    pub(crate) from_saved_version: bool,
    pub(crate) will_switch: bool,
    pub(crate) has_unsaved_work: bool,
}

pub(crate) struct ValidatedCreate {
    pub(crate) name: String,
    pub(crate) head_state: HeadState,
    pub(crate) starting_commit: Option<String>,
    pub(crate) from_saved_version: bool,
    pub(crate) will_switch: bool,
    pub(crate) has_unsaved_work: bool,
    pub(crate) state_token: String,
}

/// A starting point chosen from History, resolved to the exact commit it names.
///
/// Only a full object id is accepted, and it is verified to be a commit that
/// exists: a revision expression would let a name, a tag, or `@{upstream}` in
/// as a starting point, and the interface only ever sends what a saved version
/// row already holds.
fn resolve_start_commit(path: &str, value: &str) -> Result<String, AppError> {
    let shaped = (value.len() == 40 || value.len() == 64)
        && value.bytes().all(|byte| byte.is_ascii_hexdigit());
    if !shaped {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        )
        .with_remediation("Choose a saved version from History and try again."));
    }
    let revision = format!("{value}^{{commit}}");
    let output = run_git(path, &["rev-parse", "--verify", "--quiet", &revision])?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version isn't in this project any more.",
        )
        .with_remediation("Refresh History and choose a saved version that is still listed."));
    }
    Ok(git_stdout(&output))
}

pub(crate) fn validate_and_prepare_create(
    path: &str,
    name: &str,
    switch: bool,
    start_commit: Option<&str>,
) -> Result<ValidatedCreate, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let (head_state, head_sha) = resolve_head_state(path, branch.clone())?;

    // A chosen saved version is a commit of its own, so it answers the
    // question an unborn `HEAD` cannot: there is something to start from even
    // when the current line has nothing on it yet.
    let start_commit = start_commit
        .map(|value| resolve_start_commit(path, value))
        .transpose()?;
    if head_state == HeadState::Unborn && start_commit.is_none() {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "Save the first version before creating another version line.",
        )
        .with_remediation("Save a version, then create a new version line."));
    }

    validate_branch_ref_name(path, name)?;

    let existing = list_branch_names(path)?;
    if existing.iter().any(|existing_name| existing_name == name) {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameTaken,
            "A version line with this exact name already exists.",
        )
        .with_remediation("Choose a different name."));
    }
    if let Some(collision) = existing
        .iter()
        .find(|existing_name| existing_name.eq_ignore_ascii_case(name))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameCollides,
            format!(
                "\"{collision}\" already exists and only differs by letter case, which some file systems can't tell apart."
            ),
        )
        .with_remediation("Choose a name that isn't just a different case of an existing one."));
    }

    let status = read_working_tree_status(path.to_string())?;
    if status.counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try again."));
    }
    let has_unsaved_work = !status.is_clean;
    // A detached `HEAD` is recovered by switching onto the line being created
    // at the commit it is standing on — but only when that is where the line
    // starts. Creating a line at a saved version somewhere else is not a
    // recovery, and switching to it would move the working tree away from the
    // commit the reader was on without being asked.
    let from_saved_version = start_commit.is_some();
    let will_switch = switch || (head_state == HeadState::Detached && !from_saved_version);
    let starting_commit = start_commit.or(head_sha.clone());

    let mutable_state = create_version_line_state_fingerprint(path, &head_state, &status)?;
    let state_token = compute_version_line_state_token(
        head_sha.as_deref(),
        branch.as_deref(),
        &mutable_state,
        &format!(
            "create:{name}:{will_switch}:{}",
            starting_commit.as_deref().unwrap_or("")
        ),
    );

    Ok(ValidatedCreate {
        name: name.to_string(),
        head_state,
        starting_commit,
        from_saved_version,
        will_switch,
        has_unsaved_work,
        state_token,
    })
}

pub(crate) fn plan_create_version_line(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
) -> Result<CreateVersionLinePlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_create_version_line", None)?;
    let validated = validate_and_prepare_create(&path, &name, switch, start_commit.as_deref())?;
    let mut steps = vec![if validated.from_saved_version {
        format!(
            "Create the version line \"{}\" at the chosen saved version.",
            validated.name
        )
    } else {
        format!(
            "Create the version line \"{}\" at the current commit.",
            validated.name
        )
    }];
    if validated.will_switch {
        steps.push(format!("Switch this project to \"{}\".", validated.name));
    }
    let mut risks = Vec::new();
    if validated.has_unsaved_work {
        risks.push(
            "Unsaved files and prepared changes stay exactly as they are; future saved versions will belong to the new version line."
                .to_string(),
        );
    }
    if validated.head_state == HeadState::Detached && !validated.from_saved_version {
        risks.push(
            "This project isn't on a version line right now; creating one here keeps the current commit reachable by name."
                .to_string(),
        );
    }
    if validated.from_saved_version && !validated.will_switch {
        risks.push(
            "This project stays where it is; the new version line starts at the chosen saved version."
                .to_string(),
        );
    }
    let summary = if validated.will_switch {
        format!("Create \"{}\" and switch to it.", validated.name)
    } else {
        format!("Create \"{}\" without switching to it.", validated.name)
    };
    let requires_confirmation = validated.will_switch || validated.has_unsaved_work;
    Ok(CreateVersionLinePlan {
        operation_kind: OperationKind::LocalMutation,
        summary,
        steps,
        risks,
        recovery:
            "No files, saved versions, or other version lines are changed by creating this one."
                .to_string(),
        requires_confirmation,
        state_token: validated.state_token,
        name: validated.name,
        head_state: validated.head_state,
        starting_commit: validated.starting_commit,
        from_saved_version: validated.from_saved_version,
        will_switch: validated.will_switch,
        has_unsaved_work: validated.has_unsaved_work,
    })
}

pub(crate) fn classify_ref_mutation_failure(output: &Output, generic_message: &str) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("already exists") {
        AppError::new(
            AppErrorCode::VersionLineNameTaken,
            "That name is already used by another version line.",
        )
        .with_remediation("Choose a different name.")
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to create") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(AppErrorCode::GitCommandFailed, generic_message)
            .with_remediation("Check the project's Git state and try again.")
            .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn create_version_line(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "create_version_line", None)?;
    let validated = validate_and_prepare_create(&path, &name, switch, start_commit.as_deref())?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }

    let starting = validated.starting_commit.as_deref().unwrap_or("HEAD");
    let output = if validated.will_switch {
        // `switch -c <name> <start>` is one operation: the line is created at
        // the chosen version and checked out, or neither happens.
        run_git(&path, &["switch", "-c", &validated.name, starting])?
    } else {
        run_git(&path, &["branch", "--", &validated.name, starting])?
    };
    if !output.status.success() {
        return Err(classify_ref_mutation_failure(
            &output,
            "Git couldn't create this version line.",
        ));
    }
    get_version_lines(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git_command::{base_git_command, git_command, in_test_frame, test_git};
    use crate::publish_domain::{plan_publish, publish};
    use std::{fs, path::Path};

    fn unique_temp_dir(label: &str) -> String {
        let mut dir = std::env::temp_dir();
        dir.push(format!("gitodile-test-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir for test");
        dir.to_string_lossy().to_string()
    }

    fn git_init(path: &str) {
        let status = git_command(path)
            .args(["init", "-q"])
            .status()
            .expect("run git init");
        assert!(status.success(), "git init should succeed");
    }

    fn write_file(repo_path: &str, name: &str, contents: &str) {
        fs::write(Path::new(repo_path).join(name), contents).expect("write test file");
    }

    fn git_add(path: &str, file: &str) {
        let status = git_command(path)
            .args(["add", "--", file])
            .status()
            .expect("run git add");
        assert!(status.success(), "git add should succeed");
    }

    fn git_add_all(path: &str) {
        let status = git_command(path)
            .args(["add", "-A"])
            .status()
            .expect("run git add -A");
        assert!(status.success(), "git add -A should succeed");
    }

    fn git_commit(path: &str, message: &str) {
        let status = git_command(path)
            .args([
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
                "commit",
                "-q",
                "-m",
                message,
            ])
            .status()
            .expect("run git commit");
        assert!(status.success(), "git commit should succeed");
    }

    fn current_branch(path: &str) -> String {
        let output = git_command(path)
            .args(["symbolic-ref", "--short", "HEAD"])
            .output()
            .expect("read current branch");
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn init_bare_remote(path: &str) {
        let status = git_command(path)
            .args(["init", "--bare", "-q"])
            .status()
            .expect("run git init --bare");
        assert!(status.success(), "git init --bare should succeed");
    }

    fn wire_remote(repo_path: &str, remote_name: &str, remote_path: &str) {
        let status = git_command(repo_path)
            .args(["remote", "add", remote_name, remote_path])
            .status()
            .expect("run git remote add");
        assert!(status.success(), "git remote add should succeed");
    }

    fn published_repo_and_remote(label: &str) -> (String, String, String) {
        let repo = unique_temp_dir(&format!("publish-{label}"));
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);
        let remote = unique_temp_dir(&format!("publish-{label}-remote"));
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);
        let plan = plan_publish(repo.clone(), None, None).expect("first plan should succeed");
        publish(
            repo.clone(),
            plan.target.remote,
            plan.state_token,
            None,
            true,
        )
        .expect("first publish should succeed");
        (repo, remote, branch)
    }

    #[test]
    fn git_version_at_least_compares_numerically_not_lexically() {
        assert!(git_version_at_least("2.23.0", (2, 23, 0)));
        assert!(git_version_at_least("2.40.1", (2, 23, 0)));
        assert!(git_version_at_least("3.0.0", (2, 23, 0)));
        assert!(!git_version_at_least("2.9.0", (2, 23, 0)));
        assert!(!git_version_at_least("1.99.9", (2, 23, 0)));
        // A trailing platform suffix (as Git for Windows appends) must not
        // break parsing of the leading numeric triple.
        assert!(git_version_at_least("2.39.2.windows.1", (2, 23, 0)));
    }

    #[test]
    fn parse_worktree_list_porcelain_reports_each_block_and_its_branch() {
        let text = "worktree /repo/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo/linked\nHEAD def456\nbranch refs/heads/feature\n\nworktree /repo/detached\nHEAD 789abc\ndetached\n";
        let entries = parse_worktree_list_porcelain(text);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].path, "/repo/main");
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert_eq!(entries[1].path, "/repo/linked");
        assert_eq!(entries[1].branch.as_deref(), Some("feature"));
        assert_eq!(entries[2].path, "/repo/detached");
        assert_eq!(entries[2].branch, None);
    }

    #[test]
    fn parse_version_line_refs_reads_nul_delimited_fields() {
        let text = b"refs/heads/main\0abc123\0abc12\0First subject\x002024-01-01T00:00:00+00:00\0origin/main\nrefs/heads/feature/nested\0def456\0def45\0Nested line\x002024-02-02T00:00:00+00:00\0\n";
        let lines = parse_version_line_refs(text).lines;
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].name, "main");
        assert_eq!(lines[0].commit, "abc123");
        assert_eq!(lines[0].upstream.as_deref(), Some("origin/main"));
        // A nested (`feature/name`) ref name and an empty upstream field
        // must both survive without being mistaken for malformed input.
        assert_eq!(lines[1].name, "feature/nested");
        assert_eq!(lines[1].upstream, None);
    }

    #[test]
    fn parse_version_line_refs_reads_batched_counts_and_worktrees() {
        let text = b"refs/heads/feature\0def456\0def45\0Feature\x002024-02-02T00:00:00+00:00\0origin/feature\0[ahead 2, behind 1]\x003 7\0C:/repo-linked\n";
        let lines = parse_version_line_refs(text).lines;
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].upstream_track, "[ahead 2, behind 1]");
        assert_eq!(lines[0].unique_commit_count, Some(3));
        assert_eq!(lines[0].worktree_path.as_deref(), Some("C:/repo-linked"));
    }

    #[test]
    fn parse_version_line_history_reads_records_and_reports_the_overflow() {
        let text = b"aaa111\0aaa1\0First subject\0Ada Lovelace\x002024-01-01T00:00:00+00:00\nbbb222\0bbb2\0Second\0Ada Lovelace\x002024-01-02T00:00:00+00:00\n";
        let (versions, has_more) = parse_version_line_history(text, 4);
        assert_eq!(versions.len(), 2);
        assert!(!has_more);
        assert_eq!(versions[0].commit, "aaa111");
        assert_eq!(versions[0].short_commit, "aaa1");
        assert_eq!(versions[0].subject, "First subject");
        assert_eq!(versions[0].author_name, "Ada Lovelace");
        assert_eq!(versions[0].committed_at, "2024-01-01T00:00:00+00:00");

        // The walk asks for one more than it reports, and that extra record is
        // what says there is more rather than a second count.
        let (trimmed, overflowed) = parse_version_line_history(text, 1);
        assert_eq!(trimmed.len(), 1);
        assert!(overflowed);
    }

    #[test]
    fn parse_version_line_history_keeps_a_version_whose_metadata_is_not_utf8() {
        // Nothing here addresses anything — the commit id beside it is hex —
        // so an unrepresentable author is shown lossily rather than hiding a
        // saved version that genuinely exists.
        let text = b"aaa111\0aaa1\0Subject\0Ada \xff Lovelace\x002024-01-01T00:00:00+00:00\n";
        let (versions, _) = parse_version_line_history(text, 4);
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].commit, "aaa111");
        assert!(versions[0].author_name.starts_with("Ada "));
    }

    #[test]
    fn parse_line_changes_joins_counts_and_statuses_largest_first() {
        let numstat = b"3\t1\tsrc/a.rs\x0010\t0\tsrc/new.rs\x00-\t-\tlogo.png\x002\t2\t\x00old/b.rs\x00new/b.rs\x00";
        let statuses = b"M\x00src/a.rs\x00A\x00src/new.rs\x00M\x00logo.png\x00R090\x00old/b.rs\x00new/b.rs\x00";
        let changes = parse_line_changes(numstat, statuses, 3);
        assert_eq!(changes.files_changed, 4);
        assert_eq!(changes.additions, 15);
        assert_eq!(changes.deletions, 3);
        let files = changes
            .files
            .iter()
            .map(|file| (file.path.as_str(), file.status, file.additions))
            .collect::<Vec<_>>();
        assert_eq!(
            files,
            [
                ("src/new.rs", ChangedFileStatus::Added, Some(10)),
                ("new/b.rs", ChangedFileStatus::Renamed, Some(2)),
                ("src/a.rs", ChangedFileStatus::Modified, Some(3)),
            ]
        );
    }

    #[test]
    fn parse_left_right_count_reads_both_sides_and_nothing_else() {
        assert_eq!(parse_left_right_count("3\t5"), Some((3, 5)));
        assert_eq!(parse_left_right_count("0 0"), Some((0, 0)));
        assert_eq!(parse_left_right_count("3"), None);
        assert_eq!(parse_left_right_count("3 5 7"), None);
        assert_eq!(parse_left_right_count("x 5"), None);
    }

    #[test]
    fn get_version_line_history_draws_a_route_against_the_main_line_only() {
        let (repo, remote, main) = published_repo_and_remote("vl-route");
        // What a clone writes, and what makes `main` the project's main line.
        let status = git_command(&repo)
            .args(["remote", "set-head", "origin", &main])
            .status()
            .expect("run git remote set-head");
        assert!(status.success());

        let status = git_command(&repo)
            .args(["switch", "-q", "-c", "feature"])
            .status()
            .expect("create feature");
        assert!(status.success());
        write_and_commit(&repo, "b.txt", "one\n", "feature one");
        write_and_commit(&repo, "b.txt", "two\n", "feature two");
        let status = git_command(&repo)
            .args(["switch", "-q", &main])
            .status()
            .expect("switch back");
        assert!(status.success());
        write_and_commit(&repo, "c.txt", "main\n", "main moves on");

        let history = get_version_line_history(repo.clone(), "feature".to_string())
            .expect("history should read");
        let route = history.route.expect("a line off the main line has a route");
        assert_eq!(route.base, main);
        assert_eq!(route.own_count, 2);
        assert_eq!(route.base_count, 1);
        let first = git_command(&repo)
            .args(["rev-parse", &format!("{main}~1")])
            .output()
            .expect("read the fork");
        assert_eq!(
            route.fork_commit,
            String::from_utf8_lossy(&first.stdout).trim()
        );
        assert!(!route.forked_at.is_empty());
        // Each dot is a real version, newest first.
        let subjects = |versions: &[VersionLineVersion]| {
            versions
                .iter()
                .map(|version| version.subject.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            subjects(&route.own_versions),
            ["feature two", "feature one"]
        );
        assert_eq!(subjects(&route.base_versions), ["main moves on"]);
        assert!(route.merge.is_none());
        // What it changes against the main line: one file, two lines written.
        let changes = route.changes.expect("a line away from main has changes");
        assert_eq!(changes.files_changed, 1);
        assert_eq!(changes.files[0].path, "b.txt");
        assert_eq!(changes.files[0].status, ChangedFileStatus::Added);

        // The main line itself is what the others are measured against.
        let main_history =
            get_version_line_history(repo.clone(), main.clone()).expect("history should read");
        assert!(main_history.route.is_none());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_version_line_history_draws_the_way_back_of_a_merged_line() {
        let (repo, remote, main) = published_repo_and_remote("vl-route-merged");
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        run(&["remote", "set-head", "origin", &main]);
        run(&["switch", "-q", "-c", "feature"]);
        write_and_commit(&repo, "b.txt", "one\n", "feature one");
        write_and_commit(&repo, "b.txt", "two\n", "feature two");
        run(&["switch", "-q", &main]);
        write_and_commit(&repo, "c.txt", "main\n", "main before");
        run(&[
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "bring feature in",
            "feature",
        ]);
        write_and_commit(&repo, "d.txt", "after\n", "main after");

        let history = get_version_line_history(repo.clone(), "feature".to_string())
            .expect("history should read");
        let route = history.route.expect("a merged line has a route");
        assert_eq!(route.own_count, 2);
        assert_eq!(route.base_count, 1);
        assert_eq!(route.base_versions[0].subject, "main before");
        let merge = route.merge.expect("it came back by a merge");
        assert_eq!(merge.after_count, 1);
        assert_eq!(merge.after_versions[0].subject, "main after");
        let merged = git_command(&repo)
            .args(["rev-parse", &format!("{main}~1")])
            .output()
            .expect("read the merge");
        assert_eq!(merge.commit, String::from_utf8_lossy(&merged.stdout).trim());

        // Fast-forwarded into the main line, a line never left it: a mark.
        run(&["switch", "-q", "-c", "quick"]);
        write_and_commit(&repo, "e.txt", "quick\n", "quick fix");
        run(&["switch", "-q", &main]);
        run(&["merge", "-q", "--ff-only", "quick"]);
        let quick = get_version_line_history(repo.clone(), "quick".to_string())
            .expect("history should read")
            .route
            .expect("a line on the main line has a route");
        assert_eq!(quick.own_count, 0);
        assert!(quick.merge.is_none());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_version_line_history_sees_a_line_squashed_or_rebased_into_the_main_line() {
        let (repo, remote, main) = published_repo_and_remote("vl-route-copied");
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        let commit_as = |args: &[&str]| {
            let mut full = vec![
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
            ];
            full.extend_from_slice(args);
            run(&full);
        };
        run(&["remote", "set-head", "origin", &main]);

        // Squashed: two versions on the line, one copy of their whole change
        // on the main line, which then moves on.
        run(&["switch", "-q", "-c", "squashed"]);
        write_and_commit(&repo, "s.txt", "one\n", "squashed one");
        write_and_commit(&repo, "s.txt", "two\n", "squashed two");
        run(&["switch", "-q", &main]);
        write_and_commit(&repo, "m.txt", "main\n", "main meanwhile");
        commit_as(&["merge", "-q", "--squash", "squashed"]);
        commit_as(&["commit", "-q", "-m", "squashed in"]);
        write_and_commit(&repo, "n.txt", "after\n", "main after");

        let route = get_version_line_history(repo.clone(), "squashed".to_string())
            .expect("history should read")
            .route
            .expect("a line off the main line has a route");
        assert_eq!(route.own_count, 2);
        assert_eq!(route.base_count, 1);
        assert_eq!(route.base_versions[0].subject, "main meanwhile");
        let merge = route.merge.expect("its work came back as a copy");
        assert_eq!(merge.kind, MergeKind::Squash);
        assert_eq!(merge.after_count, 1);
        assert_eq!(merge.after_versions[0].subject, "main after");

        // Rebased: each version copied onto the main line one by one.
        run(&["switch", "-q", "-c", "rebased", &format!("{main}~3")]);
        write_and_commit(&repo, "r.txt", "one\n", "rebased one");
        write_and_commit(&repo, "r2.txt", "two\n", "rebased two");
        run(&["switch", "-q", &main]);
        commit_as(&["cherry-pick", "rebased~1", "rebased"]);
        let merge = get_version_line_history(repo.clone(), "rebased".to_string())
            .expect("history should read")
            .route
            .expect("a line off the main line has a route")
            .merge
            .expect("its work came back as copies");
        assert_eq!(merge.kind, MergeKind::Rebase);
        assert_eq!(merge.after_count, 0);

        // Still away: a change the main line does not have.
        run(&["switch", "-q", "-c", "away"]);
        write_and_commit(&repo, "a.txt", "away\n", "only here");
        run(&["switch", "-q", &main]);
        let away = get_version_line_history(repo.clone(), "away".to_string())
            .expect("history should read")
            .route
            .expect("a line off the main line has a route");
        assert!(away.merge.is_none());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn delete_version_line_keeps_a_recovery_point_for_a_line_squashed_into_main() {
        let (repo, remote, main) = published_repo_and_remote("vl-delete-squashed");
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        let commit_as = |args: &[&str]| {
            let mut full = vec![
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
            ];
            full.extend_from_slice(args);
            run(&full);
        };
        run(&["remote", "set-head", "origin", &main]);
        run(&["switch", "-q", "-c", "squashed"]);
        write_and_commit(&repo, "s.txt", "one\n", "squashed one");
        write_and_commit(&repo, "s.txt", "two\n", "squashed two");
        let tip = commit_at(&repo, "squashed");
        run(&["switch", "-q", &main]);
        commit_as(&["merge", "-q", "--squash", "squashed"]);
        commit_as(&["commit", "-q", "-m", "squashed in"]);

        // A line whose work is only on itself stays refused.
        run(&["switch", "-q", "-c", "unique"]);
        write_and_commit(&repo, "u.txt", "only\n", "only here");
        run(&["switch", "-q", &main]);
        let refused = plan_delete_version_line(repo.clone(), "unique".to_string())
            .expect_err("unique work is not deletable");
        assert_eq!(refused.code, AppErrorCode::VersionLineUniqueWork);

        // The squashed line is offered, with a recovery point in the plan.
        let plan = plan_delete_version_line(repo.clone(), "squashed".to_string())
            .expect("a squashed line can be deleted");
        let copy = plan
            .copied_into
            .clone()
            .expect("its work is on main as a copy");
        assert_eq!(copy.kind, MergeKind::Squash);
        assert_eq!(copy.base, main);
        assert!(plan.retained_by.is_empty());
        assert!(plan.recovery_point.is_some());

        let result = delete_version_line(
            repo.clone(),
            "squashed".to_string(),
            false,
            plan.state_token.clone(),
        )
        .expect("the delete should succeed");
        assert!(!result
            .snapshot
            .lines
            .iter()
            .any(|line| line.name == "squashed"));
        // The originals are kept, by a hidden ref that resolves to the old tip.
        let reference = result
            .recovery_reference
            .expect("a recovery point was kept");
        assert!(reference.starts_with("refs/gitodile/recovery/v1/delete-version-line/"));
        assert_eq!(commit_at(&repo, &reference), tip);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_version_lines_counts_each_lines_own_versions_against_the_main_line() {
        let (repo, remote, main) = published_repo_and_remote("vl-count-main");
        let status = git_command(&repo)
            .args(["remote", "set-head", "origin", &main])
            .status()
            .expect("run git remote set-head");
        assert!(status.success());
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        run(&["switch", "-q", "-c", "feature"]);
        write_and_commit(&repo, "b.txt", "one\n", "feature one");
        write_and_commit(&repo, "b.txt", "two\n", "feature two");
        run(&["switch", "-q", "-c", "feature-child"]);
        write_and_commit(&repo, "c.txt", "child\n", "child one");
        // Standing on `feature`: against the active line the child would have
        // one version of its own; against the main line it has three.
        run(&["switch", "-q", "feature"]);

        let snapshot = get_version_lines(repo.clone()).expect("discovery should succeed");
        let count = |name: &str| {
            snapshot
                .lines
                .iter()
                .find(|line| line.name == name)
                .expect("line listed")
                .unique_commit_count
        };
        assert_eq!(count("feature-child"), Some(3));
        // The active line is counted too, against the same main line.
        assert_eq!(count("feature"), Some(2));
        // The main line is what the others are counted against.
        assert_eq!(count(&main), None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_version_line_history_has_no_route_without_a_main_line() {
        let path = unique_temp_dir("vl-route-none");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "feature"])
            .status()
            .expect("run git branch feature");
        assert!(status.success());

        // No remote, so no main line — and nothing is drawn on a guess.
        let history = get_version_line_history(path.clone(), "feature".to_string())
            .expect("history should read");
        assert!(history.route.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn parse_upstream_track_reads_ahead_behind_and_gone() {
        assert!(matches!(
            parse_upstream_track(""),
            UpstreamTrack {
                ahead: 0,
                behind: 0,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[ahead 3]"),
            UpstreamTrack {
                ahead: 3,
                behind: 0,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[behind 2]"),
            UpstreamTrack {
                ahead: 0,
                behind: 2,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[ahead 2, behind 1]"),
            UpstreamTrack {
                ahead: 2,
                behind: 1,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[gone]"),
            UpstreamTrack {
                ahead: 0,
                behind: 0,
                gone: true
            }
        ));
    }

    #[test]
    fn parse_version_line_refs_ignores_a_malformed_record() {
        let text = b"not-a-ref-line-at-all\nrefs/heads/main\0abc\0ab\0subject\0date\0\n";
        let lines = parse_version_line_refs(text).lines;
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].name, "main");
    }

    #[test]
    fn parse_version_line_refs_skips_a_non_utf8_name_without_lossy_replacement() {
        // One unrepresentable name must not cost the user the rest of the
        // inventory, and must never be shown as a name that does not exist:
        // every mutation is keyed by the exact bytes.
        let bytes = b"refs/heads/feature-\xff\0abc\0ab\0subject\0date\0\nrefs/heads/main\0def\0de\0ok\0date\0\n";
        let parsed = parse_version_line_refs(bytes);
        assert_eq!(parsed.unreadable_count, 1);
        assert_eq!(parsed.lines.len(), 1);
        assert_eq!(parsed.lines[0].name, "main");
        assert!(
            !parsed
                .lines
                .iter()
                .any(|line| line.name.contains(char::REPLACEMENT_CHARACTER)),
            "a skipped name must never reappear as replacement characters"
        );
    }

    #[test]
    fn compute_version_line_state_token_is_stable_then_changes_with_status() {
        let first = compute_version_line_state_token(
            Some("abc"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        let same = compute_version_line_state_token(
            Some("abc"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        assert_eq!(first, same);

        let after_dirty = compute_version_line_state_token(
            Some("abc"),
            Some("main"),
            "clean:false|total:1|",
            "switch:main->feature@def",
        );
        assert_ne!(first, after_dirty);

        let after_head_moved = compute_version_line_state_token(
            Some("zzz"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        assert_ne!(first, after_head_moved);
    }

    fn write_and_commit(path: &str, name: &str, contents: &str, message: &str) {
        write_file(path, name, contents);
        git_add_all(path);
        git_commit(path, message);
    }

    #[test]
    fn get_version_lines_reports_active_and_other_lines_with_reachability() {
        let path = unique_temp_dir("vl-discovery");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let status = git_command(&path)
            .args(["branch", "feature"])
            .status()
            .expect("run git branch feature");
        assert!(status.success());

        let snapshot = get_version_lines(path.clone()).expect("discovery should succeed");
        assert_eq!(snapshot.branch, Some(current_branch(&path)));
        assert_eq!(snapshot.lines.len(), 2);
        let active = snapshot.lines.iter().find(|line| line.is_active).unwrap();
        assert_eq!(active.name, snapshot.branch.clone().unwrap());
        let feature = snapshot
            .lines
            .iter()
            .find(|line| line.name == "feature")
            .unwrap();
        // "feature" points at the very same commit as the active branch, so
        // it must be reported as already retained elsewhere.
        assert!(feature.is_retained_elsewhere);
        assert!(!feature.is_active);
        assert!(feature.worktree_path.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn get_version_lines_flags_a_branch_checked_out_in_a_linked_worktree() {
        let path = unique_temp_dir("vl-worktree");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let worktree = Path::new(&path).join("linked");
        let status = git_command(&path)
            .args(["worktree", "add", "-q", "-b", "linked-line"])
            .arg(&worktree)
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let snapshot = get_version_lines(path.clone()).expect("discovery should succeed");
        let linked = snapshot
            .lines
            .iter()
            .find(|line| line.name == "linked-line")
            .unwrap();
        assert!(linked.worktree_path.is_some());
        let active = snapshot
            .lines
            .iter()
            .find(|line| line.name == branch)
            .unwrap();
        assert!(active.is_active);
        assert!(active.worktree_path.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn get_version_lines_reports_upstream_ahead_and_behind_after_diverging() {
        let (repo, remote, branch) = published_repo_and_remote("vl-track");

        let synced = get_version_lines(repo.clone()).expect("discovery should succeed");
        let line = synced
            .lines
            .iter()
            .find(|line| line.name == branch)
            .unwrap();
        assert_eq!(line.upstream_ahead, Some(0));
        assert_eq!(line.upstream_behind, Some(0));
        assert!(!line.upstream_gone);

        // repo gets an unpublished commit of its own...
        write_and_commit(&repo, "local.txt", "mine\n", "local only");

        // ...while a second clone publishes one the repo has never fetched.
        let other = unique_temp_dir("vl-track-other");
        let clone_status = base_git_command()
            .args(["clone", "-q", &remote, &other])
            .status()
            .expect("run git clone");
        assert!(clone_status.success());
        write_and_commit(&other, "theirs.txt", "theirs\n", "from the other clone");
        let push_status = git_command(&other)
            .args(["push", "-q", "origin", &branch])
            .status()
            .expect("run git push from the other clone");
        assert!(push_status.success());

        // Ahead/behind reads the locally known remote-tracking ref, so it
        // only reflects the second clone's push once repo fetches it.
        let fetch_status = git_command(&repo)
            .args(["fetch", "-q", "origin"])
            .status()
            .expect("run git fetch");
        assert!(fetch_status.success());

        let diverged = get_version_lines(repo.clone()).expect("discovery should succeed");
        let line = diverged
            .lines
            .iter()
            .find(|line| line.name == branch)
            .unwrap();
        assert_eq!(line.upstream_ahead, Some(1));
        assert_eq!(line.upstream_behind, Some(1));
        assert!(!line.upstream_gone);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn get_version_lines_reports_upstream_gone_after_the_remote_branch_is_deleted() {
        let (repo, remote, branch) = published_repo_and_remote("vl-track-gone");

        // The bare remote's HEAD still points at the branch this test is
        // about to delete, which Git refuses by default ("deletion of the
        // current branch prohibited"). There is no other branch to point it
        // at instead, so silence the guard the same way a real remote's
        // "delete branch" button does.
        let allow_delete_current = git_command(&remote)
            .args(["config", "receive.denyDeleteCurrent", "ignore"])
            .status()
            .expect("run git config receive.denyDeleteCurrent");
        assert!(allow_delete_current.success());

        let delete_status = git_command(&repo)
            .args(["push", "-q", "origin", "--delete", &branch])
            .status()
            .expect("run git push --delete");
        assert!(delete_status.success());
        let prune_status = git_command(&repo)
            .args(["fetch", "-q", "--prune", "origin"])
            .status()
            .expect("run git fetch --prune");
        assert!(prune_status.success());

        let snapshot = get_version_lines(repo.clone()).expect("discovery should succeed");
        let line = snapshot
            .lines
            .iter()
            .find(|line| line.name == branch)
            .unwrap();
        // The upstream config still points at the deleted ref — that is
        // exactly the state worth flagging, so it must not disappear.
        assert!(line.upstream.is_some());
        assert!(line.upstream_gone);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn create_version_line_defaults_to_create_and_switch() {
        let path = unique_temp_dir("vl-create-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let original_head = git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap());

        let plan = plan_create_version_line(path.clone(), "feature-x".to_string(), true, None)
            .expect("plan should succeed");
        assert!(plan.will_switch);
        assert!(plan.requires_confirmation);
        assert_eq!(plan.operation_kind, OperationKind::LocalMutation);

        let snapshot = create_version_line(
            path.clone(),
            "feature-x".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(snapshot.branch.as_deref(), Some("feature-x"));
        assert_eq!(
            git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap()),
            original_head,
            "creating a line at the current commit must not move HEAD's target"
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_without_switching_stays_on_the_original_line() {
        let path = unique_temp_dir("vl-create-no-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let original_branch = current_branch(&path);

        let plan = plan_create_version_line(path.clone(), "feature-y".to_string(), false, None)
            .expect("plan should succeed");
        assert!(!plan.will_switch);

        create_version_line(
            path.clone(),
            "feature-y".to_string(),
            false,
            None,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), original_branch);
        let branches = in_test_frame(|| list_branch_names(&path)).unwrap();
        assert!(branches.contains(&"feature-y".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_preserves_unsaved_and_untracked_work() {
        let path = unique_temp_dir("vl-create-dirty");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "a.txt", "one\nmodified\n");
        write_file(&path, "new.txt", "untracked\n");

        let plan = plan_create_version_line(path.clone(), "carrying-work".to_string(), true, None)
            .expect("plan should succeed");
        assert!(plan.has_unsaved_work);

        create_version_line(
            path.clone(),
            "carrying-work".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect("create should succeed");

        assert_eq!(
            fs::read_to_string(Path::new(&path).join("a.txt")).unwrap(),
            "one\nmodified\n"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("new.txt")).unwrap(),
            "untracked\n"
        );
        let status = read_working_tree_status(path.clone()).unwrap();
        assert!(!status.is_clean);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_recovers_a_detached_head() {
        let path = unique_temp_dir("vl-create-detached");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let commit = git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap());
        let status = git_command(&path)
            .args(["checkout", "-q", &commit])
            .status()
            .expect("detach HEAD");
        assert!(status.success());

        let plan = plan_create_version_line(path.clone(), "recovered".to_string(), false, None)
            .expect("plan should succeed even without an explicit switch request");
        assert!(
            plan.will_switch,
            "detached HEAD must force create-and-switch"
        );

        create_version_line(
            path.clone(),
            "recovered".to_string(),
            false,
            None,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), "recovered");
        assert_eq!(
            git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap()),
            commit
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_an_unborn_branch() {
        let path = unique_temp_dir("vl-create-unborn");
        git_init(&path);

        let error = plan_create_version_line(path.clone(), "too-soon".to_string(), true, None)
            .expect_err("an unborn branch has nothing to branch from yet");
        assert_eq!(error.code, AppErrorCode::UnbornBranchNoVersion);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_duplicate_name() {
        let path = unique_temp_dir("vl-create-dup");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let error = plan_create_version_line(path.clone(), branch, true, None)
            .expect_err("the current branch's own name must be rejected as a duplicate");
        assert_eq!(error.code, AppErrorCode::VersionLineNameTaken);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_case_only_collision() {
        let path = unique_temp_dir("vl-create-case");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "Feature-Z"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let error = plan_create_version_line(path.clone(), "feature-z".to_string(), false, None)
            .expect_err("a case-only collision must be rejected before mutation");
        assert_eq!(error.code, AppErrorCode::VersionLineNameCollides);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_stale_state_token() {
        let path = unique_temp_dir("vl-create-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let plan = plan_create_version_line(path.clone(), "feature-stale".to_string(), false, None)
            .expect("plan should succeed");
        write_file(&path, "b.txt", "changed after preview\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale".to_string(),
            false,
            None,
            plan.state_token,
        )
        .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(!in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"feature-stale".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_changed_content_with_the_same_status_shape() {
        let path = unique_temp_dir("vl-create-stale-content");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "pending.txt", "before preview\n");

        let plan = plan_create_version_line(
            path.clone(),
            "feature-stale-content".to_string(),
            true,
            None,
        )
        .expect("plan should succeed with ordinary unsaved work");
        // The file remains untracked before and after, so the old status-only
        // token was identical even though the confirmed bytes had changed.
        write_file(&path, "pending.txt", "after preview\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale-content".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect_err("content drift after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(!in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"feature-stale-content".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_changed_staged_content_with_the_same_worktree() {
        let path = unique_temp_dir("vl-create-stale-index");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "a.txt", "staged before preview\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let plan =
            plan_create_version_line(path.clone(), "feature-stale-index".to_string(), true, None)
                .expect("plan should capture both index and worktree content");
        write_file(&path, "a.txt", "different staged content\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale-index".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect_err("staged-content drift must stop execution even when the worktree matches");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);

        let _ = fs::remove_dir_all(&path);
    }

    fn make_two_branch_repo(label: &str) -> (String, String, String) {
        let path = unique_temp_dir(label);
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let from_branch = current_branch(&path);
        let status = git_command(&path)
            .args(["switch", "-c", "target-line"])
            .status()
            .expect("run git switch -c");
        assert!(status.success());
        write_and_commit(&path, "b.txt", "two\n", "second");
        let status = git_command(&path)
            .args(["switch", &from_branch])
            .status()
            .expect("run git switch back");
        assert!(status.success());
        (path, from_branch, "target-line".to_string())
    }

    #[test]
    fn switch_version_line_moves_between_two_clean_branches() {
        let (path, from_branch, target) = make_two_branch_repo("vl-switch-clean");

        let plan = plan_switch_version_line(path.clone(), target.clone())
            .expect("plan should succeed for a clean project");
        assert_eq!(plan.from, from_branch);
        assert_eq!(plan.to, target);
        assert_eq!(plan.changed_files, vec!["b.txt".to_string()]);
        assert!(plan.requires_confirmation);

        switch_version_line(path.clone(), target.clone(), plan.state_token)
            .expect("switch should succeed");
        assert_eq!(current_branch(&path), target);
        assert!(Path::new(&path).join("b.txt").exists());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn switch_version_line_blocks_on_unsaved_work() {
        let (path, _from_branch, target) = make_two_branch_repo("vl-switch-dirty");
        write_file(&path, "uncommitted.txt", "oops\n");

        let error = plan_switch_version_line(path.clone(), target)
            .expect_err("unsaved work must block switching to an existing line");
        assert_eq!(error.code, AppErrorCode::DirtyWorkingTree);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn switch_version_line_blocks_a_branch_checked_out_in_another_worktree() {
        let (path, _from_branch, target) = make_two_branch_repo("vl-switch-worktree");
        // Sibling of the repo, not nested inside it — a worktree created
        // inside the repo root would itself show up as an untracked
        // directory in the main worktree's own status.
        let mut worktree = std::env::temp_dir();
        worktree.push(format!(
            "gitodile-test-vl-switch-worktree-linked-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&worktree);
        let status = git_command(&path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                &target,
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let error = plan_switch_version_line(path.clone(), target)
            .expect_err("a branch checked out elsewhere must not be switchable here");
        assert_eq!(error.code, AppErrorCode::VersionLineCheckedOutElsewhere);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&worktree);
    }

    #[test]
    fn switch_version_line_rejects_a_stale_state_token() {
        let (path, _from_branch, target) = make_two_branch_repo("vl-switch-stale");
        let plan =
            plan_switch_version_line(path.clone(), target.clone()).expect("plan should succeed");

        // Something changes the project between preview and execution.
        write_and_commit(&path, "c.txt", "three\n", "third");

        let error = switch_version_line(path.clone(), target, plan.state_token)
            .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_removes_a_fully_retained_branch() {
        let path = unique_temp_dir("vl-delete-retained");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "mergeable"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let plan = plan_delete_version_line(path.clone(), "mergeable".to_string())
            .expect("a branch identical to a retained ref must be deletable");
        assert!(!plan.retained_by.is_empty());
        assert_eq!(plan.operation_kind, OperationKind::Destructive);

        delete_version_line(
            path.clone(),
            "mergeable".to_string(),
            false,
            plan.state_token,
        )
        .expect("delete should succeed");
        assert!(!in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"mergeable".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_blocks_the_active_branch() {
        let path = unique_temp_dir("vl-delete-active");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let error = plan_delete_version_line(path.clone(), branch)
            .expect_err("the active version line can never be deleted");
        assert_eq!(error.code, AppErrorCode::VersionLineIsActive);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_blocks_unique_unretained_work() {
        let path = unique_temp_dir("vl-delete-unique");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["switch", "-c", "unique-work"])
            .status()
            .expect("run git switch -c");
        assert!(status.success());
        write_and_commit(&path, "only-here.txt", "unique\n", "unique commit");
        let status = git_command(&path)
            .args(["switch", "-"])
            .status()
            .expect("run git switch -");
        assert!(status.success());

        let error = plan_delete_version_line(path.clone(), "unique-work".to_string())
            .expect_err("a branch with unreachable unique work must not be deletable");
        assert_eq!(error.code, AppErrorCode::VersionLineUniqueWork);
        assert!(in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"unique-work".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_blocks_a_branch_checked_out_elsewhere() {
        let path = unique_temp_dir("vl-delete-worktree");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let worktree = Path::new(&path).join("linked");
        let status = git_command(&path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                "-b",
                "elsewhere",
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let error = plan_delete_version_line(path.clone(), "elsewhere".to_string())
            .expect_err("a branch checked out in another worktree must not be deletable here");
        assert_eq!(error.code, AppErrorCode::VersionLineCheckedOutElsewhere);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_version_line_rejects_a_stale_state_token() {
        let path = unique_temp_dir("vl-delete-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "goes-away"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let plan = plan_delete_version_line(path.clone(), "goes-away".to_string())
            .expect("plan should succeed");
        // Left uncommitted on purpose: a fresh commit alone would leave the
        // tree clean again and wouldn't move the state token, since the
        // token's status fingerprint only reflects working-tree drift.
        write_file(&path, "c.txt", "uncommitted change after preview\n");

        let error = delete_version_line(
            path.clone(),
            "goes-away".to_string(),
            false,
            plan.state_token,
        )
        .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"goes-away".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    fn commit_at(path: &str, revision: &str) -> String {
        git_stdout(
            &git_command(path)
                .args(["rev-parse", "--verify", revision])
                .output()
                .expect("run git rev-parse"),
        )
    }

    #[test]
    fn create_version_line_can_start_at_a_chosen_saved_version() {
        let path = unique_temp_dir("vl-create-from-version");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");
        let second = commit_at(&path, "HEAD");
        let original_branch = current_branch(&path);

        let plan = plan_create_version_line(
            path.clone(),
            "from-first".to_string(),
            false,
            Some(first.clone()),
        )
        .expect("plan should succeed");
        assert!(plan.from_saved_version);
        assert_eq!(plan.starting_commit.as_deref(), Some(first.as_str()));
        assert!(!plan.will_switch);

        create_version_line(
            path.clone(),
            "from-first".to_string(),
            false,
            Some(first.clone()),
            plan.state_token,
        )
        .expect("create should succeed");

        // The line starts where it was told to, and the project has not moved.
        assert_eq!(commit_at(&path, "refs/heads/from-first"), first);
        assert_eq!(current_branch(&path), original_branch);
        assert_eq!(commit_at(&path, "HEAD"), second);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_from_a_version_switches_only_when_asked() {
        let path = unique_temp_dir("vl-create-from-version-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");

        let plan = plan_create_version_line(
            path.clone(),
            "moved-back".to_string(),
            true,
            Some(first.clone()),
        )
        .expect("plan should succeed");
        assert!(plan.will_switch);

        create_version_line(
            path.clone(),
            "moved-back".to_string(),
            true,
            Some(first.clone()),
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), "moved-back");
        assert_eq!(commit_at(&path, "HEAD"), first);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn a_detached_head_is_not_recovered_by_a_line_starting_somewhere_else() {
        let path = unique_temp_dir("vl-create-from-version-detached");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");
        let second = commit_at(&path, "HEAD");
        assert!(git_command(&path)
            .args(["switch", "-q", "--detach", &second])
            .status()
            .unwrap()
            .success());

        // Creating a line at the current commit still recovers the detached
        // HEAD by switching onto it...
        let here = plan_create_version_line(path.clone(), "recovered".to_string(), false, None)
            .expect("plan should succeed");
        assert!(here.will_switch);

        // ...but a line rooted at an older version is not a recovery, and
        // switching to it would move the working tree away unasked.
        let elsewhere = plan_create_version_line(
            path.clone(),
            "elsewhere".to_string(),
            false,
            Some(first.clone()),
        )
        .expect("plan should succeed");
        assert!(!elsewhere.will_switch);
        assert_eq!(elsewhere.starting_commit.as_deref(), Some(first.as_str()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_refuses_a_starting_point_it_cannot_verify() {
        let path = unique_temp_dir("vl-create-from-bad-version");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        // A revision expression is not a saved version: only a full object id
        // this project actually holds is accepted.
        for candidate in ["HEAD~1", "main", "not-a-commit"] {
            let error = plan_create_version_line(
                path.clone(),
                "nope".to_string(),
                false,
                Some(candidate.to_string()),
            )
            .expect_err("an unverifiable starting point should be refused");
            assert_eq!(error.code, AppErrorCode::InvalidSelection);
        }

        let missing = "0".repeat(40);
        let error =
            plan_create_version_line(path.clone(), "nope".to_string(), false, Some(missing))
                .expect_err("a commit this project does not have should be refused");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn creating_from_a_version_rejects_a_state_token_from_another_starting_point() {
        let path = unique_temp_dir("vl-create-from-version-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");
        let second = commit_at(&path, "HEAD");

        let plan =
            plan_create_version_line(path.clone(), "swapped".to_string(), false, Some(first))
                .expect("plan should succeed");

        // The token covers the starting point, so a preview of one version
        // cannot be executed against another.
        let error = create_version_line(
            path.clone(),
            "swapped".to_string(),
            false,
            Some(second),
            plan.state_token,
        )
        .expect_err("a plan for another starting point should be refused");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);

        let _ = fs::remove_dir_all(&path);
    }
}

// ---- Switch to an existing version line ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SwitchVersionLinePlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) from_commit: String,
    pub(crate) to_commit: String,
    pub(crate) changed_files: Vec<String>,
    pub(crate) changed_files_total: usize,
}

pub(crate) struct ValidatedSwitch {
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) from_commit: String,
    pub(crate) to_commit: String,
    pub(crate) changed_files: Vec<String>,
    pub(crate) changed_files_total: usize,
    pub(crate) state_token: String,
}

pub(crate) fn validate_and_prepare_switch(
    path: &str,
    target: &str,
) -> Result<ValidatedSwitch, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let status = read_working_tree_status(path.to_string())?;
    if !status.is_clean {
        return Err(AppError::new(
            AppErrorCode::DirtyWorkingTree,
            "This project has unsaved changes, so GitOdile can't switch version lines yet.",
        )
        .with_remediation(
            "Save a version, or start a new version line with this work, then try again.",
        ));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let from = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let (head_state, from_commit) = resolve_head_state(path, from.clone())?;
    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a version line right now.",
        )
        .with_remediation("Create a version line at this commit first."));
    }
    if head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "There's no saved version on this version line yet.",
        )
        .with_remediation("Save a version before switching version lines."));
    }
    let from = from.expect("a branch head has a name");
    let from_commit = from_commit.expect("a branch head has a commit");

    validate_branch_ref_name(path, target)?;
    if target == from {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "This is already the active version line.",
        ));
    }

    let target_ref = format!("refs/heads/{target}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }
    let to_commit = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;

    let worktrees = list_worktrees(path)?;
    if let Some(occupied) = worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some(target))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineCheckedOutElsewhere,
            format!(
                "\"{target}\" is already open in another workspace at {}.",
                occupied.path
            ),
        )
        .with_remediation("Switch to it from that workspace instead."));
    }

    let diff_output = run_git(
        path,
        &[
            "diff",
            "--name-only",
            "-z",
            &format!("{from_commit}..{to_commit}"),
        ],
    )?;
    let all_changed_files = if diff_output.status.success() {
        split_nul_list(&diff_output)
    } else {
        Vec::new()
    };
    let changed_files_total = all_changed_files.len();
    let changed_files = all_changed_files.into_iter().take(50).collect();

    let state_token = compute_version_line_state_token(
        Some(&from_commit),
        Some(&from),
        &status_fingerprint(&status),
        &format!("switch:{from}->{target}@{to_commit}"),
    );

    Ok(ValidatedSwitch {
        from,
        to: target.to_string(),
        from_commit,
        to_commit,
        changed_files,
        changed_files_total,
        state_token,
    })
}

pub(crate) fn plan_switch_version_line(
    path: String,
    target: String,
) -> Result<SwitchVersionLinePlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_switch_version_line", None)?;
    let validated = validate_and_prepare_switch(&path, &target)?;
    Ok(SwitchVersionLinePlan {
        operation_kind: OperationKind::LocalMutation,
        summary: format!(
            "Switch from \"{}\" to \"{}\".",
            validated.from, validated.to
        ),
        steps: vec![
            format!(
                "Update this project's files and index to match \"{}\".",
                validated.to
            ),
            "Local history and every other version line stay unchanged.".to_string(),
        ],
        risks: Vec::new(),
        recovery: format!(
            "\"{}\" stays exactly as it is; switching back returns these files.",
            validated.from
        ),
        requires_confirmation: true,
        state_token: validated.state_token,
        from: validated.from,
        to: validated.to,
        from_commit: validated.from_commit,
        to_commit: validated.to_commit,
        changed_files: validated.changed_files,
        changed_files_total: validated.changed_files_total,
    })
}

pub(crate) fn classify_switch_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("would be overwritten")
        || stderr_lower.contains("please commit your changes")
    {
        AppError::new(
            AppErrorCode::VersionLineSwitchObstructed,
            "Git found local changes in the way of this switch that weren't visible in the preview.",
        )
        .with_remediation("Save or discard those changes in Git directly, then try again.")
        .with_detail(truncate_detail(&stderr))
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't switch version lines.",
        )
        .with_remediation("Check the project's Git state and try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn switch_version_line(
    path: String,
    target: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "switch_version_line", None)?;
    let validated = validate_and_prepare_switch(&path, &target)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    let output = run_git(&path, &["switch", "--no-guess", &validated.to])?;
    if !output.status.success() {
        return Err(classify_switch_failure(&output));
    }
    get_version_lines(path)
}

// ---- Safely delete a local version line ----

/// Where a line is published, when it is. Both halves come from the line's own
/// Git configuration rather than from splitting `origin/name` on a slash: a
/// remote may be named with a slash in it, and a branch certainly may.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishedLine {
    pub(crate) remote: String,
    pub(crate) branch: String,
    /// `origin/feature-x` — what the rest of the app calls the upstream.
    pub(crate) short_name: String,
}

pub(crate) fn published_line(path: &str, name: &str) -> Result<Option<PublishedLine>, AppError> {
    let remote_key = format!("branch.{name}.remote");
    let merge_key = format!("branch.{name}.merge");
    let remote_output = run_git(path, &["config", "--get", &remote_key])?;
    let merge_output = run_git(path, &["config", "--get", &merge_key])?;
    if !remote_output.status.success() || !merge_output.status.success() {
        return Ok(None);
    }
    let remote = git_stdout(&remote_output);
    let merge = git_stdout(&merge_output);
    // A remote named `.` means "this repository": there is nothing to publish
    // to and nothing to delete there.
    if remote.is_empty() || remote == "." {
        return Ok(None);
    }
    let branch = merge
        .strip_prefix("refs/heads/")
        .unwrap_or(&merge)
        .to_string();
    if branch.is_empty() {
        return Ok(None);
    }
    let short_name = format!("{remote}/{branch}");
    Ok(Some(PublishedLine {
        remote,
        branch,
        short_name,
    }))
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteVersionLinePlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) name: String,
    pub(crate) tip_commit: String,
    pub(crate) retained_by: Vec<String>,
    pub(crate) upstream: Option<String>,
    /// The remote copy this delete can clear away as well, when there is one
    /// and it still exists. `None` for a line that was never published, or one
    /// whose remote branch is already gone.
    pub(crate) published: Option<PublishedLine>,
    /// Set when no other line holds this one's versions but its work reached
    /// the main line as copies — squashed or rebased. Deleting it then removes
    /// the only ref to its original versions, so the delete keeps a recovery
    /// point first (`recovery_point`).
    pub(crate) copied_into: Option<CopiedInto>,
    /// The local recovery point this delete creates before removing the line.
    /// `Some` exactly when `copied_into` is.
    pub(crate) recovery_point: Option<HistoryRecoveryPreview>,
}

/// Where a line's work reached the main line as copies.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopiedInto {
    /// The main line, by its local name.
    pub(crate) base: String,
    pub(crate) kind: MergeKind,
    /// The main line's version that brought the work in.
    pub(crate) commit: String,
}

/// What a delete actually did. The local half and the remote half can succeed
/// separately, and a screen that reports only the first would leave the user
/// believing a branch is gone from the project when their team still sees it.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteVersionLineResult {
    pub(crate) snapshot: VersionLinesSnapshot,
    /// `None` when no remote delete was asked for.
    pub(crate) remote_deleted: Option<bool>,
    /// Set when a remote delete was asked for and refused. The local line is
    /// gone either way; this says the shared copy is not.
    pub(crate) remote_error: Option<AppError>,
    /// The recovery point kept before the line was removed, when its versions
    /// were held nowhere else.
    pub(crate) recovery_reference: Option<String>,
}

pub(crate) struct ValidatedDelete {
    pub(crate) name: String,
    pub(crate) tip: String,
    pub(crate) retained_by: Vec<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) published: Option<PublishedLine>,
    pub(crate) copied_into: Option<CopiedInto>,
    pub(crate) state_token: String,
}

/// Whether a line's work reached the main line as copies — squashed or
/// rebased — the same check the route draws (`detect_copy`), against the same
/// main line. `None` for the main line itself, for a project with none, and
/// for a line whose work is not there.
fn find_copy_into_main(path: &str, name: &str) -> Result<Option<CopiedInto>, AppError> {
    let defaults = default_branch_names(path)?;
    if defaults.iter().any(|default| default == name) {
        return Ok(None);
    }
    let branch_ref = format!("refs/heads/{name}");
    for base in defaults {
        let base_ref = format!("refs/heads/{base}");
        let Some(merge_base) = rev_parse_commit(path, &["merge-base", &base_ref, &branch_ref])?
        else {
            continue;
        };
        return Ok(detect_copy(path, &base_ref, &branch_ref, &merge_base)?
            .map(|(kind, commit)| CopiedInto { base, kind, commit }));
    }
    Ok(None)
}

pub(crate) fn validate_and_prepare_delete(
    path: &str,
    name: &str,
) -> Result<ValidatedDelete, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let active = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    if active.as_deref() == Some(name) {
        return Err(AppError::new(
            AppErrorCode::VersionLineIsActive,
            "The active version line can't be deleted.",
        )
        .with_remediation("Switch to a different version line first."));
    }
    ensure_not_default_branch(path, name)?;

    let target_ref = format!("refs/heads/{name}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }
    let tip = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;

    let worktrees = list_worktrees(path)?;
    if let Some(occupied) = worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some(name))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineCheckedOutElsewhere,
            format!(
                "\"{name}\" is open in another workspace at {}.",
                occupied.path
            ),
        )
        .with_remediation(
            "Close that workspace, or switch it to a different version line, before deleting.",
        ));
    }

    let retained_by = retaining_refs(path, name, &tip)?;
    // No other line holds these versions — but if their work reached the main
    // line as copies, the line can go, with a recovery point for the
    // originals. Otherwise it is work that exists nowhere else.
    let copied_into = if retained_by.is_empty() {
        find_copy_into_main(path, name)?
    } else {
        None
    };
    if retained_by.is_empty() && copied_into.is_none() {
        return Err(AppError::new(
            AppErrorCode::VersionLineUniqueWork,
            format!(
                "\"{name}\" has saved work that isn't reachable from any other version line or remote yet."
            ),
        )
        .with_remediation(
            "Merge or publish this work, or keep the version line, before deleting it.",
        ));
    }

    let published = published_line(path, name)?;
    // Only offered when the remote branch is actually still there: a line whose
    // upstream is `[gone]` has nothing left to delete, and offering it would
    // fail for a reason the user cannot act on.
    let published = match published {
        Some(entry) => {
            let tracking = format!("refs/remotes/{}", entry.short_name);
            let exists = run_git(path, &["show-ref", "--verify", "--quiet", &tracking])?;
            exists.status.success().then_some(entry)
        }
        None => None,
    };
    let upstream = published.as_ref().map(|entry| entry.short_name.clone());

    let status = read_working_tree_status(path.to_string())?;
    let state_token = compute_version_line_state_token(
        Some(&tip),
        Some(name),
        &status_fingerprint(&status),
        &format!(
            "delete:{name}:{}:{}",
            retained_by.join(","),
            copied_into
                .as_ref()
                .map(|copy| copy.commit.as_str())
                .unwrap_or("")
        ),
    );

    Ok(ValidatedDelete {
        name: name.to_string(),
        tip,
        retained_by,
        upstream,
        published,
        copied_into,
        state_token,
    })
}

pub(crate) fn plan_delete_version_line(
    path: String,
    name: String,
) -> Result<DeleteVersionLinePlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_delete_version_line", None)?;
    let validated = validate_and_prepare_delete(&path, &name)?;
    let recovery_point = validated.copied_into.as_ref().map(|_| {
        plan_history_recovery_for(&repository, HistoryRecoveryOperation::DeleteVersionLine)
    });
    let (mut steps, mut risks, recovery) = match (&validated.copied_into, &recovery_point) {
        (Some(copy), Some(point)) => (
            vec![
                format!(
                    "Keep a local recovery point with \"{}\"'s original saved versions.",
                    validated.name
                ),
                format!(
                    "Remove the local reference \"{}\"; its work is already on {} as {}.",
                    validated.name,
                    copy.base,
                    match copy.kind {
                        MergeKind::Squash => "one squashed version",
                        _ => "copies of its versions",
                    }
                ),
            ],
            vec![format!(
                "The original versions will then live only in that recovery point. {}",
                point.retention
            )],
            format!("Local recovery point: {}", point.reference),
        ),
        _ => (
            vec![format!(
                "Remove the local reference \"{}\"; its saved work stays reachable from {}.",
                validated.name,
                validated.retained_by.join(", ")
            )],
            vec![
                "This can't be undone from GitOdile; the retained reference(s) above are the only guaranteed way back to this work."
                    .to_string(),
            ],
            format!("Reachable from: {}", validated.retained_by.join(", ")),
        ),
    };
    if let Some(published) = &validated.published {
        steps.push(format!(
            "Optionally delete \"{}\" on the remote as well.",
            published.short_name
        ));
        risks.push(format!(
            "Deleting \"{}\" on the remote removes it for everyone who works on this project.",
            published.short_name
        ));
    }
    Ok(DeleteVersionLinePlan {
        operation_kind: OperationKind::Destructive,
        summary: format!("Delete the version line \"{}\".", validated.name),
        steps,
        risks,
        recovery,
        requires_confirmation: true,
        state_token: validated.state_token,
        name: validated.name,
        tip_commit: validated.tip,
        retained_by: validated.retained_by,
        upstream: validated.upstream,
        published: validated.published,
        copied_into: validated.copied_into,
        recovery_point,
    })
}

pub(crate) fn classify_delete_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("not fully merged") {
        AppError::new(
            AppErrorCode::VersionLineUniqueWork,
            "Git found work on this version line that isn't safely reachable elsewhere yet.",
        )
        .with_remediation(
            "Merge or publish this work, or keep the version line, before deleting it.",
        )
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't delete this version line.",
        )
        .with_remediation("Check the project's Git state and try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn classify_remote_delete_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("remote ref does not exist") {
        AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line is already gone from the remote.",
        )
        .with_remediation("Nothing else to do — get project changes to refresh what's published.")
    } else if stderr_lower.contains("authentication")
        || stderr_lower.contains("permission denied")
        || stderr_lower.contains("could not read")
        || stderr_lower.contains("access denied")
    {
        AppError::new(
            AppErrorCode::AuthenticationFailed,
            "The remote wouldn't accept the deletion with the credentials on this computer.",
        )
        .with_remediation("Check your access to the project's remote, then try again.")
    } else if stderr_lower.contains("protected branch")
        || stderr_lower.contains("pre-receive hook declined")
        || stderr_lower.contains("deletion of the current branch prohibited")
    {
        AppError::new(
            AppErrorCode::RemoteRejected,
            "The remote refused to delete this version line.",
        )
        .with_remediation("It may be protected there; ask whoever administers the remote.")
        .with_detail(truncate_detail(&stderr))
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't delete this version line on the remote.",
        )
        .with_remediation("Check your connection and your access to the remote, then try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn delete_version_line(
    path: String,
    name: String,
    delete_remote: bool,
    state_token: String,
) -> Result<DeleteVersionLineResult, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "delete_version_line", None)?;
    let validated = validate_and_prepare_delete(&path, &name)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }

    // A line whose versions are held nowhere else — its work reached the main
    // line only as copies — keeps a verified recovery point before anything is
    // removed (ADR 0016). No recovery point, no delete.
    let recovery_reference = match &validated.copied_into {
        Some(copy) => {
            let point =
                plan_history_recovery_for(&repository, HistoryRecoveryOperation::DeleteVersionLine);
            let record = create_history_recovery_for(
                &repository,
                HistoryRecoveryOperation::DeleteVersionLine,
                &point.reference,
                HistoryRecoveryMetadata {
                    branch: validated.name.clone(),
                    previous_commit: validated.tip.clone(),
                    target_commit: copy.commit.clone(),
                    remote: validated
                        .published
                        .as_ref()
                        .map(|published| published.remote.clone())
                        .unwrap_or_default(),
                    destination_branch: copy.base.clone(),
                    tracking_ref: validated.upstream.clone().unwrap_or_default(),
                    state_token: state_token.clone(),
                },
            )?;
            verify_history_recovery(&path, &record)?;
            Some(record.reference)
        }
        None => None,
    };

    // `-d` first, always: Git's own refusal is the outer safety net and it
    // costs nothing to ask for it.
    //
    // Its rule is narrower than this app's, though, and that gap used to be a
    // lie on screen. Git accepts `-d` only for a branch merged into HEAD or
    // into its own upstream; GitOdile calls a line safe when its tip is
    // reachable from *any* other local or remote-tracking ref, which is the
    // question that actually decides whether work can be lost. A feature line
    // already merged and published, sitting beside a local `main` that has not
    // been pulled yet, satisfies the second and not the first — so the screen
    // said "Safe to delete", the dialog agreed, and Git then refused.
    //
    // So a `not fully merged` refusal is answered with `-D`, and only ever
    // after `validate_and_prepare_delete` has just proved again that the work
    // survives — retained by another ref, or copied into the main line with a
    // recovery point verified just above — and the state token has confirmed
    // nothing moved since the preview. Every other refusal stands.
    let output = run_git(&path, &["branch", "-d", "--", &validated.name])?;
    if !output.status.success() {
        let failure = classify_delete_failure(&output);
        if failure.code != AppErrorCode::VersionLineUniqueWork {
            return Err(failure);
        }
        let forced = run_git(&path, &["branch", "-D", "--", &validated.name])?;
        if !forced.status.success() {
            return Err(classify_delete_failure(&forced));
        }
    }

    let mut remote_deleted = None;
    let mut remote_error = None;
    if delete_remote {
        match &validated.published {
            Some(published) => {
                let push = run_git(
                    &path,
                    &[
                        "push",
                        "--porcelain",
                        &published.remote,
                        "--delete",
                        &format!("refs/heads/{}", published.branch),
                    ],
                )?;
                if push.status.success() {
                    remote_deleted = Some(true);
                } else {
                    remote_deleted = Some(false);
                    remote_error = Some(classify_remote_delete_failure(&push));
                }
            }
            // Asked for, but there is nothing published to delete. Reported as
            // "not done" rather than as a failure: the local line is gone and
            // the remote never had a copy.
            None => remote_deleted = Some(false),
        }
    }

    Ok(DeleteVersionLineResult {
        snapshot: get_version_lines(path)?,
        remote_deleted,
        remote_error,
        recovery_reference,
    })
}

// ---- Rename a version line ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenameVersionLinePlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) name: String,
    pub(crate) new_name: String,
    pub(crate) is_active: bool,
    /// The line is published under its old name, which this rename does not
    /// touch. The screen says so rather than letting the user assume the
    /// remote followed along.
    pub(crate) upstream: Option<String>,
}

pub(crate) struct ValidatedRename {
    pub(crate) name: String,
    pub(crate) new_name: String,
    pub(crate) is_active: bool,
    pub(crate) upstream: Option<String>,
    pub(crate) state_token: String,
}

pub(crate) fn validate_and_prepare_rename(
    path: &str,
    name: &str,
    new_name: &str,
) -> Result<ValidatedRename, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    validate_branch_ref_name(path, name)?;
    validate_branch_ref_name(path, new_name)?;
    ensure_not_default_branch(path, name)?;

    let target_ref = format!("refs/heads/{name}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That version line no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }

    if new_name == name {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameTaken,
            "That's already this version line's name.",
        )
        .with_remediation("Choose a different name."));
    }

    let existing = list_branch_names(path)?;
    if existing.iter().any(|known| known == new_name) {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameTaken,
            "A version line with this exact name already exists.",
        )
        .with_remediation("Choose a different name."));
    }
    if let Some(collision) = existing
        .iter()
        .filter(|known| *known != name)
        .find(|known| known.eq_ignore_ascii_case(new_name))
    {
        return Err(AppError::new(
            AppErrorCode::VersionLineNameCollides,
            format!(
                "\"{collision}\" already exists and only differs by letter case, which some file systems can't tell apart."
            ),
        )
        .with_remediation("Choose a name that isn't just a different case of an existing one."));
    }

    // A line open in another workspace is renamed *there* as far as that
    // window is concerned: Git rewrites the ref under it without telling it.
    // Refused for the same reason switching and deleting are.
    let worktrees = list_worktrees(path)?;
    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let active = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let is_active = active.as_deref() == Some(name);
    if !is_active {
        if let Some(occupied) = worktrees
            .iter()
            .find(|worktree| worktree.branch.as_deref() == Some(name))
        {
            return Err(AppError::new(
                AppErrorCode::VersionLineCheckedOutElsewhere,
                format!(
                    "\"{name}\" is open in another workspace at {}.",
                    occupied.path
                ),
            )
            .with_remediation(
                "Close that workspace, or switch it to a different version line, before renaming.",
            ));
        }
    }

    let upstream = published_line(path, name)?.map(|entry| entry.short_name);
    let tip = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;
    let status = read_working_tree_status(path.to_string())?;
    let state_token = compute_version_line_state_token(
        Some(&tip),
        Some(name),
        &status_fingerprint(&status),
        &format!("rename:{name}:{new_name}"),
    );

    Ok(ValidatedRename {
        name: name.to_string(),
        new_name: new_name.to_string(),
        is_active,
        upstream,
        state_token,
    })
}

pub(crate) fn plan_rename_version_line(
    path: String,
    name: String,
    new_name: String,
) -> Result<RenameVersionLinePlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_rename_version_line", None)?;
    let validated = validate_and_prepare_rename(&path, &name, &new_name)?;
    let mut steps = vec![format!(
        "Rename the local version line \"{}\" to \"{}\".",
        validated.name, validated.new_name
    )];
    let mut risks = Vec::new();
    if let Some(upstream) = &validated.upstream {
        steps.push(format!(
            "Keep tracking \"{upstream}\", which keeps its own name."
        ));
        risks.push(format!(
            "The published copy stays called \"{upstream}\"; renaming it there is a separate decision."
        ));
    }
    Ok(RenameVersionLinePlan {
        // Nothing is lost and nothing leaves this computer: the saved versions
        // are the same commits under a different local name.
        operation_kind: OperationKind::LocalMutation,
        summary: format!(
            "Rename \"{}\" to \"{}\".",
            validated.name, validated.new_name
        ),
        steps,
        risks,
        recovery: format!(
            "Rename it back to \"{}\" at any time; no saved version is touched.",
            validated.name
        ),
        requires_confirmation: false,
        state_token: validated.state_token,
        name: validated.name,
        new_name: validated.new_name,
        is_active: validated.is_active,
        upstream: validated.upstream,
    })
}

pub(crate) fn rename_version_line(
    path: String,
    name: String,
    new_name: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "rename_version_line", None)?;
    let validated = validate_and_prepare_rename(&path, &name, &new_name)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    // `-m`, never `-M`: the forcing variant overwrites an existing branch of
    // the target name, and losing a line to a rename is exactly the surprise
    // the name check above exists to prevent.
    let output = run_git(
        &path,
        &["branch", "-m", "--", &validated.name, &validated.new_name],
    )?;
    if !output.status.success() {
        return Err(classify_ref_mutation_failure(
            &output,
            "Git couldn't rename this version line.",
        ));
    }
    get_version_lines(path)
}
