use crate::test_support::*;
use crate::*;
use std::fs;
use std::path::Path;

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
