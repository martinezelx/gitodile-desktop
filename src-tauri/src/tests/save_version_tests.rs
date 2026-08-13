use crate::test_support::*;
use crate::*;
use std::fs;

#[test]
fn plan_save_version_reports_nothing_to_save_for_a_clean_unborn_repo() {
    let path = unique_temp_dir("plan-clean-unborn");
    git_init(&path);
    let identity = write_test_identity_config("plan-clean-unborn");

    let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect_err("a clean, commit-less repo has nothing to save");
    assert_eq!(error.code, AppErrorCode::NothingToSave);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_reports_nothing_to_save_for_a_clean_existing_history() {
    let path = unique_temp_dir("plan-clean-existing");
    git_init(&path);
    git_commit_empty(&path);
    let identity = write_test_identity_config("plan-clean-existing");

    let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect_err("a clean repo has nothing to save");
    assert_eq!(error.code, AppErrorCode::NothingToSave);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_returns_a_first_version_plan_for_an_unborn_repo_with_changes() {
    let path = unique_temp_dir("plan-first-version");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("plan-first-version");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("an unborn repo with changes should produce a plan");
    assert_eq!(plan.operation_kind, OperationKind::HistoryMutation);
    assert!(plan.requires_confirmation);
    assert!(plan.is_first_version);
    assert_eq!(plan.total_files, 1);
    assert_eq!(plan.counts.new_files, 1);
    assert!(plan.branch.is_some());

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_returns_a_normal_plan_for_an_existing_history() {
    let path = unique_temp_dir("plan-normal");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("plan-normal");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("a repo with changes should produce a plan");
    assert!(!plan.is_first_version);
    assert_eq!(plan.total_files, 1);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_rejects_a_detached_head() {
    let path = unique_temp_dir("plan-detached");
    git_init(&path);
    git_commit_empty(&path);
    let status = git_command(&path)
        .args(["checkout", "--detach", "-q"])
        .status()
        .expect("detach HEAD");
    assert!(status.success(), "git checkout --detach should succeed");
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("plan-detached");

    let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect_err("a detached HEAD should block saving");
    assert_eq!(error.code, AppErrorCode::DetachedHead);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_rejects_unresolved_conflicts() {
    let path = unique_temp_dir("plan-conflicts");
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

    // A merge conflict is the point of this test: ignore the (expected
    // nonzero) result and inspect the conflicted status afterward.
    // An explicit identity is required here too: a clean (non-conflicting)
    // merge would need to auto-commit, and Git checks committer identity
    // before attempting the merge at all, aborting the whole operation
    // untouched on a machine with no configured identity (e.g. CI runners).
    let _ = git_command(&path)
        .args([
            "-c",
            "user.name=GitOdrile Test",
            "-c",
            "user.email=test@gitodrile.local",
            "merge",
            "-q",
            "--no-edit",
            "feature",
        ])
        .status();

    // `git merge` also leaves `MERGE_HEAD` behind, which would otherwise
    // be caught by the (higher-priority) operation-in-progress check.
    // Removing it isolates the unresolved-conflicts blocker, which also
    // fires for unmerged index entries left by other means (e.g. a
    // conflicting `stash pop`, which never sets `MERGE_HEAD`).
    let git_dir_raw =
        checked_git_stdout(test_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap()).unwrap();
    fs::remove_file(Path::new(&git_dir_raw).join("MERGE_HEAD"))
        .expect("remove MERGE_HEAD to isolate the conflict blocker");

    let identity = write_test_identity_config("plan-conflicts");
    let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect_err("unresolved conflicts should block saving");
    assert_eq!(error.code, AppErrorCode::UnresolvedConflicts);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_rejects_an_operation_in_progress() {
    let path = unique_temp_dir("plan-merge-in-progress");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "readme.md", "hello\n");
    let git_dir_raw =
        checked_git_stdout(test_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap()).unwrap();
    fs::write(Path::new(&git_dir_raw).join("MERGE_HEAD"), "deadbeef\n")
        .expect("simulate an in-progress merge");
    let identity = write_test_identity_config("plan-merge-in-progress");

    let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect_err("an in-progress merge should block saving");
    assert_eq!(error.code, AppErrorCode::GitOperationInProgress);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn plan_save_version_rejects_missing_identity() {
    let path = unique_temp_dir("plan-missing-identity");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = empty_identity_override("plan-missing-identity");

    let error = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect_err("a repo with no configured identity should block saving");
    assert_eq!(error.code, AppErrorCode::MissingIdentity);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn plan_save_version_state_token_is_stable_then_invalidated_by_new_changes() {
    let path = unique_temp_dir("plan-token");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("plan-token");

    let first = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("first plan should succeed");
    let second = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("re-planning identical state should succeed");
    assert_eq!(first.state_token, second.state_token);

    write_file(&path, "other.txt", "more\n");
    let third = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan after a new change should succeed");
    assert_ne!(first.state_token, third.state_token);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

// ---- save_version (task 010) ----

#[test]
fn save_version_rejects_an_empty_title() {
    let path = unique_temp_dir("save-empty-title");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-empty-title");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let error = save_version_with_identity_override(
        path.clone(),
        "   ".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect_err("a whitespace-only title must be rejected");
    assert_eq!(error.code, AppErrorCode::EmptyTitle);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_rejects_a_multiline_title() {
    let path = unique_temp_dir("save-multiline-title");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-multiline-title");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let error = save_version_with_identity_override(
        path.clone(),
        "title\nunexpected body".to_string(),
        None,
        plan.state_token,
        Some(&identity),
    )
    .expect_err("a multiline title must be rejected at the Rust boundary");
    assert_eq!(error.code, AppErrorCode::InvalidTitle);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_creates_a_title_only_commit_message_with_no_trailing_blank_paragraph() {
    let path = unique_temp_dir("save-title-only-message");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-title-only-message");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let result = save_version_with_identity_override(
        path.clone(),
        "  title only  ".to_string(),
        Some("   ".to_string()),
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect("save should succeed");

    assert_eq!(result.title, "title only");
    assert_eq!(
        result.description, None,
        "a blank details field is no details"
    );

    let full_message = git_stdout(&test_git(&path, &["log", "-1", "--format=%B"]).unwrap());
    assert_eq!(
        full_message.trim_end(),
        "title only",
        "no empty trailing paragraph should be appended"
    );

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_creates_a_conventional_subject_blank_line_and_body_commit_message() {
    let path = unique_temp_dir("save-title-and-description");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-title-and-description");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let result = save_version_with_identity_override(
        path.clone(),
        "  Añadir soporte de emojis 🎉  ".to_string(),
        Some("  Primera línea.\n\nSegunda línea con más contexto.  ".to_string()),
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect("save should succeed");

    assert_eq!(result.title, "Añadir soporte de emojis 🎉");
    assert_eq!(
        result.description.as_deref(),
        Some("Primera línea.\n\nSegunda línea con más contexto.")
    );

    let full_message = git_stdout(&test_git(&path, &["log", "-1", "--format=%B"]).unwrap());
    assert_eq!(
        full_message.trim_end(),
        "Añadir soporte de emojis 🎉\n\nPrimera línea.\n\nSegunda línea con más contexto."
    );

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_creates_the_first_commit_on_an_unborn_branch() {
    let path = unique_temp_dir("save-first-commit");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-first-commit");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    assert!(plan.is_first_version);

    let result = save_version_with_identity_override(
        path.clone(),
        "first version".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect("first save should succeed");

    assert_eq!(result.saved_files, 1);
    assert_eq!(
        git_stdout(&test_git(&path, &["rev-list", "--count", "HEAD"]).unwrap()),
        "1"
    );

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_commits_every_change_kind_and_excludes_ignored_files() {
    let path = unique_temp_dir("save-full-flow");
    git_init(&path);
    write_file(&path, ".gitignore", "ignored.txt\n");
    write_file(&path, "keep.txt", "unchanged\n");
    write_file(&path, "to-modify.txt", "original\n");
    write_file(&path, "to-delete.txt", "bye\n");
    write_file(
        &path,
        "to-rename.txt",
        "rename me, with enough unique content to be detected as a rename\n",
    );
    git_add_all(&path);
    git_commit(&path, "base");

    write_file(&path, "to-modify.txt", "changed\n");
    fs::remove_file(Path::new(&path).join("to-delete.txt")).expect("delete file");
    fs::rename(
        Path::new(&path).join("to-rename.txt"),
        Path::new(&path).join("renamed.txt"),
    )
    .expect("rename file");
    write_file(&path, "new-file.txt", "brand new\n");
    write_file(&path, "ignored.txt", "should stay out\n");
    // Unstaged renames are reported by `git status` as a plain delete +
    // add, not a rename (rename detection only kicks in once a change is
    // staged) — matching the pattern the existing diff/rename tests
    // already rely on. Staging here previews the same categorization
    // `save_version`'s own `git add -A` would produce.
    git_add_all(&path);

    let identity = write_test_identity_config("save-full-flow");
    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    assert_eq!(
        plan.total_files, 4,
        "modify, delete, rename, new — ignored excluded"
    );

    let result = save_version_with_identity_override(
        path.clone(),
        "  save everything  ".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect("save should succeed");

    assert_eq!(result.title, "save everything");
    assert_eq!(result.description, None);
    assert_eq!(result.saved_files, 4);
    assert_eq!(result.commit.len(), 40);
    assert!(result.commit.starts_with(&result.short_commit));

    let status_after = read_working_tree_status(path.clone()).expect("status after save");
    assert!(status_after.is_clean, "everything should be committed");

    let tracked = git_stdout(&test_git(&path, &["ls-files"]).unwrap());
    assert!(
        !tracked.contains("ignored.txt"),
        "ignored files must never be committed"
    );
    assert!(tracked.contains("renamed.txt"));
    assert!(!tracked.contains("to-delete.txt"));

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_commits_only_the_selected_files() {
    let path = unique_temp_dir("save-selection");
    git_init(&path);
    write_file(&path, "selected.txt", "before\n");
    write_file(&path, "pending.txt", "before\n");
    git_add_all(&path);
    git_commit(&path, "base");
    write_file(&path, "selected.txt", "saved\n");
    write_file(&path, "pending.txt", "still pending\n");
    let identity = write_test_identity_config("save-selection");
    let selected = Some(vec!["selected.txt".to_string()]);

    // The inner selection functions are exercised directly here, below the
    // entry points that would authorize the repository, so the frame their
    // Git calls require is supplied explicitly.
    let plan = in_test_frame(|| {
        plan_save_version_selection_with_identity_override(
            path.clone(),
            selected.clone(),
            Some(&identity),
        )
    })
    .expect("partial plan should succeed");
    assert!(plan.is_partial);
    assert_eq!(plan.total_files, 1);
    assert_eq!(plan.remaining_files, 1);

    in_test_frame(|| {
        save_version_selection_with_identity_override(
            path.clone(),
            "save one file".to_string(),
            None,
            plan.state_token,
            selected,
            Some(&identity),
        )
    })
    .expect("partial save should succeed");

    assert_eq!(
        git_stdout(&test_git(&path, &["show", "HEAD:selected.txt"]).unwrap()),
        "saved"
    );
    assert_eq!(
        git_stdout(&test_git(&path, &["show", "HEAD:pending.txt"]).unwrap()),
        "before"
    );
    assert_eq!(
        fs::read_to_string(Path::new(&path).join("pending.txt")).unwrap(),
        "still pending\n"
    );
    let status = read_working_tree_status(path.clone()).expect("remaining status");
    assert_eq!(status.counts.total, 1);
    assert_eq!(status.entries[0].path, "pending.txt");

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_includes_both_prepared_and_later_changes_to_the_same_file() {
    let path = unique_temp_dir("save-prepared-and-unprepared");
    git_init(&path);
    write_file(&path, "file.txt", "one\ntwo\n");
    git_add_all(&path);
    git_commit(&path, "base");
    write_file(&path, "file.txt", "ONE\ntwo\n");
    git_add(&path, "file.txt");
    write_file(&path, "file.txt", "ONE\nTWO\n");
    let identity = write_test_identity_config("save-prepared-and-unprepared");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("mixed plan should succeed");
    assert!(plan.has_prepared_changes);

    save_version_with_identity_override(
        path.clone(),
        "save complete file".to_string(),
        None,
        plan.state_token,
        Some(&identity),
    )
    .expect("mixed save should succeed");

    assert_eq!(
        git_stdout(&test_git(&path, &["show", "HEAD:file.txt"]).unwrap()),
        "ONE\nTWO"
    );
    assert!(
        read_working_tree_status(path.clone())
            .expect("status after mixed save")
            .is_clean
    );

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_plan_token_changes_when_the_same_file_content_changes_again() {
    let path = unique_temp_dir("save-content-token");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "file.txt", "first\n");
    let identity = write_test_identity_config("save-content-token");

    let first = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("first plan");
    write_file(&path, "file.txt", "second\n");
    let second = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("second plan");

    assert_ne!(first.state_token, second.state_token);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn a_failed_index_restore_is_reported_and_keeps_the_backup() {
    let path = unique_temp_dir("save-restore-failure");
    let backup_path = Path::new(&path).join("original-index.bak");
    fs::write(&backup_path, b"original").expect("write backup");
    let index_directory = Path::new(&path).join("index-as-directory");
    fs::create_dir(&index_directory).expect("create invalid index target");
    let backup = IndexBackup {
        index_path: index_directory,
        backup_path: Some(backup_path.clone()),
    };

    let error = restore_or_report(
        &backup,
        AppError::new(AppErrorCode::GitCommandFailed, "primary failure"),
    );
    assert_eq!(error.code, AppErrorCode::IndexRestoreFailed);
    assert!(backup_path.exists(), "the recovery backup must be retained");

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn save_version_rejects_a_stale_state_token() {
    let path = unique_temp_dir("save-stale-token");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-stale-token");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");

    // Project state drifts after the preview token was captured.
    write_file(&path, "other.txt", "more\n");
    let status_before = read_working_tree_status(path.clone()).expect("status before");

    let error = save_version_with_identity_override(
        path.clone(),
        "a version".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect_err("a stale plan must be rejected");
    assert_eq!(error.code, AppErrorCode::StalePreview);

    let status_after = read_working_tree_status(path.clone()).expect("status after");
    assert_eq!(status_before, status_after);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_reports_a_hook_rejection_and_leaves_history_untouched() {
    let path = unique_temp_dir("save-hook-rejection");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-hook-rejection");

    let git_dir_raw =
        checked_git_stdout(test_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap()).unwrap();
    write_failing_hook(Path::new(&git_dir_raw), "pre-commit");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let status_before = read_working_tree_status(path.clone()).expect("status before");

    let error = save_version_with_identity_override(
        path.clone(),
        "a version".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect_err("a rejecting pre-commit hook should fail the save");
    assert_eq!(error.code, AppErrorCode::HookRejected);
    assert!(error.detail.is_some());

    let status_after = read_working_tree_status(path.clone()).expect("status after");
    assert_eq!(status_before, status_after);
    assert_eq!(
        git_stdout(&test_git(&path, &["rev-list", "--count", "HEAD"]).unwrap()),
        "1",
        "no new commit should have been created"
    );

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_restores_the_index_byte_for_byte_after_a_hook_rejection() {
    let path = unique_temp_dir("save-index-restore");
    git_init(&path);
    write_file(&path, "tracked.txt", "base\n");
    git_add_all(&path);
    git_commit(&path, "base");
    write_file(&path, "tracked.txt", "changed\n");
    write_file(&path, "extra.txt", "new\n");
    let identity = write_test_identity_config("save-index-restore");

    let index_path = in_test_frame(|| resolve_index_path(&path)).expect("resolve index path");
    let original_index_bytes = fs::read(&index_path).expect("read original index");

    let git_dir_raw =
        checked_git_stdout(test_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap()).unwrap();
    write_failing_hook(Path::new(&git_dir_raw), "pre-commit");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let error = save_version_with_identity_override(
        path.clone(),
        "a version".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect_err("hook rejection should fail the save");
    assert_eq!(error.code, AppErrorCode::HookRejected);

    let restored_index_bytes = fs::read(&index_path).expect("read restored index");
    assert_eq!(original_index_bytes, restored_index_bytes);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_leaves_no_index_behind_when_a_first_save_fails() {
    let path = unique_temp_dir("save-no-index-restore");
    git_init(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-no-index-restore");

    let index_path = in_test_frame(|| resolve_index_path(&path)).expect("resolve index path");
    assert!(
        !index_path.exists(),
        "a fresh repo should have no index yet"
    );

    let git_dir_raw =
        checked_git_stdout(test_git(&path, &["rev-parse", "--absolute-git-dir"]).unwrap()).unwrap();
    write_failing_hook(Path::new(&git_dir_raw), "pre-commit");

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let error = save_version_with_identity_override(
        path.clone(),
        "a version".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect_err("hook rejection should fail the first save too");
    assert_eq!(error.code, AppErrorCode::HookRejected);
    assert!(
        !index_path.exists(),
        "no index should exist after a failed first save either"
    );

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
}

#[test]
fn save_version_reports_a_signing_failure() {
    let path = unique_temp_dir("save-signing-failure");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "readme.md", "hello\n");
    let identity = write_test_identity_config("save-signing-failure");

    let fake_gpg = write_fake_failing_gpg("save-signing-failure");
    assert!(git_command(&path)
        .args(["config", "commit.gpgsign", "true"])
        .status()
        .expect("set commit.gpgsign")
        .success());
    assert!(git_command(&path)
        .args(["config", "gpg.program", &fake_gpg])
        .status()
        .expect("set gpg.program")
        .success());

    let plan = plan_save_version_with_identity_override(path.clone(), Some(&identity))
        .expect("plan should succeed");
    let error = save_version_with_identity_override(
        path.clone(),
        "a version".to_string(),
        None,
        plan.state_token.clone(),
        Some(&identity),
    )
    .expect_err("a failing gpg program should be reported as a signing failure");
    assert_eq!(error.code, AppErrorCode::SigningFailed);
    assert!(error.detail.is_some());

    let status_after = read_working_tree_status(path.clone()).expect("status after");
    assert_eq!(status_after.counts.total, 1);
    assert_eq!(status_after.counts.new_files, 1);

    let _ = fs::remove_dir_all(&path);
    let _ = fs::remove_file(&identity);
    let _ = fs::remove_file(&fake_gpg);
}
