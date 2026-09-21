use crate::test_support::*;
use crate::*;
use std::fs;

#[test]
fn read_working_tree_status_reports_a_clean_repository() {
    let path = unique_temp_dir("status-clean");
    git_init(&path);
    git_commit_empty(&path);

    let status = read_working_tree_status(path.clone()).expect("a repository should report");
    assert!(status.is_clean);
    assert_eq!(status.counts.total, 0);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_status_reports_real_changes() {
    let path = unique_temp_dir("status-dirty");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "untracked.txt", "hello");

    let status = read_working_tree_status(path.clone()).expect("a repository should report");
    assert!(!status.is_clean);
    assert_eq!(status.counts.new_files, 1);
    assert_eq!(status.counts.total, 1);
    assert_eq!(status.entries[0].path, "untracked.txt");

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_status_counts_added_and_removed_lines() {
    let path = unique_temp_dir("status-line-totals");
    git_init(&path);
    write_file(&path, "tracked.txt", "one\ntwo\nthree\n");
    git_add_all(&path);
    git_commit(&path, "first");
    // One replaced line among the tracked files, and a new untracked file
    // whose every line is an addition.
    write_file(&path, "tracked.txt", "one\nTWO\nthree\n");
    write_file(&path, "new.txt", "alpha\nbeta\n");

    let status = read_working_tree_status(path.clone()).expect("a repository should report");
    let totals = status.line_totals.expect("totals should be computable");
    assert_eq!(totals.added, 3);
    assert_eq!(totals.removed, 1);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_status_has_no_line_totals_when_nothing_changed() {
    let path = unique_temp_dir("status-line-totals-clean");
    git_init(&path);
    git_commit_empty(&path);

    let status = read_working_tree_status(path.clone()).expect("a repository should report");
    assert!(status.line_totals.is_none());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_status_handles_an_unborn_branch() {
    let path = unique_temp_dir("status-unborn");
    git_init(&path);
    write_file(&path, "first.txt", "hello");

    let status = read_working_tree_status(path.clone()).expect("an unborn branch should report");
    assert_eq!(status.counts.new_files, 1);
    assert!(!status.is_clean);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_status_reports_a_linked_worktree_separately() {
    let path = unique_temp_dir("status-worktree");
    git_init(&path);
    git_commit_empty(&path);
    write_file(&path, "only-in-main.txt", "hello");

    let worktree = Path::new(&path).join("linked");
    let created = git_command(&path)
        .args(["worktree", "add", "-q", "-b", "linked-branch"])
        .arg(&worktree)
        .status()
        .expect("run git worktree add");
    assert!(created.success(), "git worktree add should succeed");

    let status = read_working_tree_status(worktree.to_string_lossy().to_string())
        .expect("a linked worktree should report");

    // The untracked file lives in the main checkout, not here.
    assert!(status.is_clean);
    assert_eq!(status.upstream.branch, Some("linked-branch".to_string()));

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn read_working_tree_status_rejects_a_missing_folder() {
    let path = unique_temp_dir("status-missing");
    let _ = fs::remove_dir_all(&path);

    let error = read_working_tree_status(path).expect_err("a missing folder should fail");
    assert_eq!(error.code, AppErrorCode::PathMissing);
    assert!(error.remediation.is_some());
}

#[test]
fn read_working_tree_status_rejects_a_non_repository_folder() {
    let path = unique_temp_dir("status-non-repo");

    let error = read_working_tree_status(path.clone())
        .expect_err("a folder outside a repository should fail");
    assert_eq!(error.code, AppErrorCode::GitCommandFailed);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn list_unpublished_versions_reports_every_local_commit_without_an_upstream() {
    let repo = unique_temp_dir("unpublished-no-upstream");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");

    let pending = list_unpublished_versions(repo.clone()).expect("should list without a remote");
    assert_eq!(pending.total_count, 2);
    assert!(!pending.is_truncated);
    assert_eq!(pending.versions[0].title, "second");
    assert_eq!(pending.versions[0].description, None);
    assert_eq!(pending.versions[1].title, "first");
    assert_eq!(pending.versions[1].description, None);
    assert!(!pending.versions[0].commit.is_empty());
    assert!(!pending.versions[0].short_commit.is_empty());

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn list_unpublished_versions_separates_an_existing_title_and_multiline_description() {
    let repo = unique_temp_dir("unpublished-message-body");
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    checked_git_stdout(
        test_git(
            &repo,
            &[
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
                "commit",
                "-m",
                "Añadir búsqueda 🔎",
                "-m",
                "Primera línea.\n\nSecond paragraph with context.",
            ],
        )
        .unwrap(),
    )
    .expect("commit with a body should succeed");

    let pending = list_unpublished_versions(repo.clone())
        .expect("the existing commit message should be readable");
    assert_eq!(pending.versions.len(), 1);
    assert_eq!(pending.versions[0].title, "Añadir búsqueda 🔎");
    assert_eq!(
        pending.versions[0].description.as_deref(),
        Some("Primera línea.\n\nSecond paragraph with context.")
    );

    let _ = fs::remove_dir_all(&repo);
}

#[test]
fn list_unpublished_versions_reports_only_commits_ahead_of_a_published_upstream() {
    let (repo, remote, _branch) = published_repo_and_remote("unpublished-list");

    assert!(list_unpublished_versions(repo.clone())
        .expect("should list with an upstream")
        .versions
        .is_empty());

    write_file(&repo, "b.txt", "second\n");
    git_add_all(&repo);
    git_commit(&repo, "second");
    write_file(&repo, "c.txt", "third\n");
    git_add_all(&repo);
    git_commit(&repo, "third");

    let pending = list_unpublished_versions(repo.clone()).expect("should list the two new commits");
    assert_eq!(pending.total_count, 2);
    assert_eq!(pending.versions[0].title, "third");
    assert_eq!(pending.versions[0].description, None);
    assert_eq!(pending.versions[1].title, "second");
    assert_eq!(pending.versions[1].description, None);

    let _ = fs::remove_dir_all(&repo);
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn list_unpublished_versions_reports_the_total_when_the_preview_is_truncated() {
    let repo = unique_temp_dir("unpublished-truncated");
    git_init(&repo);
    for _ in 0..(MAX_LISTED_SAVED_VERSIONS + 1) {
        git_commit_empty(&repo);
    }

    let pending =
        list_unpublished_versions(repo.clone()).expect("should report the capped preview");
    assert_eq!(pending.total_count, (MAX_LISTED_SAVED_VERSIONS + 1) as u32);
    assert_eq!(pending.versions.len(), MAX_LISTED_SAVED_VERSIONS);
    assert!(pending.is_truncated);

    let _ = fs::remove_dir_all(&repo);
}
