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
        .args(["merge", "other"])
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
