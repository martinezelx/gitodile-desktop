use crate::test_support::*;
use crate::*;
use crate::{application, recovery::HistoryRecoveryMetadata};
use std::fs;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

static SYNC_TEST_LOCK: Mutex<()> = Mutex::new(());

fn sync_test_guard() -> MutexGuard<'static, ()> {
    SYNC_TEST_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn session(label: &str) -> String {
    format!("sync-epoch-{label}")
}

fn clone_remote(remote: &str, label: &str) -> String {
    let other = unique_temp_dir(label);
    let status = base_git_command()
        .args(["clone", "-q", remote, &other])
        .status()
        .expect("clone remote");
    assert!(status.success());
    other
}

#[test]
fn local_sync_status_covers_unborn_detached_no_remote_and_no_upstream() {
    let _guard = sync_test_guard();
    let unborn = unique_temp_dir("sync-unborn");
    git_init(&unborn);
    let unborn_status = read_team_sync_status(unborn.clone(), session("unborn")).unwrap();
    assert_eq!(unborn_status.state, TeamSyncState::Unborn);
    assert_eq!(unborn_status.knowledge, SyncKnowledge::Cached);
    assert!(unborn_status.checked_at.is_none());

    let no_remote = unique_temp_dir("sync-no-remote");
    git_init(&no_remote);
    git_commit_empty(&no_remote);
    let no_remote_status = read_team_sync_status(no_remote.clone(), session("no-remote")).unwrap();
    assert_eq!(no_remote_status.state, TeamSyncState::NoRemote);

    let detached = unique_temp_dir("sync-detached");
    git_init(&detached);
    git_commit_empty(&detached);
    assert!(git_command(&detached)
        .args(["checkout", "--detach", "-q"])
        .status()
        .unwrap()
        .success());
    let detached_status = read_team_sync_status(detached.clone(), session("detached")).unwrap();
    assert_eq!(detached_status.state, TeamSyncState::Detached);

    let no_upstream = unique_temp_dir("sync-no-upstream");
    git_init(&no_upstream);
    git_commit_empty(&no_upstream);
    let remote = unique_temp_dir("sync-no-upstream-remote");
    init_bare_remote(&remote);
    wire_remote(&no_upstream, "first", &remote);
    let second = unique_temp_dir("sync-no-upstream-second");
    init_bare_remote(&second);
    wire_remote(&no_upstream, "second", &second);
    let no_upstream_status =
        check_team_changes(no_upstream.clone(), session("no-upstream")).unwrap();
    assert_eq!(no_upstream_status.state, TeamSyncState::NoUpstream);
    assert_eq!(no_upstream_status.knowledge, SyncKnowledge::Cached);
    assert!(no_upstream_status.checked_at.is_none());

    for path in [unborn, no_remote, detached, no_upstream, remote, second] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn explicit_check_reports_fresh_up_to_date_and_preserves_head_index_and_files() {
    let _guard = sync_test_guard();
    let (repo, remote, _branch) = published_repo_and_remote("sync-fresh");
    write_file(&repo, "untracked.txt", "keep me\n");
    let head_before = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let index_path = in_test_frame(|| resolve_index_path(&repo)).unwrap();
    let index_before = fs::read(&index_path).unwrap();
    let file_before = fs::read(Path::new(&repo).join("untracked.txt")).unwrap();

    let cached = read_team_sync_status(repo.clone(), session("fresh")).unwrap();
    assert_eq!(cached.state, TeamSyncState::UpToDate);
    assert_eq!(cached.knowledge, SyncKnowledge::Cached);
    assert!(cached.checked_at.is_none());

    let fresh = check_team_changes(repo.clone(), session("fresh")).unwrap();
    assert_eq!(fresh.state, TeamSyncState::UpToDate);
    assert_eq!(fresh.knowledge, SyncKnowledge::Fresh);
    assert!(fresh.checked_at.is_some());
    assert_eq!(fresh.ahead, 0);
    assert_eq!(fresh.behind, 0);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );
    assert_eq!(fs::read(index_path).unwrap(), index_before);
    assert_eq!(
        fs::read(Path::new(&repo).join("untracked.txt")).unwrap(),
        file_before
    );

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn explicit_check_classifies_ahead_behind_and_diverged_from_commit_ancestry() {
    let _guard = sync_test_guard();
    let (ahead_repo, ahead_remote, _) = published_repo_and_remote("sync-ahead");
    write_file(&ahead_repo, "ahead.txt", "local\n");
    git_add_all(&ahead_repo);
    git_commit(&ahead_repo, "ahead");
    let ahead = check_team_changes(ahead_repo.clone(), session("ahead")).unwrap();
    assert_eq!(ahead.state, TeamSyncState::Ahead);
    assert_eq!((ahead.ahead, ahead.behind), (1, 0));

    let (behind_repo, behind_remote, behind_branch) = published_repo_and_remote("sync-behind");
    let behind_other = clone_remote(&behind_remote, "sync-behind-other");
    write_file(&behind_other, "team.txt", "team\n");
    git_add_all(&behind_other);
    git_commit(&behind_other, "team");
    assert!(git_command(&behind_other)
        .args(["push", "-q", "origin", &behind_branch])
        .status()
        .unwrap()
        .success());
    let behind = check_team_changes(behind_repo.clone(), session("behind")).unwrap();
    assert_eq!(behind.state, TeamSyncState::Behind);
    assert_eq!((behind.ahead, behind.behind), (0, 1));

    write_file(&behind_repo, "local.txt", "local\n");
    git_add_all(&behind_repo);
    git_commit(&behind_repo, "local");
    let diverged = check_team_changes(behind_repo.clone(), session("diverged")).unwrap();
    assert_eq!(diverged.state, TeamSyncState::Diverged);
    assert_eq!((diverged.ahead, diverged.behind), (1, 1));

    for path in [
        ahead_repo,
        ahead_remote,
        behind_repo,
        behind_remote,
        behind_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn check_updates_only_the_configured_upstream_tracking_ref() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("sync-one-tracking");
    let other_remote = unique_temp_dir("sync-one-tracking-other-remote");
    init_bare_remote(&other_remote);
    wire_remote(&repo, "other", &other_remote);
    assert!(git_command(&repo)
        .args(["update-ref", "refs/remotes/other/sentinel", "HEAD"])
        .status()
        .unwrap()
        .success());
    let sentinel_before =
        git_stdout(&test_git(&repo, &["rev-parse", "refs/remotes/other/sentinel"]).unwrap());

    let other = clone_remote(&remote, "sync-one-tracking-clone");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    let fresh = check_team_changes(repo.clone(), session("one-tracking")).unwrap();
    assert_eq!(fresh.state, TeamSyncState::Behind);
    assert_eq!(fresh.upstream_remote.as_deref(), Some("origin"));
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "refs/remotes/other/sentinel"]).unwrap()),
        sentinel_before
    );

    for path in [repo, remote, other_remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn removed_upstream_fails_without_claiming_freshness_or_pruning_cached_tracking() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("sync-removed");
    let tracking = format!("refs/remotes/origin/{branch}");
    let cached_before = git_stdout(&test_git(&repo, &["rev-parse", &tracking]).unwrap());
    assert!(git_command(&remote)
        .args(["update-ref", "-d", &format!("refs/heads/{branch}")])
        .status()
        .unwrap()
        .success());

    let error = check_team_changes(repo.clone(), session("removed"))
        .expect_err("a removed configured upstream must not look fresh");
    assert_eq!(error.code, AppErrorCode::RemoteRefMissing);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &tracking]).unwrap()),
        cached_before,
        "the explicit no-prune policy retains the last known tracking ref"
    );

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn malformed_or_unreachable_upstreams_fail_without_guessing_another_remote() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("sync-invalid-config");
    let second = unique_temp_dir("sync-invalid-config-second");
    init_bare_remote(&second);
    wire_remote(&repo, "second", &second);
    assert!(git_command(&repo)
        .args(["config", &format!("branch.{branch}.remote"), "missing"])
        .status()
        .unwrap()
        .success());
    let invalid = check_team_changes(repo.clone(), session("invalid-config")).unwrap_err();
    assert_eq!(invalid.code, AppErrorCode::InvalidRemoteConfiguration);

    assert!(git_command(&repo)
        .args(["config", &format!("branch.{branch}.remote"), "origin"])
        .status()
        .unwrap()
        .success());
    let missing_path = unique_temp_dir("sync-unreachable-placeholder");
    let _ = fs::remove_dir_all(&missing_path);
    assert!(git_command(&repo)
        .args(["remote", "set-url", "origin", &missing_path])
        .status()
        .unwrap()
        .success());
    let unreachable = check_team_changes(repo.clone(), session("unreachable")).unwrap_err();
    assert_eq!(unreachable.code, AppErrorCode::GitCommandFailed);
    assert!(unreachable
        .detail
        .as_deref()
        .is_some_and(|detail| !detail.is_empty()));

    for path in [repo, remote, second] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn rewritten_upstream_is_fetched_through_its_configured_force_mapping() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("sync-rewritten");
    let replacement = unique_temp_dir("sync-rewritten-replacement");
    git_init(&replacement);
    assert!(git_command(&replacement)
        .args(["checkout", "--orphan", "replacement-root", "-q"])
        .status()
        .unwrap()
        .success());
    write_file(&replacement, "replacement.txt", "new root\n");
    git_add_all(&replacement);
    git_commit(&replacement, "replacement root");
    wire_remote(&replacement, "origin", &remote);
    assert!(git_command(&replacement)
        .args([
            "push",
            "--force",
            "-q",
            "origin",
            &format!("HEAD:refs/heads/{branch}"),
        ])
        .status()
        .unwrap()
        .success());

    let rewritten = check_team_changes(repo.clone(), session("rewritten")).unwrap();
    assert_eq!(rewritten.state, TeamSyncState::Diverged);
    assert!(rewritten.ahead > 0 && rewritten.behind > 0);
    assert_eq!(rewritten.knowledge, SyncKnowledge::Fresh);

    for path in [repo, remote, replacement] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn remote_failures_are_classified_without_serializing_secrets() {
    let _guard = sync_test_guard();
    let auth = classify_remote_failure(
        "fatal: Authentication failed for 'https://alice:secret@example.test/repo.git?token=abc'",
    );
    assert_eq!(auth.code, AppErrorCode::AuthenticationFailed);
    let detail = auth.detail.unwrap_or_default();
    assert!(!detail.contains("secret"));
    assert!(!detail.contains("token"));

    let missing = classify_remote_failure("fatal: couldn't find remote ref main");
    assert_eq!(missing.code, AppErrorCode::RemoteRefMissing);

    let generic = classify_remote_failure(
        "fatal: unable to access 'https://token@example.test/repo.git?private=yes': offline",
    );
    assert_eq!(generic.code, AppErrorCode::GitCommandFailed);
    let detail = generic.detail.unwrap_or_default();
    assert!(!detail.contains("token@example"));
    assert!(!detail.contains("private"));
}

#[test]
fn get_team_changes_reviews_and_applies_exact_fast_forward_with_recovery() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-success");
    write_file(&repo, "rename-source.txt", "rename me\n");
    write_file(&repo, "delete-me.txt", "delete me\n");
    git_add_all(&repo);
    git_commit(&repo, "rename baseline");
    assert!(git_command(&repo)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let other = clone_remote(&remote, "get-success-other");
    write_file(&other, "a.txt", "team edit\n");
    write_file(&other, "added.txt", "new\n");
    git_add_all(&other);
    git_commit(&other, "team one");
    assert!(git_command(&other)
        .args(["mv", "rename-source.txt", "renamed.txt"])
        .status()
        .unwrap()
        .success());
    fs::remove_file(Path::new(&other).join("delete-me.txt")).unwrap();
    fs::write(Path::new(&other).join("binary.dat"), [0_u8, 159, 146, 150]).unwrap();
    git_add_all(&other);
    git_commit(&other, "team two");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let remote_head = remote_branch_sha(&remote, &format!("refs/heads/{branch}")).unwrap();
    let previous = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let mut phases = Vec::new();
    let plan = plan_get_team_changes(repo.clone(), session("get-success"), |phase| {
        phases.push(phase)
    })
    .unwrap();
    assert_eq!(plan.operation_kind, OperationKind::HistoryMutation);
    assert_eq!(plan.incoming_count, 2);
    assert_eq!(plan.incoming_versions.len(), 2);
    assert!(plan.file_impact.counts.modified >= 1);
    assert!(plan.file_impact.counts.deleted >= 1);
    assert!(plan.file_impact.counts.renamed >= 1);
    assert!(plan.file_impact.counts.binary >= 1);
    assert_eq!(
        phases,
        vec![
            GetTeamChangesPhase::CheckingTeam,
            GetTeamChangesPhase::CheckingLocalSafety
        ]
    );

    let recovery_ref = plan.recovery.reference.clone();
    let result = get_team_changes(
        repo.clone(),
        session("get-success"),
        plan.state_token,
        recovery_ref.clone(),
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(
        result.resulting_commit.as_deref(),
        Some(remote_head.as_str())
    );
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        remote_head
    );
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &recovery_ref]).unwrap()),
        previous
    );
    let parent_count =
        git_stdout(&test_git(&repo, &["rev-list", "--parents", "-n", "1", "HEAD"]).unwrap())
            .split_whitespace()
            .count();
    assert_eq!(
        parent_count, 2,
        "the resulting commit has one parent; no merge commit was created"
    );
    assert!(result
        .sync_status
        .is_some_and(|status| status.state == TeamSyncState::UpToDate));

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_explicitly_blocks_up_to_date_ahead_and_diverged_relations() {
    let _guard = sync_test_guard();
    let (current_repo, current_remote, _) = published_repo_and_remote("get-current");
    let current_head = git_stdout(&test_git(&current_repo, &["rev-parse", "HEAD"]).unwrap());
    let current_error =
        plan_get_team_changes(current_repo.clone(), session("current"), |_| {}).unwrap_err();
    assert_eq!(current_error.code, AppErrorCode::NothingToGet);
    assert_eq!(
        git_stdout(&test_git(&current_repo, &["rev-parse", "HEAD"]).unwrap()),
        current_head
    );

    let (ahead_repo, ahead_remote, _) = published_repo_and_remote("get-ahead");
    write_file(&ahead_repo, "local.txt", "local\n");
    git_add_all(&ahead_repo);
    git_commit(&ahead_repo, "local ahead");
    let ahead_head = git_stdout(&test_git(&ahead_repo, &["rev-parse", "HEAD"]).unwrap());
    let ahead_error =
        plan_get_team_changes(ahead_repo.clone(), session("ahead"), |_| {}).unwrap_err();
    assert_eq!(ahead_error.code, AppErrorCode::NothingToGet);
    assert_eq!(
        git_stdout(&test_git(&ahead_repo, &["rev-parse", "HEAD"]).unwrap()),
        ahead_head
    );

    let (diverged_repo, diverged_remote, diverged_branch) =
        published_repo_and_remote("get-diverged");
    let diverged_other = clone_remote(&diverged_remote, "get-diverged-other");
    write_file(&diverged_other, "team.txt", "team\n");
    git_add_all(&diverged_other);
    git_commit(&diverged_other, "team side");
    assert!(git_command(&diverged_other)
        .args(["push", "-q", "origin", &diverged_branch])
        .status()
        .unwrap()
        .success());
    write_file(&diverged_repo, "local.txt", "local\n");
    git_add_all(&diverged_repo);
    git_commit(&diverged_repo, "local side");
    let diverged_head = git_stdout(&test_git(&diverged_repo, &["rev-parse", "HEAD"]).unwrap());
    let diverged_error =
        plan_get_team_changes(diverged_repo.clone(), session("diverged"), |_| {}).unwrap_err();
    assert_eq!(diverged_error.code, AppErrorCode::DivergedHistories);
    assert_eq!(
        git_stdout(&test_git(&diverged_repo, &["rev-parse", "HEAD"]).unwrap()),
        diverged_head
    );

    for path in [
        current_repo,
        current_remote,
        ahead_repo,
        ahead_remote,
        diverged_repo,
        diverged_remote,
        diverged_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_allows_proven_separate_tracked_and_ignored_content_but_blocks_collisions() {
    let _guard = sync_test_guard();
    let (dirty_repo, dirty_remote, dirty_branch) = published_repo_and_remote("get-dirty");
    let dirty_other = clone_remote(&dirty_remote, "get-dirty-other");
    write_file(&dirty_other, "team.txt", "team\n");
    git_add_all(&dirty_other);
    git_commit(&dirty_other, "team");
    assert!(git_command(&dirty_other)
        .args(["push", "-q", "origin", &dirty_branch])
        .status()
        .unwrap()
        .success());
    write_file(&dirty_repo, "a.txt", "local dirty\n");
    let dirty = plan_get_team_changes(dirty_repo.clone(), session("dirty"), |_| {}).unwrap();
    assert_eq!(dirty.incoming_count, 1);
    assert_eq!(
        fs::read(Path::new(&dirty_repo).join("a.txt")).unwrap(),
        b"local dirty\n"
    );

    let (collision_repo, collision_remote, collision_branch) =
        published_repo_and_remote("get-collision");
    let collision_other = clone_remote(&collision_remote, "get-collision-other");
    write_file(&collision_other, "local-only.txt", "team\n");
    git_add_all(&collision_other);
    git_commit(&collision_other, "team collision");
    assert!(git_command(&collision_other)
        .args(["push", "-q", "origin", &collision_branch])
        .status()
        .unwrap()
        .success());
    write_file(&collision_repo, "local-only.txt", "keep local\n");
    let collision =
        plan_get_team_changes(collision_repo.clone(), session("collision"), |_| {}).unwrap_err();
    assert_eq!(collision.code, AppErrorCode::IncomingPathCollision);
    assert_eq!(
        fs::read(Path::new(&collision_repo).join("local-only.txt")).unwrap(),
        b"keep local\n"
    );

    let (safe_repo, safe_remote, safe_branch) = published_repo_and_remote("get-safe-ignored");
    write_file(&safe_repo, ".gitignore", "cache/\n");
    git_add_all(&safe_repo);
    git_commit(&safe_repo, "ignore cache");
    assert!(git_command(&safe_repo)
        .args(["push", "-q", "origin", &safe_branch])
        .status()
        .unwrap()
        .success());
    let safe_other = clone_remote(&safe_remote, "get-safe-ignored-other");
    write_file(&safe_other, "team-safe.txt", "team\n");
    git_add_all(&safe_other);
    git_commit(&safe_other, "safe team");
    assert!(git_command(&safe_other)
        .args(["push", "-q", "origin", &safe_branch])
        .status()
        .unwrap()
        .success());
    fs::create_dir_all(Path::new(&safe_repo).join("cache")).unwrap();
    write_file(&safe_repo, "cache/local.bin", "keep ignored\n");
    let safe = plan_get_team_changes(safe_repo.clone(), session("safe"), |_| {}).unwrap();
    assert_eq!(safe.incoming_count, 1);

    for path in [
        dirty_repo,
        dirty_remote,
        dirty_other,
        collision_repo,
        collision_remote,
        collision_other,
        safe_repo,
        safe_remote,
        safe_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_allows_separate_staged_changes_and_blocks_ignored_collisions_and_git_operations() {
    let _guard = sync_test_guard();
    let (staged_repo, staged_remote, staged_branch) = published_repo_and_remote("get-staged");
    let staged_other = clone_remote(&staged_remote, "get-staged-other");
    write_file(&staged_other, "team.txt", "team\n");
    git_add_all(&staged_other);
    git_commit(&staged_other, "team");
    assert!(git_command(&staged_other)
        .args(["push", "-q", "origin", &staged_branch])
        .status()
        .unwrap()
        .success());
    write_file(&staged_repo, "staged.txt", "prepared\n");
    git_add_all(&staged_repo);
    let staged_index = in_test_frame(|| resolve_index_path(&staged_repo)).unwrap();
    let staged_index_before = fs::read(&staged_index).unwrap();
    let staged_plan =
        plan_get_team_changes(staged_repo.clone(), session("staged"), |_| {}).unwrap();
    assert_eq!(staged_plan.incoming_count, 1);
    assert_eq!(fs::read(&staged_index).unwrap(), staged_index_before);
    assert_eq!(
        fs::read(Path::new(&staged_repo).join("staged.txt")).unwrap(),
        b"prepared\n"
    );

    let (ignored_repo, ignored_remote, ignored_branch) =
        published_repo_and_remote("get-ignored-collision");
    write_file(&ignored_repo, ".gitignore", "cache/\n");
    git_add_all(&ignored_repo);
    git_commit(&ignored_repo, "ignore cache");
    assert!(git_command(&ignored_repo)
        .args(["push", "-q", "origin", &ignored_branch])
        .status()
        .unwrap()
        .success());
    let ignored_other = clone_remote(&ignored_remote, "get-ignored-collision-other");
    fs::create_dir_all(Path::new(&ignored_other).join("cache")).unwrap();
    write_file(&ignored_other, "cache/incoming.txt", "team\n");
    assert!(git_command(&ignored_other)
        .args(["add", "-f", "--", "cache/incoming.txt"])
        .status()
        .unwrap()
        .success());
    git_commit(&ignored_other, "incoming ignored path");
    assert!(git_command(&ignored_other)
        .args(["push", "-q", "origin", &ignored_branch])
        .status()
        .unwrap()
        .success());
    fs::create_dir_all(Path::new(&ignored_repo).join("cache")).unwrap();
    write_file(&ignored_repo, "cache/local.txt", "keep ignored\n");
    let ignored_error =
        plan_get_team_changes(ignored_repo.clone(), session("ignored"), |_| {}).unwrap_err();
    assert_eq!(ignored_error.code, AppErrorCode::IncomingPathCollision);
    assert_eq!(
        fs::read(Path::new(&ignored_repo).join("cache/local.txt")).unwrap(),
        b"keep ignored\n"
    );

    let (operation_repo, operation_remote, operation_branch) =
        published_repo_and_remote("get-operation");
    let operation_other = clone_remote(&operation_remote, "get-operation-other");
    write_file(&operation_other, "team.txt", "team\n");
    git_add_all(&operation_other);
    git_commit(&operation_other, "team");
    assert!(git_command(&operation_other)
        .args(["push", "-q", "origin", &operation_branch])
        .status()
        .unwrap()
        .success());
    let operation_head = git_stdout(&test_git(&operation_repo, &["rev-parse", "HEAD"]).unwrap());
    let operation_git_dir =
        git_stdout(&test_git(&operation_repo, &["rev-parse", "--absolute-git-dir"]).unwrap());
    fs::write(
        Path::new(&operation_git_dir).join("MERGE_HEAD"),
        &operation_head,
    )
    .unwrap();
    let operation_error =
        plan_get_team_changes(operation_repo.clone(), session("operation"), |_| {}).unwrap_err();
    assert_eq!(operation_error.code, AppErrorCode::GitOperationInProgress);
    assert_eq!(
        git_stdout(&test_git(&operation_repo, &["rev-parse", "HEAD"]).unwrap()),
        operation_head
    );

    for path in [
        staged_repo,
        staged_remote,
        staged_other,
        ignored_repo,
        ignored_remote,
        ignored_other,
        operation_repo,
        operation_remote,
        operation_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_blocks_tracked_changes_that_overlap_an_incoming_source_or_destination() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-tracked-collision");
    let other = clone_remote(&remote, "get-tracked-collision-other");
    write_file(&other, "a.txt", "team edit\n");
    git_add_all(&other);
    git_commit(&other, "team edit");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    assert!(git_command(&repo)
        .args(["mv", "a.txt", "local-name.txt"])
        .status()
        .unwrap()
        .success());
    let status_before = test_git(&repo, &["status", "--porcelain=v2", "-z"]).unwrap();
    let error =
        plan_get_team_changes(repo.clone(), session("tracked-collision"), |_| {}).unwrap_err();
    assert_eq!(error.code, AppErrorCode::IncomingTrackedChangeCollision);
    assert_eq!(
        test_git(&repo, &["status", "--porcelain=v2", "-z"])
            .unwrap()
            .stdout,
        status_before.stdout
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("local-name.txt")).unwrap(),
        b"hello\n"
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_team_changes_preserves_separate_staged_unstaged_and_untracked_work() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-with-local-work");
    let other = clone_remote(&remote, "get-with-local-work-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    write_file(&repo, "a.txt", "local unstaged\n");
    write_file(&repo, "prepared.txt", "local staged\n");
    git_add(&repo, "prepared.txt");
    write_file(&repo, "local-only.txt", "local untracked\n");
    let status_before = test_git(
        &repo,
        &[
            "status",
            "--porcelain=v2",
            "--untracked-files=all",
            "--ignored=matching",
            "--renames",
            "-z",
        ],
    )
    .unwrap();

    let plan = plan_get_team_changes(repo.clone(), session("local-work"), |_| {}).unwrap();
    let result = get_team_changes(
        repo.clone(),
        session("local-work"),
        plan.state_token,
        plan.recovery.reference,
        |_| {},
    )
    .unwrap();

    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(
        test_git(
            &repo,
            &[
                "status",
                "--porcelain=v2",
                "--untracked-files=all",
                "--ignored=matching",
                "--renames",
                "-z",
            ],
        )
        .unwrap()
        .stdout,
        status_before.stdout
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("a.txt")).unwrap(),
        b"local unstaged\n"
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("prepared.txt")).unwrap(),
        b"local staged\n"
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("local-only.txt")).unwrap(),
        b"local untracked\n"
    );
    assert_eq!(
        String::from_utf8_lossy(&fs::read(Path::new(&repo).join("team.txt")).unwrap())
            .replace("\r\n", "\n"),
        "team\n"
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_team_changes_rejects_local_content_changed_after_preview_before_recovery() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-local-state-stale");
    let other = clone_remote(&remote, "get-local-state-stale-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    write_file(&repo, "a.txt", "first local edit\n");
    let plan = plan_get_team_changes(repo.clone(), session("local-state-stale"), |_| {}).unwrap();
    let head_before = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    write_file(&repo, "a.txt", "newer local edit\n");

    let error = get_team_changes(
        repo.clone(),
        session("local-state-stale"),
        plan.state_token,
        plan.recovery.reference.clone(),
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleGetTeamChangesPlan);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("a.txt")).unwrap(),
        b"newer local edit\n"
    );
    assert!(
        !test_git(&repo, &["show-ref", "--verify", &plan.recovery.reference])
            .unwrap()
            .status
            .success()
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn execution_rejects_a_remote_target_that_advanced_after_preview_without_local_mutation() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-stale");
    let other = clone_remote(&remote, "get-stale-other");
    write_file(&other, "one.txt", "one\n");
    git_add_all(&other);
    git_commit(&other, "one");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let plan = plan_get_team_changes(repo.clone(), session("stale"), |_| {}).unwrap();
    let head_before = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let index = in_test_frame(|| resolve_index_path(&repo)).unwrap();
    let index_before = fs::read(&index).unwrap();
    write_file(&other, "two.txt", "two\n");
    git_add_all(&other);
    git_commit(&other, "two");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    let error = get_team_changes(
        repo.clone(),
        session("stale"),
        plan.state_token,
        plan.recovery.reference,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleGetTeamChangesPlan);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );
    assert_eq!(fs::read(index).unwrap(), index_before);

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn execution_rejects_changed_upstream_and_recovery_creation_lock_before_local_mutation() {
    let _guard = sync_test_guard();
    let (upstream_repo, upstream_remote, upstream_branch) =
        published_repo_and_remote("get-upstream-change");
    let upstream_other = clone_remote(&upstream_remote, "get-upstream-change-other");
    write_file(&upstream_other, "team.txt", "team\n");
    git_add_all(&upstream_other);
    git_commit(&upstream_other, "team");
    assert!(git_command(&upstream_other)
        .args(["push", "-q", "origin", &upstream_branch])
        .status()
        .unwrap()
        .success());
    let upstream_plan =
        plan_get_team_changes(upstream_repo.clone(), session("upstream-change"), |_| {}).unwrap();
    let upstream_head = git_stdout(&test_git(&upstream_repo, &["rev-parse", "HEAD"]).unwrap());
    let upstream_index = in_test_frame(|| resolve_index_path(&upstream_repo)).unwrap();
    let upstream_index_before = fs::read(&upstream_index).unwrap();
    assert!(git_command(&upstream_repo)
        .args([
            "config",
            &format!("branch.{upstream_branch}.merge"),
            "refs/heads/missing-after-preview",
        ])
        .status()
        .unwrap()
        .success());
    let upstream_error = get_team_changes(
        upstream_repo.clone(),
        session("upstream-change"),
        upstream_plan.state_token,
        upstream_plan.recovery.reference,
        |_| {},
    )
    .unwrap_err();
    assert!(matches!(
        upstream_error.code,
        AppErrorCode::RemoteRefMissing | AppErrorCode::StaleGetTeamChangesPlan
    ));
    assert_eq!(
        git_stdout(&test_git(&upstream_repo, &["rev-parse", "HEAD"]).unwrap()),
        upstream_head
    );
    assert_eq!(fs::read(&upstream_index).unwrap(), upstream_index_before);

    let (locked_repo, locked_remote, locked_branch) =
        published_repo_and_remote("get-recovery-lock");
    let locked_other = clone_remote(&locked_remote, "get-recovery-lock-other");
    write_file(&locked_other, "team.txt", "team\n");
    git_add_all(&locked_other);
    git_commit(&locked_other, "team");
    assert!(git_command(&locked_other)
        .args(["push", "-q", "origin", &locked_branch])
        .status()
        .unwrap()
        .success());
    let locked_plan =
        plan_get_team_changes(locked_repo.clone(), session("recovery-lock"), |_| {}).unwrap();
    let locked_head = git_stdout(&test_git(&locked_repo, &["rev-parse", "HEAD"]).unwrap());
    let locked_index = in_test_frame(|| resolve_index_path(&locked_repo)).unwrap();
    let locked_index_before = fs::read(&locked_index).unwrap();
    let common_git_dir =
        git_stdout(&test_git(&locked_repo, &["rev-parse", "--git-common-dir"]).unwrap());
    let common_git_dir = if Path::new(&common_git_dir).is_absolute() {
        common_git_dir.into()
    } else {
        Path::new(&locked_repo).join(common_git_dir)
    };
    let recovery_path = common_git_dir.join(&locked_plan.recovery.reference);
    fs::create_dir_all(recovery_path.parent().unwrap()).unwrap();
    let recovery_lock = recovery_path.with_file_name(format!(
        "{}.lock",
        recovery_path.file_name().unwrap().to_string_lossy()
    ));
    fs::write(&recovery_lock, b"external lock").unwrap();
    let locked_error = get_team_changes(
        locked_repo.clone(),
        session("recovery-lock"),
        locked_plan.state_token,
        locked_plan.recovery.reference.clone(),
        |_| {},
    )
    .unwrap_err();
    assert_eq!(locked_error.code, AppErrorCode::RefLocked);
    assert_eq!(
        git_stdout(&test_git(&locked_repo, &["rev-parse", "HEAD"]).unwrap()),
        locked_head
    );
    assert_eq!(fs::read(&locked_index).unwrap(), locked_index_before);
    assert!(!test_git(
        &locked_repo,
        &["rev-parse", "--verify", &locked_plan.recovery.reference]
    )
    .unwrap()
    .status
    .success());

    let _ = fs::remove_file(recovery_lock);
    for path in [
        upstream_repo,
        upstream_remote,
        upstream_other,
        locked_repo,
        locked_remote,
        locked_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn history_recovery_names_are_create_only_and_retention_survives_reacquisition() {
    let _guard = sync_test_guard();
    let repo = unique_temp_dir("history-recovery-retention");
    git_init(&repo);
    git_commit_empty(&repo);
    let head = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let mut created = Vec::new();
    {
        let (repository, _access) =
            application::authorize_repository(&repo, "get_team_changes", None).unwrap();
        let preview = plan_history_recovery(&repository);
        let metadata = || HistoryRecoveryMetadata {
            branch: current_branch(&repo),
            previous_commit: head.clone(),
            target_commit: head.clone(),
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            state_token: "test-token".to_string(),
        };
        let incomplete_preview = plan_history_recovery(&repository);
        let mut incomplete_parts = incomplete_preview.reference.rsplit('/');
        let incomplete_id = incomplete_parts.next().unwrap().to_string();
        let incomplete_owner = incomplete_parts.next().unwrap().to_string();
        assert!(git_command(&repo)
            .args([
                "update-ref",
                &incomplete_preview.reference,
                &head,
                &"0".repeat(40),
            ])
            .status()
            .unwrap()
            .success());
        let incomplete = HistoryRecoveryRecord {
            schema_version: 1,
            recovery_id: incomplete_id.clone(),
            reference: incomplete_preview.reference.clone(),
            created_at_ms: 1,
            operation: "get-team-changes".to_string(),
            owner_id: incomplete_owner.clone(),
            branch: current_branch(&repo),
            previous_commit: head.clone(),
            target_commit: head.clone(),
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            state_token: "test-token".to_string(),
            retention_limit: MAX_HISTORY_RECOVERY_RECORDS,
        };
        let pending = repository
            .common_git_dir
            .backend_path()
            .join("gitodile")
            .join("history-recovery")
            .join("v1")
            .join("pending")
            .join(format!("{incomplete_owner}-{incomplete_id}.json"));
        fs::create_dir_all(pending.parent().unwrap()).unwrap();
        fs::write(&pending, serde_json::to_vec(&incomplete).unwrap()).unwrap();

        let first = create_history_recovery(&repository, &preview.reference, metadata()).unwrap();
        created.push(first.reference.clone());
        assert!(!pending.exists());
        assert!(!test_git(
            &repo,
            &["rev-parse", "--verify", &incomplete_preview.reference]
        )
        .unwrap()
        .status
        .success());
        let duplicate =
            create_history_recovery(&repository, &preview.reference, metadata()).unwrap_err();
        assert_eq!(duplicate.code, AppErrorCode::RefLocked);
        assert_eq!(
            git_stdout(&test_git(&repo, &["rev-parse", &first.reference]).unwrap()),
            head
        );
    }

    // Reacquiring the repository command frame exercises disk/ref discovery
    // rather than relying on process-local retention state.
    {
        let (repository, _access) =
            application::authorize_repository(&repo, "get_team_changes", None).unwrap();
        for _ in 0..MAX_HISTORY_RECOVERY_RECORDS {
            let preview = plan_history_recovery(&repository);
            let record = create_history_recovery(
                &repository,
                &preview.reference,
                HistoryRecoveryMetadata {
                    branch: current_branch(&repo),
                    previous_commit: head.clone(),
                    target_commit: head.clone(),
                    remote: "origin".to_string(),
                    destination_branch: "main".to_string(),
                    tracking_ref: "refs/remotes/origin/main".to_string(),
                    state_token: "test-token".to_string(),
                },
            )
            .unwrap();
            created.push(record.reference);
        }
    }
    let refs = git_stdout(
        &test_git(
            &repo,
            &[
                "for-each-ref",
                "--format=%(refname)",
                "refs/gitodile/recovery/v1/get-team-changes",
            ],
        )
        .unwrap(),
    );
    assert_eq!(refs.lines().count(), MAX_HISTORY_RECOVERY_RECORDS);
    assert!(!test_git(&repo, &["rev-parse", "--verify", &created[0]])
        .unwrap()
        .status
        .success());
    assert!(
        test_git(&repo, &["rev-parse", "--verify", created.last().unwrap()])
            .unwrap()
            .status
            .success()
    );

    let _ = fs::remove_dir_all(repo);
}

#[test]
fn a_post_recovery_ref_lock_returns_uncertain_and_keeps_the_recovery() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-uncertain-lock");
    let other = clone_remote(&remote, "get-uncertain-lock-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let plan = plan_get_team_changes(repo.clone(), session("uncertain-lock"), |_| {}).unwrap();
    let git_dir = git_stdout(&test_git(&repo, &["rev-parse", "--absolute-git-dir"]).unwrap());
    let branch_lock = Path::new(&git_dir)
        .join("refs")
        .join("heads")
        .join(format!("{branch}.lock"));
    fs::write(&branch_lock, b"external lock").unwrap();

    let result = get_team_changes(
        repo.clone(),
        session("uncertain-lock"),
        plan.state_token,
        plan.recovery.reference,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Uncertain);
    assert!(result.inspection_instructions.is_some());
    assert_eq!(
        git_stdout(
            &test_git(
                &repo,
                &["rev-parse", "--verify", &result.recovery.reference]
            )
            .unwrap()
        ),
        result.previous_commit
    );
    assert!(Path::new(&git_dir)
        .join("gitodile")
        .join("history-recovery")
        .join("v1")
        .join("get-team-changes")
        .join(&result.recovery.owner_id)
        .join(format!("{}.json", result.recovery.recovery_id))
        .is_file());

    let _ = fs::remove_file(branch_lock);
    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_caps_many_incoming_versions_without_losing_the_total() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-many");
    let other = clone_remote(&remote, "get-many-other");
    for index in 0..(MAX_INCOMING_VERSIONS + 5) {
        write_file(&other, "many.txt", &format!("{index}\n"));
        git_add_all(&other);
        git_commit(&other, &format!("incoming {index}"));
    }
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let plan = plan_get_team_changes(repo.clone(), session("many"), |_| {}).unwrap();
    assert_eq!(plan.incoming_count as usize, MAX_INCOMING_VERSIONS + 5);
    assert_eq!(plan.incoming_versions.len(), MAX_INCOMING_VERSIONS);
    assert!(plan.versions_truncated);

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_caps_many_incoming_files_without_losing_categories_or_total() {
    let _guard = sync_test_guard();
    let (repo, remote, branch) = published_repo_and_remote("get-many-files");
    let other = clone_remote(&remote, "get-many-files-other");
    for index in 0..(MAX_INCOMING_FILES + 5) {
        write_file(&other, &format!("incoming-{index:03}.txt"), "team\n");
    }
    git_add_all(&other);
    git_commit(&other, "many incoming files");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    let plan = plan_get_team_changes(repo.clone(), session("many-files"), |_| {}).unwrap();
    assert_eq!(plan.file_impact.total_count, MAX_INCOMING_FILES + 5);
    assert_eq!(plan.file_impact.files.len(), MAX_INCOMING_FILES);
    assert_eq!(plan.file_impact.counts.added, MAX_INCOMING_FILES + 5);
    assert!(plan.file_impact.is_truncated);

    write_file(
        &repo,
        "a.txt",
        "local work outside the visible incoming sample\n",
    );
    let error =
        plan_get_team_changes(repo.clone(), session("many-files-dirty"), |_| {}).unwrap_err();
    assert_eq!(error.code, AppErrorCode::IncomingTrackedChangeCollision);

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn project_remotes_report_push_urls_and_hidden_credentials() {
    // Parsed rather than configured, because `git remote -v` is the only place
    // the two directions arrive paired and a stored password is still visible.
    let output = "origin\thttps://user:pw@example.com/repo.git (fetch)\n\
                  origin\thttps://user:pw@example.com/repo.git (push)\n\
                  upstream\tgit@example.com:org/repo.git (fetch)\n\
                  upstream\tssh://example.com/mirror.git (push)\n";
    let remotes = parse_project_remotes(output);
    assert_eq!(remotes.len(), 2);
    assert_eq!(remotes[0].url, "https://example.com/repo.git");
    assert_eq!(remotes[0].push_url, None, "one address is not two");
    assert!(
        remotes[0].has_hidden_credentials,
        "the stored URL carries a password the display drops"
    );
    assert_eq!(remotes[1].url, "git@example.com:org/repo.git");
    assert_eq!(
        remotes[1].push_url.as_deref(),
        Some("ssh://example.com/mirror.git")
    );
    assert!(
        !remotes[1].has_hidden_credentials,
        "an SCP-style username is kept, not hidden"
    );
}

#[test]
fn changing_a_remote_url_validates_names_and_addresses_before_writing() {
    let _guard = sync_test_guard();
    let (repo, remote, _branch) = published_repo_and_remote("set-remote-url");

    let before = read_project_remotes(repo.clone()).unwrap();
    assert_eq!(before.remotes.len(), 1);
    assert_eq!(before.remotes[0].name, "origin");
    assert_eq!(
        before.upstream_remote.as_deref(),
        Some("origin"),
        "the published line's own remote, read from its configuration"
    );

    assert_eq!(
        set_remote_url(
            repo.clone(),
            "elsewhere".into(),
            "https://example.test/repo.git".into(),
        )
        .unwrap_err()
        .code,
        AppErrorCode::RemoteNotFound
    );
    assert_eq!(
        set_remote_url(repo.clone(), "origin".into(), "not a url".into(),)
            .unwrap_err()
            .code,
        AppErrorCode::InvalidRemoteUrl
    );

    let after = set_remote_url(
        repo.clone(),
        "origin".into(),
        "https://alice:secret@example.test/moved.git".into(),
    )
    .unwrap();
    assert_eq!(after.remotes[0].url, "https://example.test/moved.git");
    assert!(
        !after.remotes[0].has_hidden_credentials,
        "GitOdile stores the address without the password, exactly as connecting one does"
    );
    let configured = git_command(&repo)
        .args(["config", "--local", "--get", "remote.origin.url"])
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8_lossy(&configured.stdout).trim(),
        "https://example.test/moved.git"
    );

    for path in [repo, remote] {
        let _ = fs::remove_dir_all(path);
    }
}
