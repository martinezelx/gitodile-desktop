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
    let get_plan = plan_get_team_changes(repo.clone(), opened.session_epoch.clone())
        .expect("plan the strict fast-forward update");
    let get_result = get_team_changes(
        repo.clone(),
        opened.session_epoch.clone(),
        get_plan.state_token,
        get_plan.recovery.reference,
        true,
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
fn branch_history_reports_recent_versions_the_count_and_the_overflow() {
    let repo = unique_temp_dir("branch-history");
    git_init(&repo);
    let versions: Vec<_> = (0..10)
        .map(|index| (format!("Version {index}"), format!("version {index}\n")))
        .collect();
    git_commit_series(&repo, Some("tracked.txt"), &versions);
    let branch = current_branch(&repo);

    let history = crate::branches::get_branch_history(repo.clone(), branch.clone())
        .expect("read the active branch's saved versions");
    assert_eq!(history.name, branch);
    // The panel's short list, newest first, with one more version behind it.
    assert_eq!(
        history.versions.len(),
        crate::branches::BRANCH_HISTORY_LIMIT
    );
    assert!(history.has_more);
    assert_eq!(history.versions[0].subject, "Version 9");
    assert_eq!(history.versions[7].subject, "Version 2");
    assert!(!history.versions[0].author_name.is_empty());
    assert!(!history.versions[0].committed_at.is_empty());
    assert_ne!(history.versions[0].short_commit, history.versions[0].commit);
    // Every saved version on the branch, not just the ones listed.
    assert_eq!(history.total_count, Some(10));

    // A branch with fewer versions than the limit says so instead of padding.
    let create_plan =
        crate::branches::plan_create_branch(repo.clone(), "short-branch".to_string(), true, None)
            .expect("plan a second branch");
    crate::branches::create_branch(
        repo.clone(),
        "short-branch".to_string(),
        true,
        None,
        create_plan.state_token,
    )
    .expect("create and switch to a second branch");
    let short = crate::branches::get_branch_history(repo.clone(), "short-branch".to_string())
        .expect("read the second branch's saved versions");
    assert_eq!(short.total_count, Some(10));
    assert!(short.has_more);

    // A name that no local branch carries is refused rather than answered
    // with an empty list, which would read as "this branch has no versions".
    let missing = crate::branches::get_branch_history(repo.clone(), "no-such".to_string())
        .expect_err("refuse a branch that does not exist");
    assert_eq!(missing.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(repo);
}

#[test]
fn branch_delete_clears_the_remote_copy_and_protects_the_default_branch() {
    let (repo, remote, branch) = published_repo_and_remote("vl-delete-remote");
    // A second branch, published, then merged into the default one: the ordinary
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
    // `-u`, so the branch carries the upstream configuration this app reads to
    // know where it is published — the same configuration the list shows as
    // "Tracks origin/feature/done".
    let status = git_command(&repo)
        .args(["push", "-q", "-u", "origin", "feature/done"])
        .status()
        .expect("publish the finished branch");
    assert!(status.success());
    let status = git_command(&repo)
        .args(["switch", "-q", &branch])
        .status()
        .expect("switch back");
    assert!(status.success());
    let status = git_command(&repo)
        .args(["merge", "-q", "--no-edit", "feature/done"])
        .status()
        .expect("merge the finished branch");
    assert!(status.success());

    let plan = crate::branches::plan_delete_branch(repo.clone(), "feature/done".to_string())
        .expect("plan the delete of a finished branch");
    // The plan names the published copy, so the dialog can offer to clear it
    // away instead of leaving it behind for everyone else.
    let published = plan
        .published
        .clone()
        .expect("a published branch is reported");
    assert_eq!(published.remote, "origin");
    assert_eq!(published.branch, "feature/done");
    assert_eq!(plan.upstream.as_deref(), Some("origin/feature/done"));

    let deleted = crate::branches::delete_branch(
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
        .branches
        .iter()
        .all(|candidate| candidate.name != "feature/done"));
    assert_eq!(remote_branch_sha(&remote, "refs/heads/feature/done"), None);

    // The remote's own default branch is refused outright: it is where the
    // project's shared work lives, and no local cleanup should take it away.
    // `set-head` is what a clone writes; a project created locally and pushed
    // has no remote HEAD, and then nothing is protected on a guess.
    let status = git_command(&repo)
        .args(["remote", "set-head", "origin", &branch])
        .status()
        .expect("record the remote's default branch");
    assert!(status.success());
    // Stepping off it, so the refusal under test is the default-branch one
    // rather than the active-branch one that is checked first.
    let status = git_command(&repo)
        .args(["switch", "-q", "-c", "scratch"])
        .status()
        .expect("step off the default branch");
    assert!(status.success());

    let snapshot = crate::branches::get_branches(repo.clone()).expect("read the branches");
    let default_branch = snapshot
        .branches
        .iter()
        .find(|candidate| candidate.name == branch)
        .expect("the default branch is still listed");
    assert!(default_branch.is_default);

    let refused_delete = crate::branches::plan_delete_branch(repo.clone(), branch.clone())
        .expect_err("the default branch cannot be deleted");
    assert_eq!(refused_delete.code, AppErrorCode::BranchIsDefault);
    let refused_rename =
        crate::branches::plan_rename_branch(repo.clone(), branch.clone(), "trunk".to_string())
            .expect_err("the default branch cannot be renamed");
    assert_eq!(refused_rename.code, AppErrorCode::BranchIsDefault);

    for path in [&repo, &remote] {
        let _ = fs::remove_dir_all(path);
    }
    let _ = fs::remove_file(identity);
}

#[test]
fn branch_delete_keeps_its_promise_for_work_that_only_a_sibling_branch_holds() {
    // The case the screen used to get wrong. `git branch -d` accepts a branch
    // merged into HEAD or into its own upstream and nothing else, while this
    // app calls a branch safe when *any* other ref reaches its tip. A branch whose
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
    git_commit(&repo, "Work both branches share");
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

    let plan = crate::branches::plan_delete_branch(repo.clone(), "spun-off".to_string())
        .expect("a branch whose work a sibling holds is safe to delete");
    assert!(plan
        .retained_by
        .iter()
        .any(|reference| reference == "refs/heads/keeper"));

    let deleted = crate::branches::delete_branch(
        repo.clone(),
        "spun-off".to_string(),
        false,
        plan.state_token,
    )
    .expect("what the plan promised is what the delete does");
    assert!(deleted
        .snapshot
        .branches
        .iter()
        .all(|candidate| candidate.name != "spun-off"));
    // The work itself is untouched: the sibling still holds every commit.
    assert!(deleted
        .snapshot
        .branches
        .iter()
        .any(|candidate| candidate.name == "keeper"));

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_file(identity);
}

#[test]
fn branch_rename_moves_the_name_and_refuses_one_already_in_use() {
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

    let plan = crate::branches::plan_rename_branch(
        repo.clone(),
        "feature/old-name".to_string(),
        "feature/new-name".to_string(),
    )
    .expect("plan a rename of the active branch");
    // Nothing is lost and nothing leaves this computer, so this is not a
    // destructive operation and needs no confirmation step of its own.
    assert_eq!(plan.operation_kind, OperationKind::LocalMutation);
    assert!(plan.is_active);
    assert!(!plan.requires_confirmation);

    let before = crate::branches::get_branches(repo.clone()).expect("read before");
    let tip = before
        .branches
        .iter()
        .find(|candidate| candidate.name == "feature/old-name")
        .expect("the branch to rename is listed")
        .tip
        .commit
        .clone();

    let snapshot = crate::branches::rename_branch(
        repo.clone(),
        "feature/old-name".to_string(),
        "feature/new-name".to_string(),
        plan.state_token,
    )
    .expect("rename the active branch");
    assert_eq!(snapshot.branch.as_deref(), Some("feature/new-name"));
    let renamed = snapshot
        .branches
        .iter()
        .find(|candidate| candidate.name == "feature/new-name")
        .expect("the renamed branch is listed");
    // A rename moves a name, never a saved version.
    assert_eq!(renamed.tip.commit, tip);
    assert!(snapshot
        .branches
        .iter()
        .all(|candidate| candidate.name != "feature/old-name"));

    // A name another branch already holds is refused before anything moves.
    let taken = crate::branches::plan_rename_branch(
        repo.clone(),
        "feature/new-name".to_string(),
        trunk.clone(),
    )
    .expect_err("a name in use is refused");
    assert_eq!(taken.code, AppErrorCode::BranchNameTaken);

    // And a branch that no longer exists is refused rather than answered.
    let missing = crate::branches::plan_rename_branch(
        repo.clone(),
        "feature/old-name".to_string(),
        "whatever".to_string(),
    )
    .expect_err("a branch that is gone cannot be renamed");
    assert_eq!(missing.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_file(identity);
}
