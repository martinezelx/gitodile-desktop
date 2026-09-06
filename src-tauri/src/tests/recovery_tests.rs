use crate::test_support::*;
use crate::*;
use std::fs;
use std::path::Path;

fn committed_repo(label: &str) -> String {
    let path = unique_temp_dir(label);
    git_init(&path);
    write_file(&path, "tracked.txt", "saved\n");
    git_add_all(&path);
    git_commit(&path, "first");
    path
}

fn text(path: &Path) -> String {
    fs::read_to_string(path).unwrap().replace("\r\n", "\n")
}

#[test]
fn discard_all_restores_tracked_and_removes_untracked_then_recovers_both() {
    let path = committed_repo("discard-all-recover");
    write_file(&path, "tracked.txt", "edited\n");
    write_file(&path, "new.txt", "new bytes\n");
    git_add(&path, "tracked.txt");
    let index_before = fs::read(Path::new(&path).join(".git/index")).unwrap();

    let plan = plan_discard_changes(path.clone(), None).unwrap();
    assert_eq!(plan.file_count, 2);
    assert!(plan.affects_prepared_changes);
    assert!(plan.removes_untracked_files);
    let result = discard_changes(path.clone(), None, plan.state_token).unwrap();

    assert_eq!(text(&Path::new(&path).join("tracked.txt")), "saved\n");
    assert!(!Path::new(&path).join("new.txt").exists());
    let recovery = get_discard_recovery(path.clone()).unwrap();
    assert_eq!(recovery.recovery_id, result.recovery.recovery_id);
    restore_discarded_changes(path.clone(), recovery.recovery_id, recovery.state_token).unwrap();

    assert_eq!(text(&Path::new(&path).join("tracked.txt")), "edited\n");
    assert_eq!(text(&Path::new(&path).join("new.txt")), "new bytes\n");
    assert_eq!(
        fs::read(Path::new(&path).join(".git/index")).unwrap(),
        index_before
    );
    let _ = fs::remove_dir_all(path);
}

#[test]
fn selected_file_discard_preserves_other_unsaved_files() {
    let path = committed_repo("discard-selected");
    write_file(&path, "other.txt", "saved other\n");
    git_add_all(&path);
    git_commit(&path, "other");
    write_file(&path, "tracked.txt", "edited target\n");
    write_file(&path, "other.txt", "edited other\n");

    let plan = plan_discard_changes(path.clone(), Some("tracked.txt".to_string())).unwrap();
    discard_changes(
        path.clone(),
        Some("tracked.txt".to_string()),
        plan.state_token,
    )
    .unwrap();

    assert_eq!(text(&Path::new(&path).join("tracked.txt")), "saved\n");
    assert_eq!(text(&Path::new(&path).join("other.txt")), "edited other\n");
    let _ = fs::remove_dir_all(path);
}

#[test]
fn stale_discard_plan_is_rejected_before_recovery_or_mutation() {
    let path = committed_repo("discard-stale");
    write_file(&path, "tracked.txt", "first edit\n");
    let plan = plan_discard_changes(path.clone(), Some("tracked.txt".to_string())).unwrap();
    write_file(&path, "tracked.txt", "newer edit\n");

    let failure = discard_changes(
        path.clone(),
        Some("tracked.txt".to_string()),
        plan.state_token,
    )
    .unwrap_err();
    assert_eq!(failure.code, AppErrorCode::StaleDiscardPlan);
    assert_eq!(text(&Path::new(&path).join("tracked.txt")), "newer edit\n");
    assert!(get_discard_recovery(path.clone()).is_err());
    let _ = fs::remove_dir_all(path);
}

#[test]
fn restore_refuses_to_overwrite_newer_work() {
    let path = committed_repo("discard-restore-conflict");
    write_file(&path, "tracked.txt", "discard me\n");
    let plan = plan_discard_changes(path.clone(), None).unwrap();
    discard_changes(path.clone(), None, plan.state_token).unwrap();
    let recovery = get_discard_recovery(path.clone()).unwrap();
    write_file(&path, "tracked.txt", "newer work\n");

    let failure =
        restore_discarded_changes(path.clone(), recovery.recovery_id, recovery.state_token)
            .unwrap_err();
    assert_eq!(failure.code, AppErrorCode::RecoveryConflict);
    assert_eq!(text(&Path::new(&path).join("tracked.txt")), "newer work\n");
    let _ = fs::remove_dir_all(path);
}

#[test]
fn discard_handles_deleted_and_renamed_paths() {
    let path = unique_temp_dir("discard-delete-rename");
    git_init(&path);
    write_file(&path, "delete.txt", "delete\n");
    write_file(&path, "old.txt", "rename\n");
    git_add_all(&path);
    git_commit(&path, "files");
    fs::remove_file(Path::new(&path).join("delete.txt")).unwrap();
    fs::rename(
        Path::new(&path).join("old.txt"),
        Path::new(&path).join("new.txt"),
    )
    .unwrap();
    git_add_all(&path);

    let plan = plan_discard_changes(path.clone(), None).unwrap();
    discard_changes(path.clone(), None, plan.state_token).unwrap();
    assert_eq!(text(&Path::new(&path).join("delete.txt")), "delete\n");
    assert_eq!(text(&Path::new(&path).join("old.txt")), "rename\n");
    assert!(!Path::new(&path).join("new.txt").exists());
    let _ = fs::remove_dir_all(path);
}

#[test]
fn unborn_discard_and_restart_style_recovery_preserve_the_index() {
    let path = unique_temp_dir("discard-unborn");
    git_init(&path);
    write_file(&path, "first.txt", "first version\n");
    git_add_all(&path);
    let index_before = fs::read(Path::new(&path).join(".git/index")).unwrap();

    let plan = plan_discard_changes(path.clone(), None).unwrap();
    assert!(plan.is_unborn);
    assert!(plan.affects_prepared_changes);
    discard_changes(path.clone(), None, plan.state_token).unwrap();
    assert!(!Path::new(&path).join("first.txt").exists());

    // Re-read the published record instead of retaining any in-memory result,
    // matching the app-restart restore path.
    let recovery = get_discard_recovery(path.clone()).unwrap();
    restore_discarded_changes(path.clone(), recovery.recovery_id, recovery.state_token).unwrap();
    assert_eq!(text(&Path::new(&path).join("first.txt")), "first version\n");
    assert_eq!(
        fs::read(Path::new(&path).join(".git/index")).unwrap(),
        index_before
    );
    let _ = fs::remove_dir_all(path);
}

#[test]
fn discard_and_recovery_handle_a_file_to_directory_transition_without_broad_delete() {
    let path = committed_repo("discard-file-directory");
    write_file(&path, "shape", "saved file\n");
    git_add_all(&path);
    git_commit(&path, "shape file");
    fs::remove_file(Path::new(&path).join("shape")).unwrap();
    fs::create_dir(Path::new(&path).join("shape")).unwrap();
    write_file(&path, "shape/child.txt", "unsaved child\n");

    let plan = plan_discard_changes(path.clone(), None).unwrap();
    discard_changes(path.clone(), None, plan.state_token).unwrap();
    assert_eq!(text(&Path::new(&path).join("shape")), "saved file\n");

    let recovery = get_discard_recovery(path.clone()).unwrap();
    restore_discarded_changes(path.clone(), recovery.recovery_id, recovery.state_token).unwrap();
    assert!(Path::new(&path).join("shape").is_dir());
    assert_eq!(
        text(&Path::new(&path).join("shape/child.txt")),
        "unsaved child\n"
    );
    let _ = fs::remove_dir_all(path);
}

#[test]
fn conflicted_index_is_recovered_byte_for_byte() {
    let path = committed_repo("discard-conflict");
    let branch = current_branch(&path);
    assert!(git_command(&path)
        .args(["checkout", "-q", "-b", "other"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "tracked.txt", "other side\n");
    git_add_all(&path);
    git_commit(&path, "other edit");
    assert!(git_command(&path)
        .args(["checkout", "-q", &branch])
        .status()
        .unwrap()
        .success());
    write_file(&path, "tracked.txt", "current side\n");
    git_add_all(&path);
    git_commit(&path, "current edit");
    assert!(!git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "other",
        ])
        .status()
        .unwrap()
        .success());
    let index_before = fs::read(Path::new(&path).join(".git/index")).unwrap();
    let conflict_before = text(&Path::new(&path).join("tracked.txt"));

    let plan = plan_discard_changes(path.clone(), None).unwrap();
    assert!(plan.includes_conflicts);
    discard_changes(path.clone(), None, plan.state_token).unwrap();
    assert_eq!(
        text(&Path::new(&path).join("tracked.txt")),
        "current side\n"
    );

    let recovery = get_discard_recovery(path.clone()).unwrap();
    restore_discarded_changes(path.clone(), recovery.recovery_id, recovery.state_token).unwrap();
    assert_eq!(text(&Path::new(&path).join("tracked.txt")), conflict_before);
    assert_eq!(
        fs::read(Path::new(&path).join(".git/index")).unwrap(),
        index_before
    );
    let _ = fs::remove_dir_all(path);
}

#[test]
fn every_stored_discard_is_listed_and_each_one_can_be_brought_back() {
    let path = committed_repo("discard-list-recoveries");
    write_file(&path, "second.txt", "second version\n");
    git_add_all(&path);
    git_commit(&path, "second file");

    // Two files edited, then discarded one after the other with nothing else
    // touched in between: the case the app could never reach before, because
    // `latest` only ever named the second of the two records.
    write_file(&path, "tracked.txt", "first edit\n");
    write_file(&path, "second.txt", "second edit\n");
    let first_plan = plan_discard_changes(path.clone(), Some("tracked.txt".to_string())).unwrap();
    let first = discard_changes(
        path.clone(),
        Some("tracked.txt".to_string()),
        first_plan.state_token,
    )
    .unwrap();
    let second_plan = plan_discard_changes(path.clone(), Some("second.txt".to_string())).unwrap();
    let second = discard_changes(
        path.clone(),
        Some("second.txt".to_string()),
        second_plan.state_token,
    )
    .unwrap();
    assert_eq!(text(&Path::new(&path).join("tracked.txt")), "saved\n");
    assert_eq!(
        text(&Path::new(&path).join("second.txt")),
        "second version\n"
    );

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(
        listed.len(),
        2,
        "both discards are stored, not just the last"
    );
    assert_eq!(listed[0].recovery_id, second.recovery.recovery_id);
    assert_eq!(listed[1].recovery_id, first.recovery.recovery_id);
    assert_eq!(listed[0].preview_paths, vec!["second.txt".to_string()]);
    // Both are applicable: neither one's file has been written since. The
    // newest also matches the project as a whole, so it alone can put the
    // prepared state back along with them.
    assert_eq!(
        listed[0].availability,
        DiscardRecoveryAvailability::Restorable
    );
    assert!(listed[0].restores_prepared_state);
    assert_eq!(
        listed[1].availability,
        DiscardRecoveryAvailability::Restorable
    );
    assert!(!listed[1].restores_prepared_state);

    // Deliberately the older one first: the two records name different files,
    // so nothing forces an order on them.
    restore_discarded_changes(
        path.clone(),
        listed[1].recovery_id.clone(),
        listed[1].state_token.clone().unwrap(),
    )
    .unwrap();
    assert_eq!(
        text(&Path::new(&path).join("tracked.txt")),
        "first edit
"
    );

    let after = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(
        after[0].availability,
        DiscardRecoveryAvailability::Restorable
    );
    restore_discarded_changes(
        path.clone(),
        after[0].recovery_id.clone(),
        after[0].state_token.clone().unwrap(),
    )
    .unwrap();
    assert_eq!(
        text(&Path::new(&path).join("tracked.txt")),
        "first edit
"
    );
    assert_eq!(
        text(&Path::new(&path).join("second.txt")),
        "second edit
"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn work_on_other_files_no_longer_blocks_restoring_a_record_that_would_not_touch_them() {
    let path = committed_repo("discard-scoped-restore");
    write_file(&path, "other.txt", "unrelated saved\n");
    git_add_all(&path);
    git_commit(&path, "other file");
    write_file(&path, "playground.txt", "work worth keeping\n");

    let plan = plan_discard_changes(path.clone(), Some("playground.txt".to_string())).unwrap();
    discard_changes(
        path.clone(),
        Some("playground.txt".to_string()),
        plan.state_token,
    )
    .unwrap();
    assert!(!Path::new(&path).join("playground.txt").exists());

    // Ordinary work elsewhere in the project, which used to take every stored
    // record out of reach: the fingerprint covered the whole working tree.
    write_file(&path, "other.txt", "editing something else entirely\n");
    let index_before = fs::read(Path::new(&path).join(".git/index")).unwrap();

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(
        listed[0].availability,
        DiscardRecoveryAvailability::Restorable
    );
    // The record's index copy is older than the project's own prepared state
    // now, so this restore is honest about only bringing the files back.
    assert!(!listed[0].restores_prepared_state);

    restore_discarded_changes(
        path.clone(),
        listed[0].recovery_id.clone(),
        listed[0].state_token.clone().unwrap(),
    )
    .unwrap();
    assert_eq!(
        text(&Path::new(&path).join("playground.txt")),
        "work worth keeping\n"
    );
    // Untouched: neither the unrelated edit nor the prepared state was rolled
    // back to what this record happened to capture.
    assert_eq!(
        text(&Path::new(&path).join("other.txt")),
        "editing something else entirely\n"
    );
    assert_eq!(
        fs::read(Path::new(&path).join(".git/index")).unwrap(),
        index_before
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn writing_at_a_recorded_path_again_still_refuses_the_restore() {
    let path = committed_repo("discard-scoped-refusal");
    write_file(&path, "playground.txt", "first attempt\n");
    let plan = plan_discard_changes(path.clone(), Some("playground.txt".to_string())).unwrap();
    discard_changes(
        path.clone(),
        Some("playground.txt".to_string()),
        plan.state_token,
    )
    .unwrap();

    // The same path, written again after the discard. This is the work a
    // restore would destroy, and the only thing the narrowed check has to
    // catch.
    write_file(&path, "playground.txt", "started over from scratch\n");

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(
        listed[0].availability,
        DiscardRecoveryAvailability::Superseded
    );
    let failure = restore_discarded_changes(
        path.clone(),
        listed[0].recovery_id.clone(),
        listed[0].state_token.clone().unwrap(),
    )
    .unwrap_err();
    assert_eq!(failure.code, AppErrorCode::RecoveryConflict);
    assert_eq!(
        text(&Path::new(&path).join("playground.txt")),
        "started over from scratch\n"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn a_file_added_inside_a_recorded_directory_counts_as_writing_at_that_path() {
    let path = committed_repo("discard-scoped-directory");
    write_file(&path, "shape", "saved file\n");
    git_add_all(&path);
    git_commit(&path, "shape file");
    fs::remove_file(Path::new(&path).join("shape")).unwrap();
    fs::create_dir(Path::new(&path).join("shape")).unwrap();
    write_file(&path, "shape/child.txt", "unsaved child\n");

    let plan = plan_discard_changes(path.clone(), None).unwrap();
    discard_changes(path.clone(), None, plan.state_token).unwrap();
    assert_eq!(text(&Path::new(&path).join("shape")), "saved file\n");

    // Restoring turns `shape` back into a directory, so anything living under
    // that name now is in this record's way even though the name itself is
    // clean.
    fs::remove_file(Path::new(&path).join("shape")).unwrap();
    fs::create_dir(Path::new(&path).join("shape")).unwrap();
    write_file(&path, "shape/newer.txt", "written afterwards\n");

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(
        listed[0].availability,
        DiscardRecoveryAvailability::Superseded
    );
    assert_eq!(
        text(&Path::new(&path).join("shape/newer.txt")),
        "written afterwards\n"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn discarding_the_same_work_again_replaces_its_record_instead_of_listing_it_twice() {
    let path = committed_repo("discard-repeat");
    write_file(&path, "playground.txt", "work worth keeping\n");

    let first_plan =
        plan_discard_changes(path.clone(), Some("playground.txt".to_string())).unwrap();
    let first = discard_changes(
        path.clone(),
        Some("playground.txt".to_string()),
        first_plan.state_token,
    )
    .unwrap();
    restore_discarded_changes(
        path.clone(),
        first.recovery.recovery_id.clone(),
        first.recovery.state_token.clone(),
    )
    .unwrap();
    assert_eq!(
        text(&Path::new(&path).join("playground.txt")),
        "work worth keeping\n"
    );

    // Ordinary work elsewhere in the project between the two discards. It
    // changes every whole-tree fingerprint in sight, and must not change what
    // this record is understood to be protecting.
    write_file(
        &path,
        "unrelated.txt",
        "meanwhile, over here
",
    );

    // The same file, the same bytes, discarded a second time. This is one
    // recovery point reached twice, not two of them.
    let second_plan =
        plan_discard_changes(path.clone(), Some("playground.txt".to_string())).unwrap();
    let second = discard_changes(
        path.clone(),
        Some("playground.txt".to_string()),
        second_plan.state_token,
    )
    .unwrap();

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(listed.len(), 1, "the same protected state is listed once");
    assert_eq!(listed[0].recovery_id, second.recovery.recovery_id);
    restore_discarded_changes(
        path.clone(),
        listed[0].recovery_id.clone(),
        listed[0].state_token.clone().unwrap(),
    )
    .unwrap();
    assert_eq!(
        text(&Path::new(&path).join("playground.txt")),
        "work worth keeping\n"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn discarding_different_work_at_the_same_path_keeps_both_records() {
    let path = committed_repo("discard-repeat-different");
    write_file(&path, "playground.txt", "first attempt\n");
    let first_plan =
        plan_discard_changes(path.clone(), Some("playground.txt".to_string())).unwrap();
    discard_changes(
        path.clone(),
        Some("playground.txt".to_string()),
        first_plan.state_token,
    )
    .unwrap();

    // A different attempt at the same file: two discards, two distinct pieces
    // of work, and neither one may quietly stand in for the other.
    write_file(&path, "playground.txt", "second attempt\n");
    let second_plan =
        plan_discard_changes(path.clone(), Some("playground.txt".to_string())).unwrap();
    discard_changes(
        path.clone(),
        Some("playground.txt".to_string()),
        second_plan.state_token,
    )
    .unwrap();

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(listed.len(), 2);
    restore_discarded_changes(
        path.clone(),
        listed[1].recovery_id.clone(),
        listed[1].state_token.clone().unwrap(),
    )
    .unwrap();
    assert_eq!(
        text(&Path::new(&path).join("playground.txt")),
        "first attempt\n"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn deleting_a_recovery_removes_only_that_copy_and_leaves_the_pointer_usable() {
    let path = committed_repo("discard-delete-recovery");
    write_file(&path, "first.txt", "first work\n");
    let first_plan = plan_discard_changes(path.clone(), Some("first.txt".to_string())).unwrap();
    discard_changes(
        path.clone(),
        Some("first.txt".to_string()),
        first_plan.state_token,
    )
    .unwrap();
    write_file(&path, "second.txt", "second work\n");
    let second_plan = plan_discard_changes(path.clone(), Some("second.txt".to_string())).unwrap();
    let second = discard_changes(
        path.clone(),
        Some("second.txt".to_string()),
        second_plan.state_token,
    )
    .unwrap();

    let listed = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(listed.len(), 2);
    // Delete the newest, which is also the one `latest` names.
    delete_discard_recovery(path.clone(), second.recovery.recovery_id.clone()).unwrap();

    let after = list_discard_recoveries(path.clone()).unwrap();
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].recovery_id, listed[1].recovery_id);
    // The pointer followed the deletion instead of dangling at a record that
    // is no longer there.
    assert_eq!(
        get_discard_recovery(path.clone()).unwrap().recovery_id,
        listed[1].recovery_id
    );
    // The copy that remains still works.
    restore_discarded_changes(
        path.clone(),
        after[0].recovery_id.clone(),
        after[0].state_token.clone().unwrap(),
    )
    .unwrap();
    assert_eq!(text(&Path::new(&path).join("first.txt")), "first work\n");

    // And the last one leaves nothing behind to point at.
    delete_discard_recovery(path.clone(), after[0].recovery_id.clone()).unwrap();
    assert!(list_discard_recoveries(path.clone()).unwrap().is_empty());
    assert!(get_discard_recovery(path.clone()).is_err());

    let _ = fs::remove_dir_all(path);
}

#[test]
fn a_recovery_id_that_is_not_one_deletes_nothing() {
    let path = committed_repo("discard-delete-invalid");
    write_file(&path, "kept.txt", "still here\n");
    let plan = plan_discard_changes(path.clone(), Some("kept.txt".to_string())).unwrap();
    discard_changes(path.clone(), Some("kept.txt".to_string()), plan.state_token).unwrap();

    for crafted in ["../..", "..", "", "discard-1/../../..", "a/b"] {
        let failure = delete_discard_recovery(path.clone(), crafted.to_string()).unwrap_err();
        assert_eq!(failure.code, AppErrorCode::RecoveryUnavailable, "{crafted}");
    }
    // A well-shaped id that names no record is refused the same way.
    let failure = delete_discard_recovery(path.clone(), "discard-1-2-3".to_string()).unwrap_err();
    assert_eq!(failure.code, AppErrorCode::RecoveryUnavailable);
    assert_eq!(list_discard_recoveries(path.clone()).unwrap().len(), 1);

    let _ = fs::remove_dir_all(path);
}
