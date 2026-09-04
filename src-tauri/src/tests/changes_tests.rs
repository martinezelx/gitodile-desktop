use crate::test_support::*;
use crate::*;
use std::fs;

#[test]
fn read_file_diff_reports_an_unstaged_modification_with_line_numbers() {
    let path = unique_temp_dir("diff-unstaged");
    git_init(&path);
    write_file(&path, "file.txt", "one\ntwo\nthree\n");
    git_add(&path, "file.txt");
    git_commit(&path, "add file");
    write_file(&path, "file.txt", "one\nTWO\nthree\n");

    let diff = read_file_diff(path.clone(), "file.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Text {
            hunks,
            change,
            truncated,
            ..
        } => {
            assert_eq!(change, ChangeCategory::Changed);
            assert!(!truncated);
            let deletion = hunks[0]
                .lines
                .iter()
                .find(|line| line.kind == DiffLineKind::Deletion)
                .expect("a deletion line");
            assert_eq!(deletion.content, "two");
            assert_eq!(deletion.old_line_number, Some(2));
            let addition = hunks[0]
                .lines
                .iter()
                .find(|line| line.kind == DiffLineKind::Addition)
                .expect("an addition line");
            assert_eq!(addition.content, "TWO");
            assert_eq!(addition.new_line_number, Some(2));
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_lines_returns_an_inclusive_one_based_range() {
    let path = unique_temp_dir("expand-range");
    git_init(&path);
    write_file(&path, "file.txt", "one\ntwo\nthree\nfour\nfive\n");

    let result = read_file_lines(path.clone(), "file.txt".to_string(), 2, 4)
        .expect("reading a range should succeed");
    assert_eq!(result.start_line, 2);
    assert_eq!(result.lines, vec!["two", "three", "four"]);
    assert!(!result.truncated);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_lines_clamps_a_range_that_runs_past_the_end_of_the_file() {
    let path = unique_temp_dir("expand-clamp");
    git_init(&path);
    write_file(&path, "file.txt", "one\ntwo\n");

    // The caller's range comes from a diff that may be a moment stale, so
    // overshooting returns what exists rather than failing.
    let result = read_file_lines(path.clone(), "file.txt".to_string(), 2, 99)
        .expect("an overshooting range should still succeed");
    assert_eq!(result.lines, vec!["two"]);

    // Starting past the end is empty, not an error.
    let past_end = read_file_lines(path.clone(), "file.txt".to_string(), 50, 60)
        .expect("a range past the end should still succeed");
    assert!(past_end.lines.is_empty());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_lines_caps_how_much_one_request_can_pull_in() {
    let path = unique_temp_dir("expand-cap");
    git_init(&path);
    let body: String = (0..(MAX_EXPANDED_LINES + 50))
        .map(|index| format!("line {index}\n"))
        .collect();
    write_file(&path, "file.txt", &body);

    let result = read_file_lines(path.clone(), "file.txt".to_string(), 1, 99_999)
        .expect("a capped range should succeed");
    assert_eq!(result.lines.len(), MAX_EXPANDED_LINES);
    assert!(result.truncated);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_lines_rejects_paths_and_ranges_it_cannot_trust() {
    let path = unique_temp_dir("expand-reject");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");

    assert!(read_file_lines(path.clone(), "../outside.txt".to_string(), 1, 2).is_err());
    assert!(read_file_lines(path.clone(), "file.txt".to_string(), 0, 2).is_err());
    assert!(read_file_lines(path.clone(), "file.txt".to_string(), 5, 2).is_err());
    assert!(read_file_lines(path.clone(), "missing.txt".to_string(), 1, 2).is_err());

    let _ = fs::remove_dir_all(&path);
}

/// A repository-relative path that passes the string check can still
/// resolve outside the repository through a symlink, so containment is
/// confirmed against the canonicalized root as well.
#[test]
fn read_file_lines_refuses_a_symlink_that_escapes_the_repository() {
    let outside = unique_temp_dir("expand-outside");
    write_file(&outside, "secret.txt", "not yours\n");
    let path = unique_temp_dir("expand-symlink");
    git_init(&path);

    let link = Path::new(&path).join("innocent.txt");
    let target = Path::new(&outside).join("secret.txt");
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&target, &link).is_ok();
    #[cfg(not(windows))]
    let linked = std::os::unix::fs::symlink(&target, &link).is_ok();

    // Creating a symlink needs a privilege Windows does not grant by
    // default; skip rather than fail when the platform said no.
    if linked {
        assert!(read_file_lines(path.clone(), "innocent.txt".to_string(), 1, 2).is_err());
    }

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_dir_all(&outside);
}

#[test]
fn read_file_diff_reports_a_staged_modification() {
    let path = unique_temp_dir("diff-staged");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    git_add(&path, "file.txt");
    git_commit(&path, "add file");
    write_file(&path, "file.txt", "one\ntwo\n");
    git_add(&path, "file.txt");

    let diff = read_file_diff(path.clone(), "file.txt".to_string()).expect("diff should succeed");
    assert!(matches!(diff, FileDiff::Text { .. }));

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_new_untracked_file_as_a_pure_addition() {
    let path = unique_temp_dir("diff-untracked");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "new.txt", "hello\nworld\n");

    let diff = read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Text { hunks, change, .. } => {
            assert_eq!(change, ChangeCategory::New);
            let total: usize = hunks.iter().map(|hunk| hunk.lines.len()).sum();
            assert_eq!(total, 2);
            assert!(hunks
                .iter()
                .flat_map(|hunk| &hunk.lines)
                .all(|line| line.kind == DiffLineKind::Addition));
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_stops_git_when_output_exceeds_the_byte_limit() {
    let path = unique_temp_dir("diff-output-cap");
    git_init(&path);
    git_commit_empty(&path);
    let content = "a long changed line that makes the patch grow quickly\n"
        .repeat(MAX_DIFF_OUTPUT_BYTES / 24);
    write_file(&path, "huge.txt", &content);

    let diff =
        read_file_diff(path.clone(), "huge.txt".to_string()).expect("diff should be bounded");
    match diff {
        FileDiff::TooLarge { limit_bytes, .. } => {
            assert_eq!(limit_bytes, MAX_DIFF_OUTPUT_BYTES as u64);
        }
        other => panic!("expected too-large, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_new_staged_file_as_a_pure_addition() {
    let path = unique_temp_dir("diff-staged-new");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "new.txt", "hello\n");
    git_add(&path, "new.txt");

    let diff = read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Text { hunks, .. } => {
            assert_eq!(hunks[0].lines[0].kind, DiffLineKind::Addition);
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_deleted_file_as_a_pure_deletion() {
    let path = unique_temp_dir("diff-deleted");
    git_init(&path);
    write_file(&path, "gone.txt", "bye\n");
    git_add(&path, "gone.txt");
    git_commit(&path, "add file");
    fs::remove_file(Path::new(&path).join("gone.txt")).expect("remove file");

    let diff = read_file_diff(path.clone(), "gone.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Text { hunks, change, .. } => {
            assert_eq!(change, ChangeCategory::Deleted);
            assert!(hunks
                .iter()
                .flat_map(|hunk| &hunk.lines)
                .all(|line| line.kind == DiffLineKind::Deletion));
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_renamed_file_with_content_change() {
    let path = unique_temp_dir("diff-renamed");
    git_init(&path);
    write_file(&path, "old.txt", "one\ntwo\nthree\nfour\nfive\n");
    git_add(&path, "old.txt");
    git_commit(&path, "add file");
    fs::rename(
        Path::new(&path).join("old.txt"),
        Path::new(&path).join("new.txt"),
    )
    .expect("rename file");
    write_file(&path, "new.txt", "one\ntwo\nTHREE\nfour\nfive\n");
    git_add_all(&path);

    let diff = read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Text {
            hunks,
            change,
            original_path,
            ..
        } => {
            assert_eq!(change, ChangeCategory::Renamed);
            assert_eq!(original_path.as_deref(), Some("old.txt"));
            assert!(!hunks.is_empty());
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_pure_rename_as_unchanged() {
    let path = unique_temp_dir("diff-pure-rename");
    git_init(&path);
    write_file(&path, "old.txt", "same content\n");
    git_add(&path, "old.txt");
    git_commit(&path, "add file");
    fs::rename(
        Path::new(&path).join("old.txt"),
        Path::new(&path).join("new.txt"),
    )
    .expect("rename file");
    git_add_all(&path);

    let diff = read_file_diff(path.clone(), "new.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Unchanged {
            change,
            original_path,
            ..
        } => {
            assert_eq!(change, ChangeCategory::Renamed);
            assert_eq!(original_path.as_deref(), Some("old.txt"));
        }
        other => panic!("expected unchanged, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_new_file_on_an_unborn_branch() {
    let path = unique_temp_dir("diff-unborn");
    git_init(&path);
    write_file(&path, "first.txt", "hello\n");

    let diff = read_file_diff(path.clone(), "first.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Text { hunks, change, .. } => {
            assert_eq!(change, ChangeCategory::New);
            assert_eq!(hunks[0].lines[0].kind, DiffLineKind::Addition);
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_rejects_a_path_that_is_not_in_the_current_status() {
    let path = unique_temp_dir("diff-not-changed");
    git_init(&path);
    git_commit_empty(&path);

    let error = read_file_diff(path.clone(), "does-not-exist.txt".to_string())
        .expect_err("a path outside the status should fail");
    assert_eq!(error.code, AppErrorCode::PathNotChanged);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_rejects_a_traversal_path() {
    let path = unique_temp_dir("diff-traversal");
    git_init(&path);
    git_commit_empty(&path);

    let error = read_file_diff(path.clone(), "../outside.txt".to_string())
        .expect_err("a traversal path should be rejected before touching git");
    assert_eq!(error.code, AppErrorCode::PathInvalid);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_conflict_with_visible_content() {
    let path = unique_temp_dir("diff-conflict");
    git_init(&path);
    write_file(&path, "file.txt", "base\n");
    git_add(&path, "file.txt");
    git_commit(&path, "base commit");
    let main_branch = current_branch(&path);

    let status = git_command(&path)
        .args(["checkout", "-q", "-b", "feature"])
        .status()
        .expect("checkout feature branch");
    assert!(status.success());
    write_file(&path, "file.txt", "feature change\n");
    git_add(&path, "file.txt");
    git_commit(&path, "feature change");

    let status = git_command(&path)
        .args(["checkout", "-q", &main_branch])
        .status()
        .expect("checkout main branch");
    assert!(status.success());
    write_file(&path, "file.txt", "main change\n");
    git_add(&path, "file.txt");
    git_commit(&path, "main change");

    // A merge conflict is the point of this test: ignore the (expected
    // nonzero) result and inspect the conflicted worktree state instead.
    // An explicit identity is required here too: a clean (non-conflicting)
    // merge would need to auto-commit, and Git checks committer identity
    // before attempting the merge at all, aborting the whole operation
    // untouched on a machine with no configured identity (e.g. CI runners).
    let _ = git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "-q",
            "--no-edit",
            "feature",
        ])
        .status();

    let diff = read_file_diff(path.clone(), "file.txt".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Conflict { hunks, detail, .. } => {
            assert!(detail.is_none());
            assert!(
                !hunks.is_empty(),
                "conflict markers should be visible in the diff"
            );
        }
        other => panic!("expected a conflict, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_diff_reports_a_modified_binary_file() {
    let path = unique_temp_dir("diff-binary");
    git_init(&path);
    fs::write(
        Path::new(&path).join("image.bin"),
        [0u8, 159, 146, 150, 0, 1, 2],
    )
    .expect("write binary file");
    git_add(&path, "image.bin");
    git_commit(&path, "add binary file");
    fs::write(
        Path::new(&path).join("image.bin"),
        [0u8, 159, 146, 150, 0, 9, 9],
    )
    .expect("modify binary file");

    let diff = read_file_diff(path.clone(), "image.bin".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Binary { change, .. } => assert_eq!(change, ChangeCategory::Changed),
        other => panic!("expected binary, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn parse_diff_body_ignores_malformed_and_truncated_header_lines() {
    // A line that looks like a hunk header but fails to parse, content
    // lines with no hunk open yet, and a header cut off mid-stream must
    // not panic and must not fabricate a hunk from unparseable input.
    let text =
        "@@ -bogus @@\n+dangling addition before any hunk\n@@ -1,1 +1,1 @@\n-a\n+b\n@@ -2 +2";
    let parsed = parse_diff_body(text);

    assert_eq!(parsed.hunks.len(), 1);
    assert_eq!(parsed.hunks[0].old_start, 1);
    assert_eq!(parsed.hunks[0].lines.len(), 2);
}

// ---- read_working_tree_diffs (extra optimization, task 010) ----

#[test]
fn split_diff_sections_splits_on_diff_git_lines() {
    let text = "diff --git a/one b/one\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/two b/two\n@@ -1 +1 @@\n-c\n+d\n";
    let sections = split_diff_sections(text);
    assert_eq!(sections.len(), 2);
    assert!(sections[0].starts_with("diff --git a/one b/one"));
    assert!(sections[0].contains("-a\n+b"));
    assert!(sections[1].starts_with("diff --git a/two b/two"));
    assert!(sections[1].contains("-c\n+d"));
}

#[test]
fn split_diff_sections_returns_nothing_for_empty_input() {
    assert!(split_diff_sections("").is_empty());
}

#[test]
fn split_content_lines_drops_the_phantom_line_from_a_trailing_newline() {
    assert_eq!(split_content_lines("a\nb\n"), vec!["a", "b"]);
}

#[test]
fn split_content_lines_keeps_the_final_unterminated_line() {
    assert_eq!(split_content_lines("a\nb"), vec!["a", "b"]);
}

#[test]
fn split_content_lines_returns_nothing_for_empty_content() {
    assert!(split_content_lines("").is_empty());
}

#[test]
fn read_working_tree_diffs_batches_every_tracked_change_into_one_process() {
    let path = unique_temp_dir("batch-diffs-tracked");
    git_init(&path);
    write_file(&path, "one.txt", "one\n");
    write_file(&path, "two.txt", "two\n");
    git_add_all(&path);
    git_commit(&path, "base");
    write_file(&path, "one.txt", "one changed\n");
    write_file(&path, "two.txt", "two changed\n");

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    assert_eq!(diffs.len(), 2);

    match find_diff(&diffs, "one.txt") {
        Some(FileDiff::Text { hunks, .. }) => {
            assert_eq!(hunks.len(), 1);
            assert!(hunks[0]
                .lines
                .iter()
                .any(|line| line.content == "one changed"));
        }
        other => panic!("expected a text diff for one.txt, got {other:?}"),
    }
    match find_diff(&diffs, "two.txt") {
        Some(FileDiff::Text { hunks, .. }) => {
            assert!(hunks[0]
                .lines
                .iter()
                .any(|line| line.content == "two changed"));
        }
        other => panic!("expected a text diff for two.txt, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_reads_an_untracked_file_without_invoking_git_diff() {
    let path = unique_temp_dir("batch-diffs-untracked");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "new-file.txt", "hello\nworld\n");

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    assert_eq!(diffs.len(), 1);
    match find_diff(&diffs, "new-file.txt") {
        Some(FileDiff::Text { hunks, change, .. }) => {
            assert_eq!(*change, ChangeCategory::New);
            assert_eq!(hunks.len(), 1);
            assert_eq!(hunks[0].lines.len(), 2);
            assert!(hunks[0]
                .lines
                .iter()
                .all(|line| line.kind == DiffLineKind::Addition));
            assert_eq!(hunks[0].lines[0].content, "hello");
            assert_eq!(hunks[0].lines[1].new_line_number, Some(2));
        }
        other => panic!("expected a text diff for new-file.txt, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_reports_an_empty_untracked_file_as_unchanged() {
    let path = unique_temp_dir("batch-diffs-empty-untracked");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "empty.txt", "");

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    match find_diff(&diffs, "empty.txt") {
        Some(FileDiff::Unchanged { .. }) => {}
        other => panic!("expected unchanged for an empty new file, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_reports_a_binary_untracked_file_as_binary() {
    let path = unique_temp_dir("batch-diffs-binary-untracked");
    git_init(&path);
    git_commit_empty(&path);
    fs::write(
        Path::new(&path).join("image.bin"),
        [0u8, 159, 146, 150, 0, 1, 2],
    )
    .expect("write binary file");

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    match find_diff(&diffs, "image.bin") {
        Some(FileDiff::Binary { .. }) => {}
        other => panic!("expected binary for a binary untracked file, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_excludes_conflicted_entries() {
    let path = unique_temp_dir("batch-diffs-conflict");
    git_init(&path);
    write_file(&path, "file.txt", "base\n");
    git_add_all(&path);
    git_commit(&path, "base");
    let original_branch =
        git_stdout(&test_git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"]).unwrap());

    let status = git_command(&path)
        .args(["checkout", "-q", "-b", "feature"])
        .status()
        .expect("create feature branch");
    assert!(status.success());
    write_file(&path, "file.txt", "feature change\n");
    git_add(&path, "file.txt");
    git_commit(&path, "feature change");

    let status = git_command(&path)
        .args(["checkout", "-q", &original_branch])
        .status()
        .expect("checkout the original branch");
    assert!(status.success());
    write_file(&path, "file.txt", "main change\n");
    git_add(&path, "file.txt");
    git_commit(&path, "main change");

    // An explicit identity is required here too: a clean (non-conflicting)
    // merge would need to auto-commit, and Git checks committer identity
    // before attempting the merge at all, aborting the whole operation
    // untouched on a machine with no configured identity (e.g. CI runners).
    let _ = git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "-q",
            "--no-edit",
            "feature",
        ])
        .status();

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    assert!(
        find_diff(&diffs, "file.txt").is_none(),
        "a conflicted entry must be left for the per-file fallback, not guessed at here"
    );

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_batches_a_renamed_file() {
    let path = unique_temp_dir("batch-diffs-rename");
    git_init(&path);
    write_file(
        &path,
        "old.txt",
        "same content, renamed with enough text to be detected\n",
    );
    git_add_all(&path);
    git_commit(&path, "base");
    fs::rename(
        Path::new(&path).join("old.txt"),
        Path::new(&path).join("new.txt"),
    )
    .expect("rename file");
    git_add_all(&path);

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    match find_diff(&diffs, "new.txt") {
        Some(FileDiff::Unchanged {
            original_path,
            change,
            ..
        }) => {
            assert_eq!(original_path.as_deref(), Some("old.txt"));
            assert_eq!(*change, ChangeCategory::Renamed);
        }
        other => panic!("expected an unchanged pure rename, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_batches_a_deleted_file() {
    let path = unique_temp_dir("batch-diffs-delete");
    git_init(&path);
    write_file(&path, "gone.txt", "bye\n");
    git_add_all(&path);
    git_commit(&path, "base");
    fs::remove_file(Path::new(&path).join("gone.txt")).expect("delete file");

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    match find_diff(&diffs, "gone.txt") {
        Some(FileDiff::Text { change, hunks, .. }) => {
            assert_eq!(*change, ChangeCategory::Deleted);
            assert!(hunks[0]
                .lines
                .iter()
                .any(|line| line.kind == DiffLineKind::Deletion));
        }
        other => panic!("expected a text diff for the deleted file, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

// ---- Speculative warm policy (task 072) ----
//
// The 16 MiB cap in `batch_tracked_diffs` is an emergency ceiling for one Git
// invocation, not the size of an ordinary response. Speculative warming gets
// its own, much smaller budget, and says out loud when it stopped early.

#[test]
fn the_speculative_warm_budget_stays_materially_below_the_emergency_cap() {
    const { assert!(MAX_WARM_DIFF_OUTPUT_BYTES * 4 <= MAX_BATCH_DIFF_OUTPUT_BYTES) };
}

#[test]
fn batch_output_cap_clamps_any_request_to_the_emergency_ceiling() {
    assert_eq!(
        batch_output_cap(MAX_WARM_DIFF_OUTPUT_BYTES),
        MAX_WARM_DIFF_OUTPUT_BYTES
    );
    assert_eq!(
        batch_output_cap(MAX_BATCH_DIFF_OUTPUT_BYTES),
        MAX_BATCH_DIFF_OUTPUT_BYTES
    );
    assert_eq!(batch_output_cap(usize::MAX), MAX_BATCH_DIFF_OUTPUT_BYTES);
}

#[test]
fn read_working_tree_diffs_defers_a_changeset_past_the_warm_file_budget() {
    let path = unique_temp_dir("batch-diffs-deferred");
    git_init(&path);
    git_commit_empty(&path);
    for index in 0..MAX_WARM_CHANGED_FILES + 1 {
        write_file(
            &path,
            &format!("file-{index:04}.txt"),
            "content
",
        );
    }

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Deferred);
    assert!(batch.diffs.is_empty());
    assert_eq!(batch.changed_files as usize, MAX_WARM_CHANGED_FILES + 1);
    assert_eq!(batch.budget_bytes, MAX_WARM_DIFF_OUTPUT_BYTES as u64);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_truncates_a_tracked_changeset_past_the_warm_byte_budget() {
    let path = unique_temp_dir("batch-diffs-truncated");
    git_init(&path);
    // Two files whose full rewrite each stays under the per-file cap but whose
    // combined patch text is over the warm budget, plus a small one ahead of
    // them in Git's path order.
    let lines = MAX_WARM_DIFF_OUTPUT_BYTES * 3 / (64 * 10);
    let before = format!(
        "{}
",
        "a".repeat(63)
    )
    .repeat(lines);
    let after = format!(
        "{}
",
        "b".repeat(63)
    )
    .repeat(lines);
    write_file(
        &path,
        "a-small.txt",
        "small
",
    );
    write_file(&path, "m-big-one.txt", &before);
    write_file(&path, "z-big-two.txt", &before);
    git_add_all(&path);
    git_commit(&path, "base");
    write_file(
        &path,
        "a-small.txt",
        "small changed
",
    );
    write_file(&path, "m-big-one.txt", &after);
    write_file(&path, "z-big-two.txt", &after);

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Truncated);
    // What fit is still warmed; the file that did not is simply absent, and
    // the on-demand path still answers for it with one request.
    assert!(find_diff(&batch.diffs, "a-small.txt").is_some());
    assert!(find_diff(&batch.diffs, "m-big-one.txt").is_some());
    assert!(find_diff(&batch.diffs, "z-big-two.txt").is_none());
    assert!(matches!(
        read_file_diff(path.clone(), "z-big-two.txt".to_string()),
        Ok(FileDiff::Text { .. })
    ));

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_skips_an_untracked_file_past_the_warm_byte_budget() {
    let path = unique_temp_dir("batch-diffs-untracked-budget");
    git_init(&path);
    git_commit_empty(&path);
    write_file(
        &path,
        "a-small.txt",
        "small
",
    );
    write_file(
        &path,
        "z-huge.txt",
        &"x".repeat(MAX_WARM_DIFF_OUTPUT_BYTES + 1024),
    );

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Truncated);
    assert!(find_diff(&batch.diffs, "a-small.txt").is_some());
    assert!(find_diff(&batch.diffs, "z-huge.txt").is_none());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_returns_nothing_for_a_clean_repository() {
    let path = unique_temp_dir("batch-diffs-clean");
    git_init(&path);
    git_commit_empty(&path);

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    assert_eq!(batch.outcome, DiffWarmOutcome::Completed);
    let diffs = batch.diffs;
    assert!(diffs.is_empty());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_commit_file_changes_classifies_the_root_commit_as_entirely_new() {
    let repo = unique_temp_dir("commit-files-root");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    write_file(&repo, "b.txt", "world\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let files =
        read_commit_file_changes(repo.clone(), commit).expect("should read root commit files");
    assert_eq!(files.len(), 2);
    assert!(files
        .iter()
        .all(|file| file.category == ChangeCategory::New && file.original_path.is_none()));

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn read_commit_file_changes_classifies_modify_delete_and_rename() {
    let repo = unique_temp_dir("commit-files-mixed");
    git_init(&repo);
    write_file(&repo, "keep.txt", "unchanged\n");
    write_file(&repo, "to-modify.txt", "before\n");
    write_file(&repo, "to-delete.txt", "temporary\n");
    write_file(
        &repo,
        "to-rename.txt",
        "rename me please, this needs to be long enough for git to detect a rename by similarity\n",
    );
    git_add_all(&repo);
    git_commit(&repo, "base");

    write_file(&repo, "to-modify.txt", "after\n");
    fs::remove_file(Path::new(&repo).join("to-delete.txt")).expect("delete file");
    fs::rename(
        Path::new(&repo).join("to-rename.txt"),
        Path::new(&repo).join("renamed.txt"),
    )
    .expect("rename file");
    git_add_all(&repo);
    git_commit(&repo, "mixed changes");
    let commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let files =
        read_commit_file_changes(repo.clone(), commit).expect("should read mixed commit files");
    let find = |path: &str| files.iter().find(|file| file.path == path);

    assert_eq!(
        find("to-modify.txt").map(|f| f.category),
        Some(ChangeCategory::Changed)
    );
    assert_eq!(
        find("to-delete.txt").map(|f| f.category),
        Some(ChangeCategory::Deleted)
    );
    let renamed = find("renamed.txt").expect("renamed.txt should be reported");
    assert_eq!(renamed.category, ChangeCategory::Renamed);
    assert_eq!(renamed.original_path.as_deref(), Some("to-rename.txt"));
    assert!(
        find("keep.txt").is_none(),
        "an unchanged file must not be reported"
    );

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn read_commit_file_changes_rejects_a_value_that_looks_like_a_flag() {
    let repo = unique_temp_dir("commit-files-invalid");
    git_init(&repo);
    git_commit_empty(&repo);

    let error = read_commit_file_changes(repo.clone(), "--upload-pack=evil".to_string())
        .expect_err("a flag-shaped commit value must be rejected");
    assert_eq!(error.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn read_commit_file_diff_reports_hunks_for_a_modified_file() {
    let repo = unique_temp_dir("commit-diff-modify");
    git_init(&repo);
    write_file(&repo, "a.txt", "one\ntwo\nthree\n");
    git_add_all(&repo);
    git_commit(&repo, "base");
    write_file(&repo, "a.txt", "one\nTWO\nthree\n");
    git_add_all(&repo);
    git_commit(&repo, "modify");
    let commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let diff = read_commit_file_diff(repo.clone(), commit, "a.txt".to_string())
        .expect("should read the commit's diff for this file");
    match diff {
        FileDiff::Text { change, hunks, .. } => {
            assert_eq!(change, ChangeCategory::Changed);
            assert!(!hunks.is_empty());
            assert!(hunks[0].lines.iter().any(|line| line.content == "TWO"));
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn read_commit_file_diff_reports_a_root_commit_file_as_a_pure_addition() {
    let repo = unique_temp_dir("commit-diff-root");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let diff = read_commit_file_diff(repo.clone(), commit, "a.txt".to_string())
        .expect("should read the root commit's diff for this file");
    match diff {
        FileDiff::Text { change, hunks, .. } => {
            assert_eq!(change, ChangeCategory::New);
            assert!(hunks[0]
                .lines
                .iter()
                .all(|line| line.kind == DiffLineKind::Addition));
        }
        other => panic!("expected a text diff, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn read_commit_file_diff_rejects_a_path_not_touched_by_that_commit() {
    let repo = unique_temp_dir("commit-diff-untouched");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    write_file(&repo, "b.txt", "untouched\n");
    git_add_all(&repo);
    git_commit(&repo, "first");

    write_file(&repo, "a.txt", "hello again\n");
    git_add_all(&repo);
    git_commit(&repo, "second");
    let second_commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let error = read_commit_file_diff(repo.clone(), second_commit, "b.txt".to_string())
        .expect_err("b.txt wasn't touched by the second commit");
    assert_eq!(error.code, AppErrorCode::PathNotChanged);

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn read_commit_file_diff_rejects_a_flag_shaped_commit_value() {
    let repo = unique_temp_dir("commit-diff-invalid");
    git_init(&repo);
    git_commit_empty(&repo);

    let error = read_commit_file_diff(
        repo.clone(),
        "--upload-pack=evil".to_string(),
        "a.txt".to_string(),
    )
    .expect_err("a flag-shaped commit value must be rejected");
    assert_eq!(error.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(&repo);
}

// ---- Image previews (task 111) ----

/// Enough of a PNG for both the classifier and the sniffer: they read the
/// signature, not the pixels.
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

fn png_bytes(tail: &str) -> Vec<u8> {
    let mut bytes = PNG_SIGNATURE.to_vec();
    // A real IHDR chunk header, NUL bytes and all: Git decides a file is
    // binary by finding one, so a fixture without them would be diffed as
    // text and would never reach the classification under test.
    bytes.extend_from_slice(&[0, 0, 0, 0x0D]);
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&[0, 0, 0, 1]);
    bytes.extend_from_slice(tail.as_bytes());
    bytes
}

fn write_bytes(repo_path: &str, name: &str, bytes: &[u8]) {
    fs::write(Path::new(repo_path).join(name), bytes).expect("write binary file");
}

fn head_commit(path: &str) -> String {
    let output = test_git(path, &["rev-parse", "HEAD"]).expect("rev-parse");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[test]
fn read_file_diff_calls_a_changed_png_an_image() {
    let path = unique_temp_dir("diff-image-png");
    git_init(&path);
    write_bytes(&path, "logo.png", &png_bytes("before"));
    git_add(&path, "logo.png");
    git_commit(&path, "add logo");
    write_bytes(&path, "logo.png", &png_bytes("after"));

    let diff = read_file_diff(path.clone(), "logo.png".to_string()).expect("diff should succeed");
    match diff {
        FileDiff::Image { change, .. } => assert_eq!(change, ChangeCategory::Changed),
        other => panic!("expected an image, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_diffs_calls_an_untracked_png_an_image() {
    let path = unique_temp_dir("batch-diffs-image");
    git_init(&path);
    git_commit_empty(&path);
    write_bytes(&path, "shot.png", &png_bytes("fresh"));
    // Named like an image but not one: the name alone must not be enough.
    write_file(&path, "notes.png", "plain text pretending\n");

    let batch = read_working_tree_diffs(path.clone()).expect("batch should succeed");
    match find_diff(&batch.diffs, "shot.png") {
        Some(FileDiff::Image { .. }) => {}
        other => panic!("expected an image for an untracked png, got {other:?}"),
    }
    match find_diff(&batch.diffs, "notes.png") {
        Some(FileDiff::Text { .. }) => {}
        other => panic!("expected text for a text file named .png, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_image_preview_reads_both_working_tree_versions() {
    let path = unique_temp_dir("image-preview-working-tree");
    git_init(&path);
    let before = png_bytes("the saved pixels");
    write_bytes(&path, "logo.png", &before);
    git_add(&path, "logo.png");
    git_commit(&path, "add logo");
    let after = png_bytes("the pixels on disk right now");
    write_bytes(&path, "logo.png", &after);

    let preview = read_file_image_preview(path.clone(), "logo.png".to_string(), None, None)
        .expect("preview should succeed");

    match preview.before {
        Some(ImagePreviewSide::Ready {
            media_type,
            byte_length,
            data,
        }) => {
            assert_eq!(media_type, "image/png");
            assert_eq!(byte_length, before.len() as u64);
            assert_eq!(data, base64_encode(&before));
        }
        other => panic!("expected the saved version, got {other:?}"),
    }
    match preview.after {
        Some(ImagePreviewSide::Ready {
            byte_length, data, ..
        }) => {
            assert_eq!(byte_length, after.len() as u64);
            assert_eq!(data, base64_encode(&after));
        }
        other => panic!("expected the working-tree version, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_image_preview_leaves_the_missing_side_empty() {
    let path = unique_temp_dir("image-preview-added");
    git_init(&path);
    git_commit_empty(&path);
    write_bytes(&path, "new.png", &png_bytes("brand new"));

    let preview = read_file_image_preview(path.clone(), "new.png".to_string(), None, None)
        .expect("preview should succeed");

    // An added image has no earlier version. That is not an error, and must
    // not be drawn as one.
    assert!(preview.before.is_none());
    assert!(matches!(
        preview.after,
        Some(ImagePreviewSide::Ready { .. })
    ));

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_image_preview_reads_a_saved_version_against_its_parent() {
    let path = unique_temp_dir("image-preview-commit");
    git_init(&path);
    let first = png_bytes("first cut");
    write_bytes(&path, "logo.png", &first);
    git_add(&path, "logo.png");
    git_commit(&path, "add logo");
    let second = png_bytes("second cut, larger");
    write_bytes(&path, "logo.png", &second);
    git_add(&path, "logo.png");
    git_commit(&path, "redraw logo");
    let commit = head_commit(&path);

    let preview = read_file_image_preview(path.clone(), "logo.png".to_string(), None, Some(commit))
        .expect("preview should succeed");

    match (preview.before, preview.after) {
        (
            Some(ImagePreviewSide::Ready {
                byte_length: before_bytes,
                ..
            }),
            Some(ImagePreviewSide::Ready {
                byte_length: after_bytes,
                ..
            }),
        ) => {
            assert_eq!(before_bytes, first.len() as u64);
            assert_eq!(after_bytes, second.len() as u64);
        }
        other => panic!("expected both versions of the saved change, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_image_preview_reports_a_version_past_the_limit_without_reading_it() {
    let path = unique_temp_dir("image-preview-too-large");
    git_init(&path);
    git_commit_empty(&path);
    let mut huge = PNG_SIGNATURE.to_vec();
    huge.resize(MAX_IMAGE_PREVIEW_BYTES as usize + 1024, b'x');
    write_bytes(&path, "huge.png", &huge);

    let preview = read_file_image_preview(path.clone(), "huge.png".to_string(), None, None)
        .expect("preview should succeed");

    match preview.after {
        // The variant carries no `data` field at all, so passing this is the
        // assertion that the bytes never reached memory or the payload.
        Some(ImagePreviewSide::TooLarge {
            byte_length,
            limit_bytes,
        }) => {
            assert_eq!(byte_length, huge.len() as u64);
            assert_eq!(limit_bytes, MAX_IMAGE_PREVIEW_BYTES);
        }
        other => panic!("expected the oversized version to be reported, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_image_preview_reads_an_svg_as_a_drawing() {
    let path = unique_temp_dir("image-preview-svg");
    git_init(&path);
    write_file(
        &path,
        "icon.svg",
        "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0h10v10H0z\"/></svg>\n",
    );
    git_add(&path, "icon.svg");
    git_commit(&path, "add icon");
    write_file(
        &path,
        "icon.svg",
        "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0h12v12H0z\"/></svg>\n",
    );

    // An SVG keeps its text diff …
    match read_file_diff(path.clone(), "icon.svg".to_string()).expect("diff should succeed") {
        FileDiff::Text { .. } => {}
        other => panic!("expected an SVG to stay text, got {other:?}"),
    }
    // … and gains a drawing through the same preview command.
    let preview = read_file_image_preview(path.clone(), "icon.svg".to_string(), None, None)
        .expect("preview should succeed");
    match preview.after {
        Some(ImagePreviewSide::Ready { media_type, .. }) => {
            assert_eq!(media_type, "image/svg+xml");
        }
        other => panic!("expected the drawing, got {other:?}"),
    }

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_file_image_preview_refuses_a_file_that_is_not_an_image() {
    let path = unique_temp_dir("image-preview-not-an-image");
    git_init(&path);
    write_file(&path, "notes.txt", "not a picture\n");
    git_add(&path, "notes.txt");
    git_commit(&path, "add notes");

    let error = read_file_image_preview(path.clone(), "notes.txt".to_string(), None, None)
        .expect_err("a text file has no drawing to read");
    assert_eq!(error.code, AppErrorCode::PathInvalid);

    let _ = fs::remove_dir_all(&path);
}

/// The picture half of `read_file_lines_refuses_a_symlink_that_escapes_the_repository`:
/// a repository-relative name that passes the string check can still resolve
/// outside the project, and a preview would put that file on screen.
#[test]
fn read_file_image_preview_refuses_a_symlink_that_escapes_the_repository() {
    let outside = unique_temp_dir("image-preview-outside");
    write_bytes(&(outside.clone()), "private.png", &png_bytes("not yours"));
    let path = unique_temp_dir("image-preview-symlink");
    git_init(&path);

    let link = Path::new(&path).join("innocent.png");
    let target = Path::new(&outside).join("private.png");
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&target, &link).is_ok();
    #[cfg(not(windows))]
    let linked = std::os::unix::fs::symlink(&target, &link).is_ok();

    // Creating a symlink needs a privilege Windows does not grant by default;
    // skip rather than fail when the platform said no.
    if linked {
        assert!(
            read_file_image_preview(path.clone(), "innocent.png".to_string(), None, None).is_err()
        );
    }

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_dir_all(&outside);
}

#[test]
fn read_file_image_preview_does_not_call_an_unreadable_picture_a_deleted_one() {
    let path = unique_temp_dir("image-preview-unreadable");
    git_init(&path);
    write_bytes(&path, "logo.png", &png_bytes("saved"));
    git_add(&path, "logo.png");
    git_commit(&path, "add logo");
    // Replacing the file with a directory is the portable stand-in for "the
    // path is there and cannot be read as a file". Reporting it as an absent
    // side would tell the user the picture was deleted.
    fs::remove_file(Path::new(&path).join("logo.png")).expect("remove file");
    fs::create_dir(Path::new(&path).join("logo.png")).expect("create directory");

    assert!(read_file_image_preview(path.clone(), "logo.png".to_string(), None, None).is_err());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn svg_sniffing_accepts_a_lowercase_doctype() {
    assert_eq!(
        sniff_image_media_type(b"<!doctype svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\">\n<svg/>"),
        Some(SVG_MEDIA_TYPE)
    );
    // Still not every file that happens to mention the tag somewhere.
    assert_eq!(sniff_image_media_type(b"a note about <svg> tags"), None);
}
