use crate::test_support::*;
use crate::*;
use std::fs;
use std::path::Path;

fn clone_remote(remote: &str, label: &str) -> String {
    let clone = unique_temp_dir(label);
    let status = base_git_command()
        .args(["clone", "-q", remote, &clone])
        .status()
        .expect("clone the temporary remote");
    assert!(status.success(), "temporary remote clone should succeed");
    clone
}

fn push_current_branch(path: &str, branch: &str) {
    let status = git_command(path)
        .args(["push", "-q", "origin", branch])
        .status()
        .expect("push the temporary branch");
    assert!(status.success(), "temporary branch push should succeed");
}

#[test]
fn core_workflow_journey_opens_inspects_saves_checks_gets_publishes_and_reopens() {
    let repo = unique_temp_dir("core-journey");
    git_init(&repo);
    let identity = write_test_identity_config("core-journey");
    let nested = Path::new(&repo).join("nested").join("selection");
    fs::create_dir_all(&nested).expect("create nested project selection");

    let opened = open_repository(repo.clone(), None).expect("open from project root");
    let nested_open = open_repository(
        nested.to_string_lossy().to_string(),
        Some(opened.session_epoch.clone()),
    )
    .expect("open the same project from a nested folder");
    assert_eq!(nested_open.path, opened.path);
    assert_eq!(nested_open.session_epoch, opened.session_epoch);
    assert_ne!(nested_open.selected_path, opened.path);

    write_file(&repo, "selected.txt", "selected change\n");
    write_file(&repo, "remaining.txt", "remaining change\n");
    let dirty = read_working_tree_status(repo.clone()).expect("inspect dirty status");
    assert_eq!(dirty.counts.total, 2);
    let diffs = read_working_tree_diffs(repo.clone())
        .expect("inspect dirty diffs")
        .diffs;
    assert!(find_diff(&diffs, "selected.txt").is_some());
    assert!(find_diff(&diffs, "remaining.txt").is_some());

    let selected_paths = Some(vec!["selected.txt".to_string()]);
    let selected_plan = in_test_frame(|| {
        plan_save_version_selection_with_identity_override(
            repo.clone(),
            selected_paths.clone(),
            Some(&identity),
        )
    })
    .expect("plan a selected-file save");
    assert!(selected_plan.is_partial);
    in_test_frame(|| {
        save_version_selection_with_identity_override(
            repo.clone(),
            "Save selected file".to_string(),
            None,
            selected_plan.state_token,
            selected_paths,
            true,
            Some(&identity),
        )
    })
    .expect("save only the selected file");
    let remaining = read_working_tree_status(repo.clone()).expect("inspect remaining change");
    assert_eq!(remaining.counts.total, 1);
    assert_eq!(remaining.entries[0].path, "remaining.txt");

    let all_plan = plan_save_version_with_identity_override(repo.clone(), Some(&identity))
        .expect("plan the remaining save");
    save_version_with_identity_override(
        repo.clone(),
        "Save remaining file".to_string(),
        Some("Complete the first local checkpoint.".to_string()),
        all_plan.state_token,
        Some(&identity),
    )
    .expect("save every remaining change");
    assert!(read_working_tree_status(repo.clone()).unwrap().is_clean);

    let remote = unique_temp_dir("core-journey-remote");
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);
    let first_publish_plan =
        plan_publish(repo.clone(), None, None).expect("plan the first publish");
    let branch = first_publish_plan.local_branch.clone();
    publish(
        repo.clone(),
        first_publish_plan.target.remote,
        first_publish_plan.state_token,
        None,
        true,
    )
    .expect("publish the initial saved versions");
    assert_eq!(
        check_team_changes(repo.clone(), opened.session_epoch.clone())
            .expect("check an up-to-date remote")
            .state,
        TeamSyncState::UpToDate
    );

    let teammate = clone_remote(&remote, "core-journey-teammate");
    write_file(&teammate, "team.txt", "team update\n");
    git_add_all(&teammate);
    git_commit(&teammate, "Team update");
    push_current_branch(&teammate, &branch);

    let behind = check_team_changes(repo.clone(), opened.session_epoch.clone())
        .expect("fetch and classify the team update");
    assert_eq!(behind.state, TeamSyncState::Behind);
    assert_eq!((behind.ahead, behind.behind), (0, 1));
    let get_plan = plan_get_team_changes(repo.clone(), opened.session_epoch.clone(), |_| {})
        .expect("plan the strict fast-forward update");
    let get_result = get_team_changes(
        repo.clone(),
        opened.session_epoch.clone(),
        get_plan.state_token,
        get_plan.recovery.reference,
        |_| {},
    )
    .expect("apply the strict fast-forward update");
    assert_eq!(get_result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(
        fs::read_to_string(Path::new(&repo).join("team.txt"))
            .unwrap()
            .replace("\r\n", "\n"),
        "team update\n"
    );

    write_file(&repo, "after-get.txt", "publish after get\n");
    let post_get_plan = plan_save_version_with_identity_override(repo.clone(), Some(&identity))
        .expect("plan a save after getting team changes");
    save_version_with_identity_override(
        repo.clone(),
        "Save after team update".to_string(),
        None,
        post_get_plan.state_token,
        Some(&identity),
    )
    .expect("save after getting team changes");
    let publish_plan = plan_publish(repo.clone(), None, None).expect("plan the second publish");
    let publish_result = publish(
        repo.clone(),
        publish_plan.target.remote,
        publish_plan.state_token,
        None,
        true,
    )
    .expect("publish after getting team changes");
    assert_eq!(publish_result.published_count, 1);

    crate::session::global()
        .close(&opened.path, &opened.session_epoch)
        .expect("close the project session");
    assert_eq!(
        crate::session::global()
            .validate(&opened.path, &opened.session_epoch)
            .unwrap_err()
            .code,
        AppErrorCode::StaleSession
    );
    let reopened = open_repository(repo.clone(), None).expect("reopen the project");
    assert_ne!(reopened.session_epoch, opened.session_epoch);
    assert!(read_working_tree_status(repo.clone()).unwrap().is_clean);
    assert_eq!(
        check_team_changes(repo.clone(), reopened.session_epoch.clone())
            .expect("check after reopening")
            .state,
        TeamSyncState::UpToDate
    );

    let isolated = unique_temp_dir("core-journey-isolated-session");
    git_init(&isolated);
    let other = open_repository(isolated.clone(), None).expect("open another project");
    assert_ne!(other.session_epoch, reopened.session_epoch);
    crate::session::global()
        .close(&reopened.path, &reopened.session_epoch)
        .expect("close only the first project");
    crate::session::global()
        .validate(&other.path, &other.session_epoch)
        .expect("the other project session stays valid");
    crate::session::global()
        .close(&other.path, &other.session_epoch)
        .expect("close the isolated project");

    for path in [repo, remote, teammate, isolated] {
        let _ = fs::remove_dir_all(path);
    }
    let _ = fs::remove_file(identity);
}

#[test]
fn discard_and_version_line_journey_undoes_then_creates_switches_and_deletes() {
    let repo = unique_temp_dir("discard-version-lines-journey");
    git_init(&repo);
    write_file(&repo, "tracked.txt", "saved\n");
    git_add_all(&repo);
    git_commit(&repo, "Initial version");
    let original_branch = current_branch(&repo);

    write_file(&repo, "tracked.txt", "unsaved\n");
    write_file(&repo, "other.txt", "other unsaved\n");
    let discard_plan = plan_discard_changes(repo.clone(), Some("tracked.txt".to_string()))
        .expect("plan a selected discard");
    let discard = discard_changes(
        repo.clone(),
        Some("tracked.txt".to_string()),
        discard_plan.state_token,
    )
    .expect("discard one selected file");
    assert_eq!(
        fs::read_to_string(Path::new(&repo).join("tracked.txt"))
            .unwrap()
            .replace("\r\n", "\n"),
        "saved\n"
    );
    assert!(Path::new(&repo).join("other.txt").exists());
    restore_discarded_changes(
        repo.clone(),
        discard.recovery.recovery_id,
        discard.recovery.state_token,
    )
    .expect("undo the selected discard");
    assert_eq!(
        fs::read_to_string(Path::new(&repo).join("tracked.txt")).unwrap(),
        "unsaved\n"
    );

    let identity = write_test_identity_config("discard-version-lines-journey");
    let save_plan = plan_save_version_with_identity_override(repo.clone(), Some(&identity))
        .expect("plan the recovered work save");
    save_version_with_identity_override(
        repo.clone(),
        "Keep recovered work".to_string(),
        None,
        save_plan.state_token,
        Some(&identity),
    )
    .expect("save the recovered work");

    let create_plan = crate::version_lines::plan_create_version_line(
        repo.clone(),
        "audit-line".to_string(),
        false,
    )
    .expect("plan a version line without switching");
    crate::version_lines::create_version_line(
        repo.clone(),
        "audit-line".to_string(),
        false,
        create_plan.state_token,
    )
    .expect("create a version line");
    let switch_plan =
        crate::version_lines::plan_switch_version_line(repo.clone(), "audit-line".to_string())
            .expect("plan the switch");
    crate::version_lines::switch_version_line(
        repo.clone(),
        "audit-line".to_string(),
        switch_plan.state_token,
    )
    .expect("switch to the created version line");
    assert_eq!(current_branch(&repo), "audit-line");

    let switch_back =
        crate::version_lines::plan_switch_version_line(repo.clone(), original_branch.clone())
            .expect("plan switching back");
    crate::version_lines::switch_version_line(
        repo.clone(),
        original_branch,
        switch_back.state_token,
    )
    .expect("switch back to the original line");
    let delete_plan =
        crate::version_lines::plan_delete_version_line(repo.clone(), "audit-line".to_string())
            .expect("plan a safe retained-line deletion");
    let snapshot = crate::version_lines::delete_version_line(
        repo.clone(),
        "audit-line".to_string(),
        delete_plan.state_token,
    )
    .expect("delete the retained version line");
    assert!(snapshot.lines.iter().all(|line| line.name != "audit-line"));

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_file(identity);
}

#[test]
fn repository_state_journey_covers_unborn_dirty_clean_detached_conflicted_and_sync_relations() {
    let unborn = unique_temp_dir("state-journey-unborn");
    git_init(&unborn);
    assert_eq!(
        open_repository(unborn.clone(), None).unwrap().head_state,
        HeadState::Unborn
    );
    assert!(read_working_tree_status(unborn.clone()).unwrap().is_clean);
    write_file(&unborn, "first.txt", "first\n");
    assert!(!read_working_tree_status(unborn.clone()).unwrap().is_clean);

    let detached = unique_temp_dir("state-journey-detached");
    git_init(&detached);
    git_commit_empty(&detached);
    assert!(git_command(&detached)
        .args(["checkout", "--detach", "-q"])
        .status()
        .unwrap()
        .success());
    assert_eq!(
        open_repository(detached.clone(), None).unwrap().head_state,
        HeadState::Detached
    );

    let conflicted = unique_temp_dir("state-journey-conflicted");
    git_init(&conflicted);
    write_file(&conflicted, "conflict.txt", "base\n");
    git_add_all(&conflicted);
    git_commit(&conflicted, "Base");
    let main_branch = current_branch(&conflicted);
    assert!(git_command(&conflicted)
        .args(["switch", "-q", "-c", "other"])
        .status()
        .unwrap()
        .success());
    write_file(&conflicted, "conflict.txt", "other\n");
    git_add_all(&conflicted);
    git_commit(&conflicted, "Other side");
    assert!(git_command(&conflicted)
        .args(["switch", "-q", &main_branch])
        .status()
        .unwrap()
        .success());
    write_file(&conflicted, "conflict.txt", "main\n");
    git_add_all(&conflicted);
    git_commit(&conflicted, "Main side");
    let merge = git_command(&conflicted)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "--no-edit",
            "other",
        ])
        .status()
        .expect("create an intentional conflict");
    assert!(!merge.success(), "the fixture merge must conflict");
    let conflict_status = read_working_tree_status(conflicted.clone()).unwrap();
    assert_eq!(conflict_status.counts.conflicted, 1);
    assert!(matches!(
        read_file_diff(conflicted.clone(), "conflict.txt".to_string()).unwrap(),
        FileDiff::Conflict { .. }
    ));
    assert!(read_working_tree_diffs(conflicted.clone())
        .unwrap()
        .diffs
        .is_empty());

    let (ahead_repo, ahead_remote, _) = published_repo_and_remote("state-journey-ahead");
    write_file(&ahead_repo, "local.txt", "local\n");
    git_add_all(&ahead_repo);
    git_commit(&ahead_repo, "Local ahead");
    assert_eq!(
        check_team_changes(ahead_repo.clone(), "state-ahead".to_string())
            .unwrap()
            .state,
        TeamSyncState::Ahead
    );

    let (behind_repo, behind_remote, branch) =
        published_repo_and_remote("state-journey-behind-diverged");
    let teammate = clone_remote(&behind_remote, "state-journey-behind-teammate");
    write_file(&teammate, "team.txt", "team\n");
    git_add_all(&teammate);
    git_commit(&teammate, "Team ahead");
    push_current_branch(&teammate, &branch);
    assert_eq!(
        check_team_changes(behind_repo.clone(), "state-behind".to_string())
            .unwrap()
            .state,
        TeamSyncState::Behind
    );
    write_file(&behind_repo, "local.txt", "local\n");
    git_add_all(&behind_repo);
    git_commit(&behind_repo, "Local divergence");
    let diverged = check_team_changes(behind_repo.clone(), "state-diverged".to_string()).unwrap();
    assert_eq!(diverged.state, TeamSyncState::Diverged);
    let head_before = git_stdout(&test_git(&behind_repo, &["rev-parse", "HEAD"]).unwrap());
    let blocked = plan_get_team_changes(behind_repo.clone(), "state-diverged".to_string(), |_| {})
        .expect_err("diverged histories must stop before mutation");
    assert_eq!(blocked.code, AppErrorCode::DivergedHistories);
    assert!(blocked.remediation.is_some());
    assert_eq!(
        git_stdout(&test_git(&behind_repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );

    for path in [
        unborn,
        detached,
        conflicted,
        ahead_repo,
        ahead_remote,
        behind_repo,
        behind_remote,
        teammate,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}
