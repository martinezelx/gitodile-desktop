use crate::test_support::*;
use crate::*;
use std::fs;

#[test]
fn redact_remote_url_strips_userinfo_credentials() {
    assert_eq!(
        redact_remote_url("https://alice:s3cr3t@example.com/repo.git"),
        "https://example.com/repo.git"
    );
    assert_eq!(
        redact_remote_url("https://ghp_abcdef123@github.com/org/repo.git"),
        "https://github.com/org/repo.git"
    );
}

#[test]
fn redact_remote_url_leaves_urls_without_credentials_untouched() {
    assert_eq!(
        redact_remote_url("https://github.com/org/repo.git"),
        "https://github.com/org/repo.git"
    );
    assert_eq!(
        redact_remote_url("git@github.com:org/repo.git"),
        "git@github.com:org/repo.git"
    );
    assert_eq!(
        redact_remote_url("/local/bare/repo.git"),
        "/local/bare/repo.git"
    );
}

#[test]
fn redact_remote_url_removes_query_tokens_and_fragments() {
    assert_eq!(
        redact_remote_url("https://example.com/repo.git?access_token=secret#fragment"),
        "https://example.com/repo.git"
    );
}

#[test]
fn parse_remote_v_output_keeps_one_entry_per_remote() {
    let output = "origin\thttps://user:pw@example.com/repo.git (fetch)\n\
                       origin\thttps://user:pw@example.com/repo.git (push)\n\
                       upstream\tgit@example.com:org/repo.git (fetch)\n\
                       upstream\tgit@example.com:org/repo.git (push)\n";
    let remotes = parse_remote_v_output(output);
    assert_eq!(remotes.len(), 2);
    assert_eq!(remotes[0].name, "origin");
    assert_eq!(remotes[0].url, "https://example.com/repo.git");
    assert_eq!(remotes[1].name, "upstream");
    assert_eq!(remotes[1].url, "git@example.com:org/repo.git");
}

#[test]
fn resolve_remote_selection_proposes_the_single_configured_remote() {
    let remotes = vec![RemoteInfo {
        name: "origin".to_string(),
        url: "https://example.com/repo.git".to_string(),
    }];
    let remote = resolve_remote_selection(&remotes, None, None).expect("should propose origin");
    assert_eq!(remote, "origin");
}

#[test]
fn resolve_remote_selection_rejects_when_no_remote_is_configured() {
    let error = resolve_remote_selection(&[], None, None).expect_err("no remotes configured");
    assert_eq!(error.code, AppErrorCode::NoRemoteConfigured);
}

#[test]
fn resolve_remote_selection_requires_an_explicit_choice_with_multiple_remotes() {
    let remotes = vec![
        RemoteInfo {
            name: "origin".to_string(),
            url: "https://example.com/a.git".to_string(),
        },
        RemoteInfo {
            name: "upstream".to_string(),
            url: "https://example.com/b.git".to_string(),
        },
    ];
    let error =
        resolve_remote_selection(&remotes, None, None).expect_err("ambiguous without a choice");
    assert_eq!(error.code, AppErrorCode::RemoteSelectionRequired);

    let remote = resolve_remote_selection(&remotes, None, Some("upstream"))
        .expect("an explicit request should resolve");
    assert_eq!(remote, "upstream");
}

#[test]
fn resolve_remote_selection_prefers_the_configured_upstream_over_ambiguity() {
    let remotes = vec![
        RemoteInfo {
            name: "origin".to_string(),
            url: "https://example.com/a.git".to_string(),
        },
        RemoteInfo {
            name: "upstream".to_string(),
            url: "https://example.com/b.git".to_string(),
        },
    ];
    let remote = resolve_remote_selection(&remotes, Some("upstream/main"), None)
        .expect("configured upstream should resolve without asking");
    assert_eq!(remote, "upstream");
}

#[test]
fn resolve_remote_selection_rejects_an_unknown_requested_remote() {
    let remotes = vec![RemoteInfo {
        name: "origin".to_string(),
        url: "https://example.com/repo.git".to_string(),
    }];
    let error = resolve_remote_selection(&remotes, None, Some("does-not-exist"))
        .expect_err("an unconfigured remote name must be rejected");
    assert_eq!(error.code, AppErrorCode::NoRemoteConfigured);
}

#[test]
fn validate_remote_name_rejects_option_shaped_names() {
    let error = validate_remote_name("--upload-pack=evil")
        .expect_err("an option-shaped remote name must be rejected");
    assert_eq!(error.code, AppErrorCode::InvalidSelection);
}

#[test]
fn compute_publish_state_token_is_stable_then_changes_with_remote_state() {
    let target = PublishTarget {
        remote: "origin".to_string(),
        destination_branch: "main".to_string(),
    };
    let first = compute_publish_state_token("abc123", &target, Some("def456"), "main", false);
    let same = compute_publish_state_token("abc123", &target, Some("def456"), "main", false);
    assert_eq!(first, same);

    let after_local_move =
        compute_publish_state_token("zzz999", &target, Some("def456"), "main", false);
    assert_ne!(first, after_local_move);

    let after_remote_move =
        compute_publish_state_token("abc123", &target, Some("newsha"), "main", false);
    assert_ne!(first, after_remote_move);

    let first_publish = compute_publish_state_token("abc123", &target, None, "main", false);
    assert_ne!(first, first_publish);

    let unsaved_files_changed =
        compute_publish_state_token("abc123", &target, Some("def456"), "main", true);
    assert_ne!(first, unsaved_files_changed);
}

#[test]
fn classify_push_failure_recognizes_remote_rejection() {
    let stdout = "To ../remote.git\n!\trefs/heads/main:refs/heads/main\t[remote rejected] (pre-receive hook declined)\n";
    let error = classify_push_failure(stdout, "hook declined\n");
    assert_eq!(error.code, AppErrorCode::RemoteRejected);
}

#[test]
fn classify_push_failure_recognizes_non_fast_forward_as_diverged() {
    let stdout =
        "To ../remote.git\n!\trefs/heads/main:refs/heads/main\t[rejected] (non-fast-forward)\n";
    let error = classify_push_failure(stdout, "");
    assert_eq!(error.code, AppErrorCode::DivergedHistories);
}

#[test]
fn classify_push_failure_recognizes_authentication_failure() {
    let error = classify_push_failure(
        "",
        "fatal: Authentication failed for 'https://example.com/repo.git'\n",
    );
    assert_eq!(error.code, AppErrorCode::AuthenticationFailed);
}

#[test]
fn plan_publish_reports_the_first_publish_and_publish_creates_upstream() {
    let repo = unique_temp_dir("publish-first");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let branch = current_branch(&repo);

    let remote = unique_temp_dir("publish-first-remote");
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);

    let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
    assert_eq!(plan.operation_kind, OperationKind::RemoteMutation);
    assert!(plan.requires_confirmation);
    assert!(plan.will_create_upstream);
    assert_eq!(plan.target.remote, "origin");
    assert_eq!(plan.target.destination_branch, branch);
    assert_eq!(plan.commit_count, 1);

    let result = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect("publish should succeed");
    assert!(result.created_upstream);
    assert_eq!(result.published_count, 1);
    assert!(result.previous_remote_commit.is_none());
    assert_eq!(
        remote_branch_sha(&remote, &branch),
        Some(result.published_commit)
    );

    let status = read_working_tree_status(repo.clone()).expect("status should read");
    assert_eq!(status.upstream.upstream, Some(format!("origin/{branch}")));

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn ahead_only_publish_succeeds_after_the_first_publish() {
    let (repo, remote, branch) = published_repo_and_remote("ahead-only");

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");

    let plan = plan_publish(repo.clone(), None, None).expect("second plan should succeed");
    assert!(!plan.will_create_upstream);
    assert_eq!(plan.commit_count, 1);

    let result = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect("second publish should succeed");
    assert_eq!(result.published_count, 1);
    assert!(result.previous_remote_commit.is_some());
    assert_eq!(
        remote_branch_sha(&remote, &branch),
        Some(result.published_commit)
    );

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn publish_uses_the_configured_upstream_branch_when_its_name_differs_locally() {
    let (repo, remote, original_branch) = published_repo_and_remote("different-upstream-branch");

    let rename_status = git_command(&repo)
        .args(["branch", "-m", "feature"])
        .status()
        .expect("rename local branch");
    assert!(rename_status.success());
    write_file(&repo, "feature.txt", "published to main\n");
    git_add_all(&repo);
    git_commit(&repo, "feature work");

    let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
    assert_eq!(plan.local_branch, "feature");
    assert_eq!(plan.target.remote, "origin");
    assert_eq!(plan.target.destination_branch, original_branch);
    assert!(!plan.will_create_upstream);

    let result = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect("publish should use the configured destination");
    assert_eq!(result.target.destination_branch, original_branch);
    assert_eq!(
        remote_branch_sha(&remote, &original_branch),
        Some(result.published_commit)
    );
    assert_eq!(remote_branch_sha(&remote, "feature"), None);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn plan_publish_reports_nothing_to_publish_when_already_up_to_date() {
    let (repo, remote, _branch) = published_repo_and_remote("up-to-date");

    let error = plan_publish(repo.clone(), None, None).expect_err("nothing new should publish");
    assert_eq!(error.code, AppErrorCode::NothingToPublish);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn plan_publish_blocks_when_the_local_branch_is_behind_the_remote() {
    let (repo, remote, branch) = published_repo_and_remote("behind");

    // A second clone advances the remote without repo A's knowledge.
    let other = unique_temp_dir("publish-behind-other");
    let clone_status = base_git_command()
        .args(["clone", "-q", &remote, &other])
        .status()
        .expect("run git clone");
    assert!(clone_status.success(), "clone should succeed");
    write_file(&other, "from-other.txt", "hi\n");
    git_add_all(&other);
    git_commit(&other, "from other clone");
    let push_status = git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .expect("run git push from the other clone");
    assert!(
        push_status.success(),
        "the other clone's push should succeed"
    );

    let error =
        plan_publish(repo.clone(), None, None).expect_err("a behind branch must be blocked");
    assert_eq!(error.code, AppErrorCode::BehindRemote);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
    let _ = fs::remove_dir_all(&other);
}

#[test]
fn plan_publish_blocks_a_diverged_history() {
    let (repo, remote, branch) = published_repo_and_remote("diverged");

    let other = unique_temp_dir("publish-diverged-other");
    let clone_status = base_git_command()
        .args(["clone", "-q", &remote, &other])
        .status()
        .expect("run git clone");
    assert!(clone_status.success(), "clone should succeed");
    write_file(&other, "from-other.txt", "hi\n");
    git_add_all(&other);
    git_commit(&other, "from other clone");
    let push_status = git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .expect("run git push from the other clone");
    assert!(
        push_status.success(),
        "the other clone's push should succeed"
    );

    // repo now has its own unpublished commit too, so both sides moved.
    write_file(&repo, "from-repo.txt", "hi\n");
    git_add_all(&repo);
    git_commit(&repo, "from repo");

    let error =
        plan_publish(repo.clone(), None, None).expect_err("a diverged history must be blocked");
    assert_eq!(error.code, AppErrorCode::DivergedHistories);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
    let _ = fs::remove_dir_all(&other);
}

#[test]
fn publish_rejects_a_state_token_that_went_stale_after_planning() {
    let (repo, remote, branch) = published_repo_and_remote("stale-token");

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");
    let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");

    // The remote moves after the plan was produced but before execution.
    let other = unique_temp_dir("publish-stale-other");
    let clone_status = base_git_command()
        .args(["clone", "-q", &remote, &other])
        .status()
        .expect("run git clone");
    assert!(clone_status.success(), "clone should succeed");
    write_file(&other, "from-other.txt", "hi\n");
    git_add_all(&other);
    git_commit(&other, "from other clone");
    let push_status = git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .expect("run git push from the other clone");
    assert!(
        push_status.success(),
        "the other clone's push should succeed"
    );

    let error = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect_err("a plan invalidated by a remote change must be rejected");
    assert!(matches!(
        error.code,
        AppErrorCode::StalePublishPlan
            | AppErrorCode::DivergedHistories
            | AppErrorCode::BehindRemote
    ));

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
    let _ = fs::remove_dir_all(&other);
}

#[test]
fn publish_reports_a_remote_hook_rejection() {
    let repo = unique_temp_dir("publish-hook-rejection");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");

    let remote = unique_temp_dir("publish-hook-rejection-remote");
    init_bare_remote(&remote);
    write_failing_hook(Path::new(&remote), "pre-receive");
    wire_remote(&repo, "origin", &remote);

    let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
    let error = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect_err("a rejecting pre-receive hook should fail the publish");
    assert_eq!(error.code, AppErrorCode::RemoteRejected);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn publish_leaves_unsaved_files_local_and_the_working_tree_and_index_unchanged() {
    let (repo, remote, branch) = published_repo_and_remote("unsaved-files");

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");
    write_file(&repo, "untracked.txt", "not saved\n");

    let index_path = in_test_frame(|| resolve_index_path(&repo)).expect("resolve index path");
    let index_before = fs::read(&index_path).expect("read index before publish");

    let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
    assert!(plan.has_unsaved_files);

    let result = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect("publish should succeed");
    assert_eq!(
        remote_branch_sha(&remote, &branch),
        Some(result.published_commit)
    );

    let index_after = fs::read(&index_path).expect("read index after publish");
    assert_eq!(
        index_before, index_after,
        "publish must never touch the index"
    );
    assert_eq!(
        fs::read_to_string(Path::new(&repo).join("untracked.txt")).expect("read untracked file"),
        "not saved\n"
    );

    let status = read_working_tree_status(repo.clone()).expect("status should read");
    assert_eq!(status.counts.new_files, 1);
    assert_eq!(status.entries[0].path, "untracked.txt");

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn publish_updates_exactly_one_branch_and_creates_no_tags() {
    let repo = unique_temp_dir("publish-one-ref");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let branch = current_branch(&repo);

    let remote = unique_temp_dir("publish-one-ref-remote");
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);

    let plan = plan_publish(repo.clone(), None, None).expect("plan should succeed");
    publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect("publish should succeed");

    let branches = checked_git_stdout(
        test_git(
            &remote,
            &["for-each-ref", "--format=%(refname)", "refs/heads"],
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(branches, format!("refs/heads/{branch}"));

    let tags = checked_git_stdout(test_git(&remote, &["tag", "--list"]).unwrap()).unwrap();
    assert!(tags.is_empty(), "publish must never create tags");

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

// ---- Publish up to a checkpoint (task 011 follow-up) ----

#[test]
fn plan_publish_with_up_to_reports_only_the_checkpoint_and_what_remains() {
    let repo = unique_temp_dir("publish-up-to-plan");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let first_commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");
    write_file(&repo, "c.txt", "third\n");
    git_add_all(&repo);
    git_commit(&repo, "third");

    let remote = unique_temp_dir("publish-up-to-plan-remote");
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);

    let plan = plan_publish(repo.clone(), None, Some(first_commit))
        .expect("planning a checkpoint publish should succeed");
    assert_eq!(plan.commit_count, 1);
    assert_eq!(plan.remaining_after_publish, 2);
    assert_eq!(plan.commit_summary.len(), 1);
    assert_eq!(plan.commit_summary[0].title, "first");
    assert_eq!(plan.commit_summary[0].description, None);
    assert_eq!(plan.remaining_commit_summary.len(), 2);
    assert_eq!(plan.remaining_commit_summary[0].title, "third");
    assert_eq!(plan.remaining_commit_summary[0].description, None);
    assert_eq!(plan.remaining_commit_summary[1].title, "second");
    assert_eq!(plan.remaining_commit_summary[1].description, None);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn publish_with_up_to_only_pushes_the_checkpoint_and_leaves_newer_commits_local() {
    let repo = unique_temp_dir("publish-up-to-exec");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let first_commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let branch = current_branch(&repo);

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");
    let second_commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let remote = unique_temp_dir("publish-up-to-exec-remote");
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);

    let plan = plan_publish(repo.clone(), None, Some(first_commit.clone()))
        .expect("planning a checkpoint publish should succeed");
    let result = publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        Some(first_commit.clone()),
        true,
    )
    .expect("publishing up to the checkpoint should succeed");

    assert_eq!(result.published_commit, first_commit);
    assert_eq!(result.published_count, 1);
    assert_eq!(result.remaining_after_publish, 1);
    assert!(result.created_upstream);
    assert_eq!(remote_branch_sha(&remote, &branch), Some(first_commit));
    assert_ne!(remote_branch_sha(&remote, &branch), Some(second_commit));

    let pending = list_unpublished_versions(repo.clone()).expect("should list what remains");
    assert_eq!(pending.total_count, 1);
    assert_eq!(pending.versions[0].title, "second");
    assert_eq!(pending.versions[0].description, None);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn plan_publish_rejects_an_up_to_commit_that_is_not_an_ancestor_of_head() {
    let repo = unique_temp_dir("publish-up-to-unrelated");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let branch = current_branch(&repo);

    let orphan_status = git_command(&repo)
        .args(["checkout", "--orphan", "unrelated-branch", "-q"])
        .status()
        .expect("run git checkout --orphan");
    assert!(orphan_status.success(), "checkout --orphan should succeed");
    write_file(&repo, "x.txt", "unrelated\n");
    git_add_all(&repo);
    git_commit(&repo, "unrelated");
    let unrelated_commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let checkout_back = git_command(&repo)
        .args(["checkout", &branch, "-q"])
        .status()
        .expect("run git checkout back");
    assert!(checkout_back.success(), "checkout back should succeed");

    let remote = unique_temp_dir("publish-up-to-unrelated-remote");
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);

    let error = plan_publish(repo.clone(), None, Some(unrelated_commit))
        .expect_err("a commit outside this branch's history must be rejected");
    assert_eq!(error.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn plan_publish_rejects_an_up_to_commit_that_is_already_published() {
    let (repo, remote, _branch) = published_repo_and_remote("up-to-already-published");
    let published_commit = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");

    let error = plan_publish(repo.clone(), None, Some(published_commit))
        .expect_err("an already-published commit must be rejected");
    assert_eq!(error.code, AppErrorCode::NothingToPublish);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}
