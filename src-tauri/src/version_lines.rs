use crate::{
    application, checked_git_stdout, display_path, git_operation_in_progress, git_stdout,
    parse_git_version, prepare_index, read_working_tree_status, resolve_head_state, run_git,
    truncate_detail, validate_branch_ref_name, AppError, AppErrorCode, ChangeCategory, HeadState,
    OperationKind, WorkingTreeStatus,
};
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
            "This version of Git is too old for GitOdrile to change version lines safely.",
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

pub(crate) fn branch_unique_commit_count(
    path: &str,
    active: Option<&str>,
    tip: &str,
) -> Option<u32> {
    let active = active?;
    let output = run_git(path, &["rev-list", "--count", &format!("{active}..{tip}")]).ok()?;
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
pub(crate) fn read_version_line_refs(
    path: &str,
    current_commit: Option<&str>,
) -> Result<(ParsedVersionLines, bool), AppError> {
    if let Some(commit) = current_commit {
        let format = format!(
            "--format={VERSION_LINE_BASE_FORMAT}%00%(ahead-behind:{commit})%00%(worktreepath)"
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

    let (parsed, has_batched_metadata) = read_version_line_refs(&path, current_commit.as_deref())?;
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
        let unique_commit_count = if is_active {
            None
        } else if has_batched_metadata {
            raw.unique_commit_count
        } else {
            *unique_counts_by_tip
                .entry(raw.commit.clone())
                .or_insert_with(|| {
                    branch_unique_commit_count(&path, branch.as_deref(), &raw.commit)
                })
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
    pub(crate) will_switch: bool,
    pub(crate) has_unsaved_work: bool,
}

pub(crate) struct ValidatedCreate {
    pub(crate) name: String,
    pub(crate) head_state: HeadState,
    pub(crate) starting_commit: Option<String>,
    pub(crate) will_switch: bool,
    pub(crate) has_unsaved_work: bool,
    pub(crate) state_token: String,
}

pub(crate) fn validate_and_prepare_create(
    path: &str,
    name: &str,
    switch: bool,
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

    if head_state == HeadState::Unborn {
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
    let will_switch = switch || head_state == HeadState::Detached;

    let mutable_state = create_version_line_state_fingerprint(path, &head_state, &status)?;
    let state_token = compute_version_line_state_token(
        head_sha.as_deref(),
        branch.as_deref(),
        &mutable_state,
        &format!("create:{name}:{will_switch}"),
    );

    Ok(ValidatedCreate {
        name: name.to_string(),
        head_state,
        starting_commit: head_sha,
        will_switch,
        has_unsaved_work,
        state_token,
    })
}

pub(crate) fn plan_create_version_line(
    path: String,
    name: String,
    switch: bool,
) -> Result<CreateVersionLinePlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_create_version_line", None)?;
    let validated = validate_and_prepare_create(&path, &name, switch)?;
    let mut steps = vec![format!(
        "Create the version line \"{}\" at the current commit.",
        validated.name
    )];
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
    if validated.head_state == HeadState::Detached {
        risks.push(
            "This project isn't on a version line right now; creating one here keeps the current commit reachable by name."
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
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "create_version_line", None)?;
    let validated = validate_and_prepare_create(&path, &name, switch)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }

    let output = if validated.will_switch {
        run_git(&path, &["switch", "-c", &validated.name])?
    } else {
        let starting = validated.starting_commit.as_deref().unwrap_or("HEAD");
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
    use crate::{base_git_command, git_command, in_test_frame, plan_publish, publish, test_git};
    use std::{fs, path::Path};

    fn unique_temp_dir(label: &str) -> String {
        let mut dir = std::env::temp_dir();
        dir.push(format!("gitodrile-test-{label}-{}", std::process::id()));
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
                "user.name=GitOdrile Test",
                "-c",
                "user.email=test@gitodrile.local",
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
        publish(repo.clone(), plan.target.remote, plan.state_token, None)
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

        let plan = plan_create_version_line(path.clone(), "feature-x".to_string(), true)
            .expect("plan should succeed");
        assert!(plan.will_switch);
        assert!(plan.requires_confirmation);
        assert_eq!(plan.operation_kind, OperationKind::LocalMutation);

        let snapshot = create_version_line(
            path.clone(),
            "feature-x".to_string(),
            true,
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

        let plan = plan_create_version_line(path.clone(), "feature-y".to_string(), false)
            .expect("plan should succeed");
        assert!(!plan.will_switch);

        create_version_line(
            path.clone(),
            "feature-y".to_string(),
            false,
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

        let plan = plan_create_version_line(path.clone(), "carrying-work".to_string(), true)
            .expect("plan should succeed");
        assert!(plan.has_unsaved_work);

        create_version_line(
            path.clone(),
            "carrying-work".to_string(),
            true,
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

        let plan = plan_create_version_line(path.clone(), "recovered".to_string(), false)
            .expect("plan should succeed even without an explicit switch request");
        assert!(
            plan.will_switch,
            "detached HEAD must force create-and-switch"
        );

        create_version_line(
            path.clone(),
            "recovered".to_string(),
            false,
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

        let error = plan_create_version_line(path.clone(), "too-soon".to_string(), true)
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

        let error = plan_create_version_line(path.clone(), branch, true)
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

        let error = plan_create_version_line(path.clone(), "feature-z".to_string(), false)
            .expect_err("a case-only collision must be rejected before mutation");
        assert_eq!(error.code, AppErrorCode::VersionLineNameCollides);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_version_line_rejects_a_stale_state_token() {
        let path = unique_temp_dir("vl-create-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let plan = plan_create_version_line(path.clone(), "feature-stale".to_string(), false)
            .expect("plan should succeed");
        write_file(&path, "b.txt", "changed after preview\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale".to_string(),
            false,
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

        let plan =
            plan_create_version_line(path.clone(), "feature-stale-content".to_string(), true)
                .expect("plan should succeed with ordinary unsaved work");
        // The file remains untracked before and after, so the old status-only
        // token was identical even though the confirmed bytes had changed.
        write_file(&path, "pending.txt", "after preview\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale-content".to_string(),
            true,
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

        let plan = plan_create_version_line(path.clone(), "feature-stale-index".to_string(), true)
            .expect("plan should capture both index and worktree content");
        write_file(&path, "a.txt", "different staged content\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let error = create_version_line(
            path.clone(),
            "feature-stale-index".to_string(),
            true,
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
            "gitodrile-test-vl-switch-worktree-linked-{}",
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

        delete_version_line(path.clone(), "mergeable".to_string(), plan.state_token)
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

        let error = delete_version_line(path.clone(), "goes-away".to_string(), plan.state_token)
            .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleVersionLinePlan);
        assert!(in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"goes-away".to_string()));

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
            "This project has unsaved changes, so GitOdrile can't switch version lines yet.",
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
}

pub(crate) struct ValidatedDelete {
    pub(crate) name: String,
    pub(crate) tip: String,
    pub(crate) retained_by: Vec<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) state_token: String,
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
    if retained_by.is_empty() {
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

    let upstream_output = run_git(
        path,
        &["for-each-ref", "--format=%(upstream:short)", &target_ref],
    )?;
    let upstream = upstream_output
        .status
        .success()
        .then(|| git_stdout(&upstream_output))
        .filter(|value| !value.is_empty());

    let status = read_working_tree_status(path.to_string())?;
    let state_token = compute_version_line_state_token(
        Some(&tip),
        Some(name),
        &status_fingerprint(&status),
        &format!("delete:{name}:{}", retained_by.join(",")),
    );

    Ok(ValidatedDelete {
        name: name.to_string(),
        tip,
        retained_by,
        upstream,
        state_token,
    })
}

pub(crate) fn plan_delete_version_line(
    path: String,
    name: String,
) -> Result<DeleteVersionLinePlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_delete_version_line", None)?;
    let validated = validate_and_prepare_delete(&path, &name)?;
    Ok(DeleteVersionLinePlan {
        operation_kind: OperationKind::Destructive,
        summary: format!("Delete the version line \"{}\".", validated.name),
        steps: vec![format!(
            "Remove the local reference \"{}\"; its saved work stays reachable from {}.",
            validated.name,
            validated.retained_by.join(", ")
        )],
        risks: vec![
            "This can't be undone from GitOdrile; the retained reference(s) above are the only guaranteed way back to this work."
                .to_string(),
        ],
        recovery: format!("Reachable from: {}", validated.retained_by.join(", ")),
        requires_confirmation: true,
        state_token: validated.state_token,
        name: validated.name,
        tip_commit: validated.tip,
        retained_by: validated.retained_by,
        upstream: validated.upstream,
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

pub(crate) fn delete_version_line(
    path: String,
    name: String,
    state_token: String,
) -> Result<VersionLinesSnapshot, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "delete_version_line", None)?;
    let validated = validate_and_prepare_delete(&path, &name)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleVersionLinePlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    // Never `-D`: Git's own safe-delete refusal (a branch not fully merged
    // into its upstream or HEAD) is the actual enforcement of "never delete
    // unique work" — `retained_by` above only explains why it's expected to
    // succeed.
    let output = run_git(&path, &["branch", "-d", "--", &validated.name])?;
    if !output.status.success() {
        return Err(classify_delete_failure(&output));
    }
    get_version_lines(path)
}
