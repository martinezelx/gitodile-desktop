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
        None,
    )
    .expect("plan a version line without switching");
    crate::version_lines::create_version_line(
        repo.clone(),
        "audit-line".to_string(),
        false,
        None,
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
    let deleted = crate::version_lines::delete_version_line(
        repo.clone(),
        "audit-line".to_string(),
        false,
        delete_plan.state_token,
    )
    .expect("delete the retained version line");
    assert!(deleted
        .snapshot
        .lines
        .iter()
        .all(|line| line.name != "audit-line"));
    // Nothing was asked of the remote, so nothing is reported about it.
    assert_eq!(deleted.remote_deleted, None);

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_file(identity);
}

#[test]
fn version_line_history_reports_recent_versions_the_count_and_the_overflow() {
    let repo = unique_temp_dir("version-line-history");
    git_init(&repo);
    for index in 0..6 {
        write_file(
            &repo,
            "tracked.txt",
            &format!(
                "version {index}
"
            ),
        );
        git_add_all(&repo);
        git_commit(&repo, &format!("Version {index}"));
    }
    let branch = current_branch(&repo);

    let history = crate::version_lines::get_version_line_history(repo.clone(), branch.clone())
        .expect("read the active line's saved versions");
    assert_eq!(history.name, branch);
    // The panel's short list, newest first, with one more version behind it.
    assert_eq!(
        history.versions.len(),
        crate::version_lines::VERSION_LINE_HISTORY_LIMIT
    );
    assert!(history.has_more);
    assert_eq!(history.versions[0].subject, "Version 5");
    assert_eq!(history.versions[3].subject, "Version 2");
    assert!(!history.versions[0].author_name.is_empty());
    assert!(!history.versions[0].committed_at.is_empty());
    assert_ne!(history.versions[0].short_commit, history.versions[0].commit);
    // Every saved version on the line, not just the ones listed.
    assert_eq!(history.total_count, Some(6));

    // A line with fewer versions than the limit says so instead of padding.
    let create_plan = crate::version_lines::plan_create_version_line(
        repo.clone(),
        "short-line".to_string(),
        true,
        None,
    )
    .expect("plan a second line");
    crate::version_lines::create_version_line(
        repo.clone(),
        "short-line".to_string(),
        true,
        None,
        create_plan.state_token,
    )
    .expect("create and switch to a second line");
    let short =
        crate::version_lines::get_version_line_history(repo.clone(), "short-line".to_string())
            .expect("read the second line's saved versions");
    assert_eq!(short.total_count, Some(6));
    assert!(short.has_more);

    // A name that no local branch carries is refused rather than answered
    // with an empty list, which would read as "this line has no versions".
    let missing =
        crate::version_lines::get_version_line_history(repo.clone(), "no-such".to_string())
            .expect_err("refuse a line that does not exist");
    assert_eq!(missing.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(repo);
}

#[test]
fn version_line_delete_clears_the_remote_copy_and_protects_the_default_line() {
    let (repo, remote, branch) = published_repo_and_remote("vl-delete-remote");
    // A second line, published, then merged into the default one: the ordinary
    // "this is finished, clean it up" case.
    let status = git_command(&repo)
        .args(["switch", "-q", "-c", "feature/done"])
        .status()
        .expect("run git switch -c");
    assert!(status.success());
    let identity = write_test_identity_config("vl-delete-remote");
    write_file(&repo, "feature.txt", "done\n");
    git_add_all(&repo);
    git_commit(&repo, "Finish the feature");
    // `-u`, so the line carries the upstream configuration this app reads to
    // know where it is published — the same configuration the list shows as
    // "Tracks origin/feature/done".
    let status = git_command(&repo)
        .args(["push", "-q", "-u", "origin", "feature/done"])
        .status()
        .expect("publish the finished line");
    assert!(status.success());
    let status = git_command(&repo)
        .args(["switch", "-q", &branch])
        .status()
        .expect("switch back");
    assert!(status.success());
    let status = git_command(&repo)
        .args(["merge", "-q", "--no-edit", "feature/done"])
        .status()
        .expect("merge the finished line");
    assert!(status.success());

    let plan =
        crate::version_lines::plan_delete_version_line(repo.clone(), "feature/done".to_string())
            .expect("plan the delete of a finished line");
    // The plan names the published copy, so the dialog can offer to clear it
    // away instead of leaving it behind for everyone else.
    let published = plan
        .published
        .clone()
        .expect("a published line is reported");
    assert_eq!(published.remote, "origin");
    assert_eq!(published.branch, "feature/done");
    assert_eq!(plan.upstream.as_deref(), Some("origin/feature/done"));

    let deleted = crate::version_lines::delete_version_line(
        repo.clone(),
        "feature/done".to_string(),
        true,
        plan.state_token,
    )
    .expect("delete locally and on the remote");
    assert_eq!(deleted.remote_deleted, Some(true));
    assert!(deleted.remote_error.is_none());
    assert!(deleted
        .snapshot
        .lines
        .iter()
        .all(|line| line.name != "feature/done"));
    assert_eq!(remote_branch_sha(&remote, "refs/heads/feature/done"), None);

    // The remote's own default line is refused outright: it is where the
    // project's shared work lives, and no local cleanup should take it away.
    // `set-head` is what a clone writes; a project created locally and pushed
    // has no remote HEAD, and then nothing is protected on a guess.
    let status = git_command(&repo)
        .args(["remote", "set-head", "origin", &branch])
        .status()
        .expect("record the remote's default line");
    assert!(status.success());
    // Stepping off it, so the refusal under test is the default-line one
    // rather than the active-line one that is checked first.
    let status = git_command(&repo)
        .args(["switch", "-q", "-c", "scratch"])
        .status()
        .expect("step off the default line");
    assert!(status.success());

    let snapshot = crate::version_lines::get_version_lines(repo.clone()).expect("read the lines");
    let default_line = snapshot
        .lines
        .iter()
        .find(|line| line.name == branch)
        .expect("the default line is still listed");
    assert!(default_line.is_default);

    let refused_delete =
        crate::version_lines::plan_delete_version_line(repo.clone(), branch.clone())
            .expect_err("the default line cannot be deleted");
    assert_eq!(refused_delete.code, AppErrorCode::VersionLineIsDefault);
    let refused_rename = crate::version_lines::plan_rename_version_line(
        repo.clone(),
        branch.clone(),
        "trunk".to_string(),
    )
    .expect_err("the default line cannot be renamed");
    assert_eq!(refused_rename.code, AppErrorCode::VersionLineIsDefault);

    for path in [&repo, &remote] {
        let _ = fs::remove_dir_all(path);
    }
    let _ = fs::remove_file(identity);
}

#[test]
fn version_line_delete_keeps_its_promise_for_work_that_only_a_sibling_line_holds() {
    // The case the screen used to get wrong. `git branch -d` accepts a branch
    // merged into HEAD or into its own upstream and nothing else, while this
    // app calls a line safe when *any* other ref reaches its tip. A line whose
    // work lives only on a sibling was advertised as "Safe to delete" and then
    // refused on the way out.
    let repo = unique_temp_dir("vl-delete-sibling");
    git_init(&repo);
    let identity = write_test_identity_config("vl-delete-sibling");
    write_file(&repo, "a.txt", "one\n");
    git_add_all(&repo);
    git_commit(&repo, "First version");
    let trunk = current_branch(&repo);

    let status = git_command(&repo)
        .args(["switch", "-q", "-c", "keeper"])
        .status()
        .expect("run git switch -c");
    assert!(status.success());
    write_file(&repo, "shared.txt", "shared\n");
    git_add_all(&repo);
    git_commit(&repo, "Work both lines share");
    // `spun-off` is identical to `keeper`, so every commit on it is reachable
    // from `keeper` — and from nothing `git branch -d` accepts, since the trunk
    // is behind it and there is no upstream.
    let status = git_command(&repo)
        .args(["branch", "spun-off"])
        .status()
        .expect("run git branch");
    assert!(status.success());
    let status = git_command(&repo)
        .args(["switch", "-q", &trunk])
        .status()
        .expect("switch back to the trunk");
    assert!(status.success());

    let plan = crate::version_lines::plan_delete_version_line(repo.clone(), "spun-off".to_string())
        .expect("a line whose work a sibling holds is safe to delete");
    assert!(plan
        .retained_by
        .iter()
        .any(|reference| reference == "refs/heads/keeper"));

    let deleted = crate::version_lines::delete_version_line(
        repo.clone(),
        "spun-off".to_string(),
        false,
        plan.state_token,
    )
    .expect("what the plan promised is what the delete does");
    assert!(deleted
        .snapshot
        .lines
        .iter()
        .all(|line| line.name != "spun-off"));
    // The work itself is untouched: the sibling still holds every commit.
    assert!(deleted
        .snapshot
        .lines
        .iter()
        .any(|line| line.name == "keeper"));

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_file(identity);
}

#[test]
fn version_line_rename_moves_the_name_and_refuses_one_already_in_use() {
    let repo = unique_temp_dir("vl-rename");
    git_init(&repo);
    let identity = write_test_identity_config("vl-rename");
    write_file(&repo, "a.txt", "one\n");
    git_add_all(&repo);
    git_commit(&repo, "First version");
    let trunk = current_branch(&repo);
    let status = git_command(&repo)
        .args(["switch", "-q", "-c", "feature/old-name"])
        .status()
        .expect("run git switch -c");
    assert!(status.success());
    write_file(&repo, "b.txt", "two\n");
    git_add_all(&repo);
    git_commit(&repo, "Second version");

    let plan = crate::version_lines::plan_rename_version_line(
        repo.clone(),
        "feature/old-name".to_string(),
        "feature/new-name".to_string(),
    )
    .expect("plan a rename of the active line");
    // Nothing is lost and nothing leaves this computer, so this is not a
    // destructive operation and needs no confirmation step of its own.
    assert_eq!(plan.operation_kind, OperationKind::LocalMutation);
    assert!(plan.is_active);
    assert!(!plan.requires_confirmation);

    let before = crate::version_lines::get_version_lines(repo.clone()).expect("read before");
    let tip = before
        .lines
        .iter()
        .find(|line| line.name == "feature/old-name")
        .expect("the line to rename is listed")
        .tip
        .commit
        .clone();

    let snapshot = crate::version_lines::rename_version_line(
        repo.clone(),
        "feature/old-name".to_string(),
        "feature/new-name".to_string(),
        plan.state_token,
    )
    .expect("rename the active line");
    assert_eq!(snapshot.branch.as_deref(), Some("feature/new-name"));
    let renamed = snapshot
        .lines
        .iter()
        .find(|line| line.name == "feature/new-name")
        .expect("the renamed line is listed");
    // A rename moves a name, never a saved version.
    assert_eq!(renamed.tip.commit, tip);
    assert!(snapshot
        .lines
        .iter()
        .all(|line| line.name != "feature/old-name"));

    // A name another line already holds is refused before anything moves.
    let taken = crate::version_lines::plan_rename_version_line(
        repo.clone(),
        "feature/new-name".to_string(),
        trunk.clone(),
    )
    .expect_err("a name in use is refused");
    assert_eq!(taken.code, AppErrorCode::VersionLineNameTaken);

    // And a line that no longer exists is refused rather than answered.
    let missing = crate::version_lines::plan_rename_version_line(
        repo.clone(),
        "feature/old-name".to_string(),
        "whatever".to_string(),
    )
    .expect_err("a line that is gone cannot be renamed");
    assert_eq!(missing.code, AppErrorCode::InvalidSelection);

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
