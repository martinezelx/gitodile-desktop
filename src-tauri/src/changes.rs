use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_stdout, run_git, run_git_capped, CappedOutput};
use crate::status::{
    checked_status_records, find_status_entry, ChangeCategory, RawStatusEntry, STATUS_ARGS,
};
use std::{io::ErrorKind, path::Path};

#[cfg(test)]
use crate::git_command::base_git_command;

// ---- File diff (task 009) ----

/// Git's well-known hash of the empty tree. It needs no lookup — an empty
/// tree has no entries — so it is always usable as a diff base, which lets an
/// unborn branch's files be diffed as additions instead of failing because
/// `HEAD` does not exist yet.
pub(crate) const EMPTY_TREE_HASH: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Bounds the raw `git diff` output read into memory before parsing. Chosen
/// to comfortably fit ordinary reviewable diffs while capping worst-case
/// memory and IPC payload for pathological files. Hitting it returns an
/// explicit `too-large` result rather than a partial or frozen one.
pub(crate) const MAX_DIFF_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

/// Bounds the number of parsed diff lines returned to the frontend. Only
/// reachable by very large hunks that already survived the byte cap above.
pub(crate) const MAX_DIFF_LINES: usize = 5000;

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiffLine {
    pub(crate) kind: DiffLineKind,
    pub(crate) content: String,
    pub(crate) old_line_number: Option<u32>,
    pub(crate) new_line_number: Option<u32>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiffHunk {
    pub(crate) header: String,
    pub(crate) old_start: u32,
    pub(crate) old_lines: u32,
    pub(crate) new_start: u32,
    pub(crate) new_lines: u32,
    pub(crate) lines: Vec<DiffLine>,
}

/// Product-shaped diff result. Rust owns Git's unified-diff grammar entirely;
/// React only renders typed hunks and lines, never raw patch text.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum FileDiff {
    Text {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
        hunks: Vec<DiffHunk>,
        truncated: bool,
    },
    Binary {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
    #[serde(rename = "too-large")]
    TooLarge {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
        limit_bytes: u64,
    },
    Conflict {
        path: String,
        hunks: Vec<DiffHunk>,
        truncated: bool,
        detail: Option<String>,
    },
    /// Git reports a difference (a pure rename, or a mode-only change) but
    /// there is no content to render as hunks. An empty `hunks` array on
    /// `Text` would look like an unexplained parsing failure instead.
    Unchanged {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
}

pub(crate) struct ParsedDiff {
    pub(crate) hunks: Vec<DiffHunk>,
    pub(crate) truncated: bool,
}

pub(crate) fn parse_range(value: &str) -> Option<(u32, u32)> {
    if let Some((start, count)) = value.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((value.parse().ok()?, 1))
    }
}

/// Parses a hunk header line, e.g. `@@ -3,7 +3,6 @@ optional section text`.
/// A side's count is omitted by Git when it is exactly 1 (`@@ -3 +3,2 @@`).
pub(crate) fn parse_hunk_header(line: &str) -> Option<(u32, u32, u32, u32)> {
    let rest = line.strip_prefix("@@ -")?;
    let close = rest.find(" @@")?;
    let ranges = &rest[..close];
    let (old, new) = ranges.split_once(" +")?;
    let (old_start, old_lines) = parse_range(old)?;
    let (new_start, new_lines) = parse_range(new)?;
    Some((old_start, old_lines, new_start, new_lines))
}

/// Parses unified-diff text into typed hunks and lines. Git always separates
/// diff lines with `\n`, even for files whose *content* uses CRLF, so
/// splitting on `\n` alone is correct: a trailing `\r` that belongs to the
/// file's own line ending is left in the line content rather than stripped.
/// Everything before the first hunk header (`diff --git`, `index`, `---`,
/// `+++`, `similarity index`, `rename from/to`, ...) is skipped.
pub(crate) fn parse_diff_body(text: &str) -> ParsedDiff {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut truncated = false;
    let mut total_lines = 0usize;
    let mut old_line = 0u32;
    let mut new_line = 0u32;

    for line in text.split('\n') {
        if truncated {
            break;
        }

        if line.starts_with("@@ -") {
            if let Some((old_start, old_lines, new_start, new_lines)) = parse_hunk_header(line) {
                old_line = old_start;
                new_line = new_start;
                hunks.push(DiffHunk {
                    header: line.to_string(),
                    old_start,
                    old_lines,
                    new_start,
                    new_lines,
                    lines: Vec::new(),
                });
            }
            continue;
        }

        let Some(current_hunk) = hunks.last_mut() else {
            continue;
        };

        let (kind, content, old_number, new_number) = if let Some(content) = line.strip_prefix(' ')
        {
            let numbers = (Some(old_line), Some(new_line));
            old_line += 1;
            new_line += 1;
            (DiffLineKind::Context, content, numbers.0, numbers.1)
        } else if let Some(content) = line.strip_prefix('+') {
            let number = new_line;
            new_line += 1;
            (DiffLineKind::Addition, content, None, Some(number))
        } else if let Some(content) = line.strip_prefix('-') {
            let number = old_line;
            old_line += 1;
            (DiffLineKind::Deletion, content, Some(number), None)
        } else {
            // `\ No newline at end of file`, or anything else this parser
            // does not model, is not a content line.
            continue;
        };

        current_hunk.lines.push(DiffLine {
            kind,
            content: content.to_string(),
            old_line_number: old_number,
            new_line_number: new_number,
        });
        total_lines += 1;
        if total_lines >= MAX_DIFF_LINES {
            truncated = true;
        }
    }

    ParsedDiff { hunks, truncated }
}

pub(crate) fn is_binary_diff_output(text: &str) -> bool {
    text.lines()
        .any(|line| line.starts_with("Binary files ") && line.trim_end().ends_with(" differ"))
}

pub(crate) enum DiffStrategy {
    /// The ordinary case: compare the worktree against `HEAD` (or the empty
    /// tree on an unborn branch). `git diff <base> -- <path>` reflects the
    /// complete unsaved change regardless of whether it is staged, unstaged,
    /// or both, because Git compares the worktree file to `<base>` directly.
    AgainstBase,
    /// A file `git status` reports as untracked has no entry in the index or
    /// `HEAD`, so `git diff HEAD` silently ignores it. `git diff --no-index`
    /// against a genuinely empty temporary file produces a pure-addition
    /// diff without relying on `/dev/null`, which is not a reliable sentinel
    /// path across platforms.
    Untracked,
    /// Restricts the base comparison to both the old and new paths so Git's
    /// rename pairing has both sides of the pair to match.
    Rename,
}

/// Resolves the base revision for `AgainstBase`/`Rename` diffs: `HEAD` when
/// it exists, otherwise the empty tree so new files on an unborn branch
/// render as additions instead of failing.
pub(crate) fn diff_base_rev(path: &str) -> Result<String, AppError> {
    let head = run_git(path, &["rev-parse", "--verify", "-q", "HEAD"])?;
    Ok(if head.status.success() {
        "HEAD".to_string()
    } else {
        EMPTY_TREE_HASH.to_string()
    })
}

/// Writes a genuinely empty temporary file and runs `git diff --no-index`
/// against it, then removes the temporary file. The temporary path is
/// absolute and outside the repository; `--no-index` accepts arbitrary
/// filesystem paths on either side, so this does not depend on the
/// repository's working directory.
pub(crate) fn run_untracked_diff(path: &str, file_path: &str) -> Result<CappedOutput, AppError> {
    let mut temp_path = std::env::temp_dir();
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    temp_path.push(format!(
        "gitodrile-empty-{}-{unique}.tmp",
        std::process::id()
    ));
    std::fs::write(&temp_path, b"").map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable.")
    })?;
    let temp_path_string = temp_path.to_string_lossy().to_string();

    let result = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-index",
            "--",
            &temp_path_string,
            file_path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    );
    let _ = std::fs::remove_file(&temp_path);
    result
}

pub(crate) fn run_diff_command(
    path: &str,
    strategy: &DiffStrategy,
    entry: &RawStatusEntry,
) -> Result<CappedOutput, AppError> {
    match strategy {
        DiffStrategy::AgainstBase => {
            let base = diff_base_rev(path)?;
            run_git_capped(
                path,
                &[
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    &base,
                    "--",
                    &entry.path,
                ],
                MAX_DIFF_OUTPUT_BYTES,
            )
        }
        DiffStrategy::Rename => {
            let base = diff_base_rev(path)?;
            let original = entry.original_path.as_deref().unwrap_or(&entry.path);
            run_git_capped(
                path,
                &[
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    "-M",
                    &base,
                    "--",
                    original,
                    &entry.path,
                ],
                MAX_DIFF_OUTPUT_BYTES,
            )
        }
        DiffStrategy::Untracked => run_untracked_diff(path, &entry.path),
    }
}

/// `git diff --no-index` mirrors the standalone `diff` command's exit codes:
/// 0 means no differences, 1 means differences were found (not an error), and
/// 2+ means real trouble. Every other diff invocation in this module uses
/// Git's ordinary in-repository exit convention, where 0 always means success
/// regardless of whether differences were found.
pub(crate) fn diff_output_is_success(strategy: &DiffStrategy, output: &CappedOutput) -> bool {
    match strategy {
        DiffStrategy::Untracked => matches!(output.status.code(), Some(0) | Some(1)),
        DiffStrategy::AgainstBase | DiffStrategy::Rename => output.status.success(),
    }
}

/// Shared by the single-file (`read_file_diff`) and batched
/// (`read_working_tree_diffs`) paths, so a file's classification (binary,
/// too-large, unchanged, text-with-hunks) never depends on which path fetched
/// it. `too_large` is decided by the caller: the single-file path checks
/// `CappedOutput::limit_exceeded` from its own dedicated-size invocation,
/// while the batch path checks each file's *section* length against the same
/// `MAX_DIFF_OUTPUT_BYTES` threshold, since the whole combined invocation is
/// capped much higher.
pub(crate) fn diff_result_from_text(
    entry: &RawStatusEntry,
    text: &str,
    too_large: bool,
) -> FileDiff {
    if too_large {
        return FileDiff::TooLarge {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        };
    }

    if is_binary_diff_output(text) {
        return FileDiff::Binary {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
        };
    }

    let parsed = parse_diff_body(text);
    if parsed.hunks.is_empty() {
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
        };
    }

    FileDiff::Text {
        path: entry.path.clone(),
        original_path: entry.original_path.clone(),
        change: entry.category,
        hunks: parsed.hunks,
        truncated: parsed.truncated,
    }
}

pub(crate) fn build_text_result(entry: &RawStatusEntry, output: &CappedOutput) -> FileDiff {
    diff_result_from_text(
        entry,
        &String::from_utf8_lossy(&output.stdout),
        output.limit_exceeded,
    )
}

/// Conflict inspection is informational only (see task decisions), so a
/// diff that cannot be produced is reported as an honest conflict-specific
/// explanation rather than failing the whole command.
pub(crate) fn build_conflict_result(path: &str, entry: &RawStatusEntry) -> FileDiff {
    let unavailable = || FileDiff::Conflict {
        path: entry.path.clone(),
        hunks: Vec::new(),
        truncated: false,
        detail: Some("unavailable".to_string()),
    };

    let Ok(base) = diff_base_rev(path) else {
        return unavailable();
    };
    let Ok(output) = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            &base,
            "--",
            &entry.path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    ) else {
        return unavailable();
    };
    if output.limit_exceeded {
        return FileDiff::Conflict {
            path: entry.path.clone(),
            hunks: Vec::new(),
            truncated: false,
            detail: Some("too-large".to_string()),
        };
    }
    if !output.status.success() {
        return unavailable();
    }

    let text = String::from_utf8_lossy(&output.stdout);
    if is_binary_diff_output(&text) {
        return FileDiff::Conflict {
            path: entry.path.clone(),
            hunks: Vec::new(),
            truncated: false,
            detail: Some("binary".to_string()),
        };
    }

    let parsed = parse_diff_body(&text);
    FileDiff::Conflict {
        path: entry.path.clone(),
        hunks: parsed.hunks,
        truncated: parsed.truncated,
        detail: None,
    }
}

/// Rejects absolute paths, parent traversal, and Windows drive/UNC prefixes
/// before the path is ever considered for lookup. Membership in the freshly
/// read status (checked afterwards) is the authoritative containment check;
/// this is a cheap, fast-failing first line of defense.
pub(crate) fn validate_repo_relative_path(file_path: &str) -> Result<(), AppError> {
    let invalid = || {
        AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
            .with_remediation("Refresh the changes list and choose the file again.")
    };
    if file_path.is_empty() {
        return Err(invalid());
    }
    let path = Path::new(file_path);
    if path.is_absolute() {
        return Err(invalid());
    }
    let has_unsafe_component = path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir
                | std::path::Component::Prefix(_)
                | std::path::Component::RootDir
        )
    });
    if has_unsafe_component {
        return Err(invalid());
    }
    Ok(())
}

pub(crate) fn read_file_diff(path: String, file_path: String) -> Result<FileDiff, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "read_file_diff", None)?;
    validate_repo_relative_path(&file_path)?;

    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::PathMissing,
                "This project's folder is no longer there.",
            )
            .with_remediation("Open the project again, or choose another folder.")
        } else {
            AppError::new(
                AppErrorCode::PathUnusable,
                "This project's folder can't be read.",
            )
            .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's path isn't a folder any more.",
        )
        .with_remediation("Open the project again."));
    }

    let status_output = run_git(&path, &STATUS_ARGS)?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let entry = find_status_entry(&status_output.stdout, &file_path)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::PathNotChanged,
            "This file is no longer part of the unsaved changes.",
        )
        .with_remediation("Refresh the list and choose a file that is still listed.")
    })?;

    if entry.category == ChangeCategory::Conflicted {
        return Ok(build_conflict_result(&path, &entry));
    }

    let strategy = if entry.category == ChangeCategory::Renamed {
        DiffStrategy::Rename
    } else if entry.is_untracked {
        DiffStrategy::Untracked
    } else {
        DiffStrategy::AgainstBase
    };

    let output = run_diff_command(&path, &strategy, &entry)?;
    if output.limit_exceeded {
        return Ok(build_text_result(&entry, &output));
    }
    if !diff_output_is_success(&strategy, &output) {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    Ok(build_text_result(&entry, &output))
}

// ---- Batched working-tree diffs (extra optimization, task 010) ----
//
// `read_file_diff` spawns at least two Git processes per call (a fresh
// status re-validation plus a dedicated `git diff` for that one path), which
// is the dominant cost when switching between files quickly — not IPC, not
// parsing. This command answers "the diff for every currently changed file"
// with one `git status` and, for ordinary tracked changes, exactly one more
// `git diff` process covering all of them at once. The frontend uses it to
// warm its cache right after the working tree loads, so most clicks become
// pure cache hits instead of a fresh process spawn. It is a read-only,
// best-effort *supplement* to `read_file_diff`, not a replacement: entries it
// cannot or does not cover (conflicts, a file whose section did not fit
// before the combined output was capped, or a failed batch) are simply
// absent from the result, and the frontend falls back to `read_file_diff`
// for exactly those paths.

/// Higher than `MAX_DIFF_OUTPUT_BYTES` (which bounds one file) because this
/// covers every ordinary tracked change in the project at once. Still bounded
/// so a pathological changeset can't block the UI or balloon the IPC payload;
/// see `batch_tracked_diffs` for how a cap mid-file is handled safely.
pub(crate) const MAX_BATCH_DIFF_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

/// Git's own heuristic for "treat this as binary": a NUL byte anywhere in a
/// bounded prefix. Only needed for untracked files, which this command reads
/// directly from disk instead of spawning `git diff --no-index` per file;
/// every other path's binary detection still goes through Git's own output
/// (`is_binary_diff_output`), which stays authoritative there.
pub(crate) const BINARY_SNIFF_BYTES: usize = 8000;

pub(crate) fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_BYTES).any(|&byte| byte == 0)
}

/// Splits `text` into per-file sections at each line beginning with
/// `diff --git `, without needing to parse (and possibly un-quote) the path
/// on that line. Sections are returned in the same order Git printed them,
/// which — for the identical base/flags/pathspec — is also the order
/// `--name-only -z` reports, so the two can be zipped positionally.
pub(crate) fn split_diff_sections(text: &str) -> Vec<&str> {
    const MARKER: &str = "diff --git ";
    let mut starts: Vec<usize> = Vec::new();
    if text.starts_with(MARKER) {
        starts.push(0);
    }
    let mut search_from = 0;
    while let Some(relative) = text[search_from..].find("\ndiff --git ") {
        let start = search_from + relative + 1;
        starts.push(start);
        search_from = start + MARKER.len();
    }
    starts
        .iter()
        .enumerate()
        .map(|(index, &start)| {
            let end = starts.get(index + 1).copied().unwrap_or(text.len());
            &text[start..end]
        })
        .collect()
}

/// Splits file content into lines the same way `parse_diff_body` treats
/// hunk lines: on `\n` only (never touching a lone `\r`, which belongs to the
/// file's own CRLF line endings), and without fabricating a phantom trailing
/// empty line for a file that ends with a newline.
pub(crate) fn split_content_lines(content: &str) -> Vec<&str> {
    if content.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<&str> = content.split('\n').collect();
    if content.ends_with('\n') {
        lines.pop();
    }
    lines
}

/// Builds an untracked file's diff by reading it directly from disk instead
/// of spawning `git diff --no-index` — an untracked file's diff is always
/// "every line is an addition," which needs no Git process to compute.
pub(crate) fn untracked_file_diff(repo_path: &Path, entry: &RawStatusEntry) -> FileDiff {
    let full_path = repo_path.join(&entry.path);
    let Ok(bytes) = std::fs::read(&full_path) else {
        // Unreadable (permissions, a broken symlink, a race with deletion):
        // report it as absent from the batch rather than guessing; the
        // frontend's per-file fallback will surface a proper error.
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    };

    if bytes.len() as u64 > MAX_DIFF_OUTPUT_BYTES as u64 {
        return FileDiff::TooLarge {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        };
    }
    if looks_binary(&bytes) {
        return FileDiff::Binary {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }

    let text = String::from_utf8_lossy(&bytes);
    let lines = split_content_lines(&text);
    if lines.is_empty() {
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }

    let truncated = lines.len() > MAX_DIFF_LINES;
    let included = if truncated {
        &lines[..MAX_DIFF_LINES]
    } else {
        &lines[..]
    };
    let diff_lines = included
        .iter()
        .enumerate()
        .map(|(index, content)| DiffLine {
            kind: DiffLineKind::Addition,
            content: (*content).to_string(),
            old_line_number: None,
            new_line_number: Some(index as u32 + 1),
        })
        .collect::<Vec<_>>();

    FileDiff::Text {
        path: entry.path.clone(),
        original_path: None,
        change: entry.category,
        hunks: vec![DiffHunk {
            header: format!("@@ -0,0 +1,{} @@", diff_lines.len()),
            old_start: 0,
            old_lines: 0,
            new_start: 1,
            new_lines: diff_lines.len() as u32,
            lines: diff_lines,
        }],
        truncated,
    }
}

/// Batches every ordinary (non-conflicted, tracked) change into one `git
/// diff` process. Renamed entries contribute both their old and new path to
/// the pathspec, matching the single-file `Rename` strategy, so Git's rename
/// pairing still has both sides to match.
pub(crate) fn batch_tracked_diffs(
    path: &str,
    base: &str,
    entries: &[&RawStatusEntry],
) -> Result<Vec<FileDiff>, AppError> {
    if entries.is_empty() {
        return Ok(Vec::new());
    }

    let mut pathspecs: Vec<&str> = Vec::with_capacity(entries.len() * 2);
    for entry in entries {
        if let Some(original) = &entry.original_path {
            pathspecs.push(original);
        }
        pathspecs.push(&entry.path);
    }

    // Pass 1: the ordered, unambiguous list of paths this exact diff will
    // emit sections for. `-z` keeps it NUL-separated so no path (however it
    // would otherwise need quoting) can be misread.
    let mut name_args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "-M",
        "-z",
        "--name-only",
        base,
        "--",
    ];
    name_args.extend(pathspecs.iter().copied());
    let name_output = run_git(path, &name_args)?;
    if !name_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't list which files changed.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    let ordered_paths: Vec<String> = name_output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|segment| !segment.is_empty())
        .map(|segment| String::from_utf8_lossy(segment).into_owned())
        .collect();

    // Pass 2: the actual patch text, from the identical base/flags/pathspec,
    // so Git computes and orders it identically to pass 1.
    let mut diff_args = vec!["diff", "--no-color", "--no-ext-diff", "-M", base, "--"];
    diff_args.extend(pathspecs.iter().copied());
    let capped = run_git_capped(path, &diff_args, MAX_BATCH_DIFF_OUTPUT_BYTES)?;
    if !capped.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read these files' differences.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let text = String::from_utf8_lossy(&capped.stdout);
    let mut sections = split_diff_sections(&text);
    if capped.limit_exceeded {
        // The combined output was cut mid-stream, so the last section (if
        // any) may be an incomplete file rather than a real one. Dropping it
        // is always safe: every path it would have covered still gets a
        // result from the frontend's per-file fallback.
        sections.pop();
    }

    let mut results = Vec::with_capacity(sections.len());
    for (name, section) in ordered_paths.iter().zip(sections.iter()) {
        let Some(entry) = entries.iter().find(|entry| &entry.path == name) else {
            // A rename's *old* path can appear here if similarity fell below
            // Git's detection threshold and it downgraded to a delete+add;
            // that old path isn't one of our known entries, so skip it.
            continue;
        };
        let too_large = section.len() > MAX_DIFF_OUTPUT_BYTES;
        results.push(diff_result_from_text(entry, section, too_large));
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASHES: &str =
        "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

    fn porcelain_v2(records: &[&str]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for record in records {
            bytes.extend_from_slice(record.as_bytes());
            bytes.push(0);
        }
        bytes
    }

    fn sample_entry(path: &str, category: ChangeCategory) -> RawStatusEntry {
        RawStatusEntry {
            path: path.to_string(),
            original_path: None,
            category,
            is_untracked: false,
            is_prepared: false,
            has_unprepared_changes: true,
        }
    }

    /// A real exit status with fabricated stdout, for testing the pure
    /// stdout, for testing the pure functions that turn `git diff` output
    /// into a `FileDiff` without needing a matching real diff to produce it.
    fn fake_output(stdout: &str) -> CappedOutput {
        let real = base_git_command()
            .arg("--version")
            .output()
            .expect("run git --version");
        CappedOutput {
            stdout: stdout.as_bytes().to_vec(),
            status: real.status,
            limit_exceeded: stdout.len() > MAX_DIFF_OUTPUT_BYTES,
        }
    }

    #[test]
    fn parse_hunk_header_parses_standard_and_omitted_counts() {
        assert_eq!(
            parse_hunk_header("@@ -3,7 +3,6 @@ fn foo() {"),
            Some((3, 7, 3, 6))
        );
        assert_eq!(parse_hunk_header("@@ -1 +1,2 @@"), Some((1, 1, 1, 2)));
        assert_eq!(parse_hunk_header("@@ -0,0 +1,3 @@"), Some((0, 0, 1, 3)));
        assert_eq!(parse_hunk_header("not a header"), None);
    }

    #[test]
    fn parse_diff_body_numbers_context_addition_and_deletion_lines() {
        let text = "diff --git a/f.txt b/f.txt\nindex 111..222 100644\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context2\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 1);
        let lines = &parsed.hunks[0].lines;
        assert_eq!(
            lines[0],
            DiffLine {
                kind: DiffLineKind::Context,
                content: "context".to_string(),
                old_line_number: Some(1),
                new_line_number: Some(1),
            }
        );
        assert_eq!(
            lines[1],
            DiffLine {
                kind: DiffLineKind::Deletion,
                content: "old".to_string(),
                old_line_number: Some(2),
                new_line_number: None,
            }
        );
        assert_eq!(
            lines[2],
            DiffLine {
                kind: DiffLineKind::Addition,
                content: "new".to_string(),
                old_line_number: None,
                new_line_number: Some(2),
            }
        );
        assert_eq!(
            lines[3],
            DiffLine {
                kind: DiffLineKind::Context,
                content: "context2".to_string(),
                old_line_number: Some(3),
                new_line_number: Some(3),
            }
        );
        assert!(!parsed.truncated);
    }

    #[test]
    fn parse_diff_body_handles_multiple_hunks() {
        let text = "@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,1 +10,1 @@\n-c\n+d\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 2);
        assert_eq!(parsed.hunks[0].old_start, 1);
        assert_eq!(parsed.hunks[1].old_start, 10);
    }

    #[test]
    fn parse_diff_body_ignores_the_no_newline_marker() {
        let text = "@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks[0].lines.len(), 2);
    }

    #[test]
    fn parse_diff_body_truncates_after_the_line_cap() {
        let mut text = String::from("@@ -1,1 +1,20000 @@\n");
        for index in 0..MAX_DIFF_LINES + 50 {
            text.push_str(&format!("+line {index}\n"));
        }

        let parsed = parse_diff_body(&text);

        assert!(parsed.truncated);
        assert_eq!(parsed.hunks[0].lines.len(), MAX_DIFF_LINES);
    }

    #[test]
    fn build_text_result_flags_binary_marker_output() {
        let entry = sample_entry("image.png", ChangeCategory::Changed);
        let output = fake_output("Binary files a/image.png and b/image.png differ\n");

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Binary { .. }
        ));
    }

    #[test]
    fn build_text_result_flags_output_over_the_byte_limit() {
        let entry = sample_entry("huge.txt", ChangeCategory::Changed);
        let big = "a".repeat(MAX_DIFF_OUTPUT_BYTES + 1);
        let output = fake_output(&big);

        match build_text_result(&entry, &output) {
            FileDiff::TooLarge { limit_bytes, .. } => {
                assert_eq!(limit_bytes, MAX_DIFF_OUTPUT_BYTES as u64);
            }
            other => panic!("expected too-large, got {other:?}"),
        }
    }

    #[test]
    fn build_text_result_returns_unchanged_for_a_pure_rename_header() {
        let entry = RawStatusEntry {
            path: "new.txt".to_string(),
            original_path: Some("old.txt".to_string()),
            category: ChangeCategory::Renamed,
            is_untracked: false,
            is_prepared: true,
            has_unprepared_changes: false,
        };
        let output = fake_output(
            "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n",
        );

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Unchanged { .. }
        ));
    }

    #[test]
    fn validate_repo_relative_path_rejects_absolute_and_traversal_paths() {
        assert_eq!(
            validate_repo_relative_path("").unwrap_err().code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("/etc/passwd").unwrap_err().code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("../outside.txt")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("src/../../outside.txt")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn validate_repo_relative_path_rejects_a_windows_drive_path() {
        assert_eq!(
            validate_repo_relative_path("C:/Windows/system.ini")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
    }

    #[test]
    fn validate_repo_relative_path_accepts_ordinary_relative_paths() {
        assert!(validate_repo_relative_path("src/main.rs").is_ok());
        assert!(validate_repo_relative_path("a file — ñ.txt").is_ok());
    }

    #[test]
    fn checked_status_rejects_a_path_that_cannot_be_represented_losslessly() {
        let stdout = b"? invalid-\xff-name.txt\0";
        let error = checked_status_records(stdout)
            .err()
            .expect("invalid UTF-8 should return a structured error");

        assert_eq!(error.code, AppErrorCode::PathEncodingUnsupported);
    }

    #[test]
    fn find_status_entry_distinguishes_untracked_from_staged_new() {
        let stdout = porcelain_v2(&[
            &format!("1 A. N... 100644 100644 100644 {HASHES} staged-new.txt"),
            "? untracked-new.txt",
        ]);

        let staged = find_status_entry(&stdout, "staged-new.txt")
            .expect("status should parse")
            .expect("staged entry should be found");
        assert_eq!(staged.category, ChangeCategory::New);
        assert!(!staged.is_untracked);

        let untracked = find_status_entry(&stdout, "untracked-new.txt")
            .expect("status should parse")
            .expect("untracked entry should be found");
        assert_eq!(untracked.category, ChangeCategory::New);
        assert!(untracked.is_untracked);
    }

    #[test]
    fn find_status_entry_keeps_both_sides_of_a_rename() {
        let stdout = porcelain_v2(&[
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 new name.txt"),
            "old name.txt",
        ]);

        let entry = find_status_entry(&stdout, "new name.txt")
            .expect("status should parse")
            .expect("rename entry should be found");
        assert_eq!(entry.category, ChangeCategory::Renamed);
        assert_eq!(entry.original_path.as_deref(), Some("old name.txt"));
    }
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitFileChange {
    pub(crate) path: String,
    /// Only set for a detected rename/copy: where the file came from.
    pub(crate) original_path: Option<String>,
    pub(crate) category: ChangeCategory,
}

/// Classifies one `git show --name-status` line. Reuses the same
/// `ChangeCategory` vocabulary (and, on the frontend, the same icons) as the
/// working-tree Changes list, so a saved version's file summary and the
/// Changes screen can never disagree about what a category means. A type
/// change (`T`) is presented as `Changed` — GitOdrile doesn't have a distinct
/// category for that rare case, and it *is* still a modification to the file.
pub(crate) fn parse_name_status_line(line: &str) -> Option<CommitFileChange> {
    let mut parts = line.split('\t');
    let status = parts.next()?;
    let first_path = parts.next()?;
    match status.as_bytes().first()? {
        b'A' => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::New,
        }),
        b'D' => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::Deleted,
        }),
        b'R' | b'C' => {
            let new_path = parts.next()?.to_string();
            Some(CommitFileChange {
                path: new_path,
                original_path: Some(first_path.to_string()),
                category: ChangeCategory::Renamed,
            })
        }
        _ => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::Changed,
        }),
    }
}

/// A commit hash reaching any of these commands always comes from GitOdrile's
/// own previously displayed list (`SavedVersionSummary`/`CommitFileChange`),
/// never free-typed by the user — but since it still becomes a `git` process
/// argument, this rejects the one shape that could be misread as a flag
/// instead of a revision.
pub(crate) fn validate_commit_ish(commit: &str) -> Result<(), AppError> {
    if commit.is_empty() || commit.starts_with('-') {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        ));
    }
    Ok(())
}

/// Read-only, local-only file summary for one already-saved commit — the
/// "very summarized" per-version detail shown inline in the publish preview,
/// deliberately not the full line-by-line diff the Changes screen shows.
/// `git show` handles a root commit (no parent) the same way it handles any
/// other commit, listing every file as added, so no special case is needed.
pub(crate) fn read_commit_file_changes(
    path: String,
    commit: String,
) -> Result<Vec<CommitFileChange>, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_commit_file_changes", None)?;
    validate_commit_ish(&commit)?;
    let output = run_git(
        &path,
        &[
            "show",
            "--no-color",
            "--format=",
            "--name-status",
            "-M",
            &commit,
        ],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdrile couldn't read that saved version's changed files.",
        )
        .with_remediation("Refresh and try again."));
    }
    Ok(git_stdout(&output)
        .lines()
        .filter_map(parse_name_status_line)
        .collect())
}

/// The line-by-line diff for one file within one already-saved commit — the
/// second level of the Overview's "view changes" flow, once a specific file
/// from `read_commit_file_changes` is picked. Reuses the exact same
/// `RawStatusEntry`/`diff_result_from_text` pipeline the working-tree diff
/// commands use, so a file's classification (binary/too-large/unchanged/text)
/// can never disagree between an unsaved change and an already-saved one —
/// only the `git show`/`--name-status` step that determined `category` and
/// `original_path` here comes from a commit instead of the working tree.
pub(crate) fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
) -> Result<FileDiff, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_commit_file_diff", None)?;
    validate_repo_relative_path(&file_path)?;
    validate_commit_ish(&commit)?;

    let status_output = run_git(
        &path,
        &[
            "show",
            "--no-color",
            "--format=",
            "--name-status",
            "-M",
            &commit,
            "--",
            &file_path,
        ],
    )?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdrile couldn't check that saved version's changes.",
        )
        .with_remediation("Refresh and try again."));
    }
    let Some(change) = git_stdout(&status_output)
        .lines()
        .find_map(parse_name_status_line)
    else {
        return Err(AppError::new(
            AppErrorCode::PathNotChanged,
            "This file isn't part of that saved version.",
        )
        .with_remediation("Refresh and choose a file that is still listed."));
    };
    let entry = RawStatusEntry {
        path: change.path,
        original_path: change.original_path,
        category: change.category,
        is_untracked: false,
        is_prepared: false,
        has_unprepared_changes: false,
    };

    let output = run_git_capped(
        &path,
        &[
            "show",
            "--no-color",
            "--no-ext-diff",
            "--format=",
            "-M",
            &commit,
            "--",
            &file_path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    )?;
    if output.limit_exceeded {
        return Ok(build_text_result(&entry, &output));
    }
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    Ok(build_text_result(&entry, &output))
}

// ---- Expanding the unchanged lines between hunks (task 035) ----
//
// A diff carries only what changed plus its immediate context, so the gap a
// hunk marker announces ("122 unchanged lines") is not in the payload at all.
// Making that marker expandable therefore needs the file's own text.
//
// The working-tree copy is the right source: these lines are unchanged by
// definition, so both sides of the diff agree on them, and reading the file
// on disk needs no Git process. A deleted file has no working-tree copy, but
// a deletion has no unchanged gaps to expand either.
//
// Two bounds, for the same reason `MAX_DIFF_OUTPUT_BYTES` exists: a request
// is capped at `MAX_EXPANDED_LINES` lines so one click can't pull a whole
// generated file into the renderer, and the file itself is not opened past
// `MAX_EXPANDABLE_FILE_BYTES`.
pub(crate) const MAX_EXPANDED_LINES: usize = 500;
pub(crate) const MAX_EXPANDABLE_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileLines {
    /// Echoed back 1-based, so a caller can confirm which range it received.
    pub(crate) start_line: u32,
    pub(crate) lines: Vec<String>,
    /// True when the requested range was cut short by `MAX_EXPANDED_LINES`.
    /// The Changes screen does not read it — it derives what is left from the
    /// gap size minus what it has already collected, which stays correct
    /// across repeated expansions — but it keeps the response self-describing
    /// for any caller that asks for a range in one go.
    pub(crate) truncated: bool,
}

pub(crate) fn read_file_lines(
    path: String,
    file_path: String,
    start_line: u32,
    end_line: u32,
) -> Result<FileLines, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "read_file_lines", None)?;
    validate_repo_relative_path(&file_path)?;
    if start_line == 0 || end_line < start_line {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That line range isn't valid.")
                .with_remediation("Refresh the changes list and try again."),
        );
    }

    // `validate_repo_relative_path` rejects `..` and absolute paths, but it
    // works on the string alone — a symlink committed inside the repository
    // would still resolve outside it. Unlike `read_file_diff`, which
    // re-validates its path against a fresh `git status`, this command runs on
    // a click and cannot afford a Git process, so it confirms containment by
    // resolving both ends instead.
    let repo_root = Path::new(&path).canonicalize().map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "This project's folder can't be read.",
        )
        .with_remediation("Open the project again, or choose another folder.")
    })?;
    let full_path = repo_root.join(&file_path).canonicalize().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "This file is no longer there.")
                .with_remediation("Refresh the changes list.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
                .with_remediation("Check the file permissions and try again.")
        }
    })?;
    if !full_path.starts_with(&repo_root) {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
                .with_remediation("Refresh the changes list and choose the file again."),
        );
    }

    let metadata = full_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "This file is no longer there.")
                .with_remediation("Refresh the changes list.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
                .with_remediation("Check the file permissions and try again.")
        }
    })?;
    if !metadata.is_file() {
        return Err(
            AppError::new(AppErrorCode::PathUnusable, "That path isn't a file.")
                .with_remediation("Refresh the changes list."),
        );
    }
    if metadata.len() > MAX_EXPANDABLE_FILE_BYTES {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This file is too large to show more of here.",
        )
        .with_remediation("Open it in your editor to read the surrounding lines."));
    }

    let contents = std::fs::read(&full_path).map_err(|_| {
        AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
            .with_remediation("Check the file permissions and try again.")
    })?;
    let text = String::from_utf8(contents).map_err(|_| {
        AppError::new(
            AppErrorCode::PathEncodingUnsupported,
            "This file isn't readable as text.",
        )
        .with_remediation("Open it in your editor instead.")
    })?;

    // 1-based, inclusive, and clamped to the file rather than erroring: the
    // caller's range comes from a diff that may be a moment out of date, and
    // showing the lines that do exist beats refusing the whole request.
    let start_index = (start_line - 1) as usize;
    let end_index = end_line as usize;
    let all_lines: Vec<&str> = text.lines().collect();
    if start_index >= all_lines.len() {
        return Ok(FileLines {
            start_line,
            lines: Vec::new(),
            truncated: false,
        });
    }
    let available = &all_lines[start_index..end_index.min(all_lines.len())];
    let truncated = available.len() > MAX_EXPANDED_LINES;
    let lines = available
        .iter()
        .take(MAX_EXPANDED_LINES)
        .map(|line| (*line).to_string())
        .collect();

    Ok(FileLines {
        start_line,
        lines,
        truncated,
    })
}

pub(crate) fn read_working_tree_diffs(path: String) -> Result<Vec<FileDiff>, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_working_tree_diffs", None)?;
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::PathMissing,
                "This project's folder is no longer there.",
            )
            .with_remediation("Open the project again, or choose another folder.")
        } else {
            AppError::new(
                AppErrorCode::PathUnusable,
                "This project's folder can't be read.",
            )
            .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's path isn't a folder any more.",
        )
        .with_remediation("Open the project again."));
    }

    let status_output = run_git(&path, &STATUS_ARGS)?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    let records = checked_status_records(&status_output.stdout)?;

    let tracked_entries: Vec<&RawStatusEntry> = records
        .entries
        .iter()
        .filter(|entry| entry.category != ChangeCategory::Conflicted && !entry.is_untracked)
        .collect();
    let untracked_entries: Vec<&RawStatusEntry> = records
        .entries
        .iter()
        .filter(|entry| entry.is_untracked)
        .collect();

    let mut results = if tracked_entries.is_empty() {
        Vec::new()
    } else {
        let base = diff_base_rev(&path)?;
        batch_tracked_diffs(&path, &base, &tracked_entries)?
    };
    results.extend(
        untracked_entries
            .iter()
            .map(|entry| untracked_file_diff(repo_path, entry)),
    );
    Ok(results)
}
