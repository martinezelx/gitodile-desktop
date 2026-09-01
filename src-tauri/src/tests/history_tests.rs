use crate::test_support::*;
use crate::*;
use std::fs;
use std::path::Path;

fn commit_all(path: &str, message: &str) {
    git_add_all(path);
    git_commit(path, message);
}

fn head(path: &str) -> String {
    git_stdout(
        &git_command(path)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap(),
    )
}

#[test]
fn history_reads_root_and_normal_versions_without_mutating_the_repository() {
    let path = unique_temp_dir("history-linear");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");
    write_file(&path, "file.txt", "one\ntwo\n");
    commit_all(&path, "second");

    let before_head = head(&path);
    let before_status = git_command(&path)
        .args(["status", "--porcelain=v2", "-z"])
        .output()
        .unwrap()
        .stdout;
    let before_config = fs::read(Path::new(&path).join(".git/config")).unwrap();
    let page = read_history_page(path.clone(), None, Some(50)).expect("history should load");

    assert_eq!(page.versions.len(), 2);
    assert_eq!(page.versions[0].subject, "second");
    assert!(!page.versions[0].is_root);
    assert!(page.versions[1].is_root);
    assert_eq!(page.versions[0].publication, PublicationState::Unknown);
    assert_eq!(head(&path), before_head);
    assert_eq!(
        git_command(&path)
            .args(["status", "--porcelain=v2", "-z"])
            .output()
            .unwrap()
            .stdout,
        before_status
    );
    assert_eq!(
        fs::read(Path::new(&path).join(".git/config")).unwrap(),
        before_config
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn native_history_cache_reuses_page_context_for_detail_and_file_diff() {
    let path = unique_temp_dir("history-native-cache");
    git_init(&path);
    write_file(&path, "cached.rs", "fn before() {}\n");
    commit_all(&path, "base");
    write_file(&path, "cached.rs", "fn after() {}\n");
    commit_all(&path, "cached detail");

    let cache = HistoryReadCache::default();
    let page = read_history_page_cached(&cache, path.clone(), None, Some(50)).unwrap();
    let commit = page.versions[0].commit.clone();
    let detail = read_saved_version_detail_cached(
        &cache,
        path.clone(),
        page.snapshot_token.clone(),
        commit.clone(),
    )
    .unwrap();
    assert_eq!(detail.version.subject, "cached detail");
    assert_eq!(detail.files.len(), 1);

    let diff = read_saved_version_file_diff_cached(
        &cache,
        path.clone(),
        page.snapshot_token,
        commit,
        "cached.rs".to_string(),
    )
    .unwrap();
    assert!(matches!(diff, FileDiff::Text { .. }));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn pagination_rejects_a_cursor_after_head_changes() {
    let path = unique_temp_dir("history-stale-cursor");
    git_init(&path);
    for index in 0..3 {
        write_file(&path, "file.txt", &format!("{index}\n"));
        commit_all(&path, &format!("version {index}"));
    }
    let first = read_history_page(path.clone(), None, Some(1)).unwrap();
    assert!(first.has_more);
    let cursor = first.next_cursor.expect("continuation");

    write_file(&path, "file.txt", "changed again\n");
    commit_all(&path, "new head");
    let error = read_history_page(path.clone(), Some(cursor), Some(1)).unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleHistoryCursor);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn pagination_covers_hundreds_of_versions_without_duplicates_or_gaps() {
    let path = unique_temp_dir("history-hundreds");
    git_init(&path);
    for _ in 0..205 {
        git_commit_empty(&path);
    }

    let first = read_history_page(path.clone(), None, Some(100)).unwrap();
    assert_eq!(first.versions.len(), 100);
    assert!(first.has_more);
    let second = read_history_page(path.clone(), first.next_cursor, Some(100)).unwrap();
    assert_eq!(second.versions.len(), 100);
    assert!(second.has_more);
    let third = read_history_page(path.clone(), second.next_cursor, Some(100)).unwrap();
    assert_eq!(third.versions.len(), 5);
    assert!(!third.has_more);

    let commits = first
        .versions
        .into_iter()
        .chain(second.versions)
        .chain(third.versions)
        .map(|version| version.commit)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(commits.len(), 205);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn messages_preserve_unicode_multiline_and_empty_content() {
    let path = unique_temp_dir("history-messages");
    git_init(&path);
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "-q",
            "-m",
            "Título ✓",
            "-m",
            "Primera línea\nSegunda línea 🐊",
        ])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "--allow-empty-message",
            "-q",
            "-m",
            "",
        ])
        .status()
        .unwrap()
        .success());

    let page = read_history_page(path.clone(), None, Some(50)).unwrap();
    assert_eq!(page.versions[0].subject, "");
    assert_eq!(page.versions[1].subject, "Título ✓");
    assert_eq!(
        page.versions[1].description,
        "Primera línea\nSegunda línea 🐊"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn publication_states_follow_the_configured_upstream_without_network_access() {
    let path = unique_temp_dir("history-publication");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "published root");
    write_file(&path, "file.txt", "one\ntwo\n");
    commit_all(&path, "published second");

    let remote = unique_temp_dir("history-publication-remote");
    init_bare_remote(&remote);
    wire_remote(&path, "team", &remote);
    let branch = current_branch(&path);
    assert!(git_command(&path)
        .args(["push", "-u", "team", &branch])
        .status()
        .unwrap()
        .success());

    write_file(&path, "file.txt", "one\ntwo\nlocal\n");
    commit_all(&path, "local only");
    let page = read_history_page(path.clone(), None, Some(50)).unwrap();
    assert_eq!(page.upstream.as_ref().unwrap().remote, "team");
    assert_eq!(page.versions[0].publication, PublicationState::LocalOnly);
    assert!(page.versions[1..]
        .iter()
        .all(|version| version.publication == PublicationState::Published));

    let _ = fs::remove_dir_all(path);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn merge_tag_and_detached_history_keep_typed_graph_and_decorations() {
    let path = unique_temp_dir("history-merge");
    git_init(&path);
    write_file(&path, "root.txt", "root\n");
    commit_all(&path, "root");
    let main = current_branch(&path);
    assert!(git_command(&path)
        .args(["switch", "-c", "side"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "side.txt", "side\n");
    commit_all(&path, "side version");
    assert!(git_command(&path)
        .args(["switch", &main])
        .status()
        .unwrap()
        .success());
    write_file(&path, "main.txt", "main\n");
    commit_all(&path, "main version");
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "--no-ff",
            "-m",
            "merge version",
            "side",
        ])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&path)
        .args(["tag", "v1.0"])
        .status()
        .unwrap()
        .success());

    let attached = read_history_page(path.clone(), None, Some(50)).unwrap();
    assert!(attached.versions[0].is_merge);
    assert_eq!(attached.versions[0].parents.len(), 2);
    assert!(attached.versions[0]
        .decorations
        .iter()
        .any(|item| item.kind == DecorationKind::Head));
    assert!(attached.versions[0]
        .decorations
        .iter()
        .any(|item| item.kind == DecorationKind::Tag && item.name == "v1.0"));

    assert!(git_command(&path)
        .args(["switch", "--detach"])
        .status()
        .unwrap()
        .success());
    let detached = read_history_page(path.clone(), None, Some(50)).unwrap();
    assert_eq!(detached.head_state, HeadState::Detached);
    assert!(detached.branch.is_none());
    assert!(detached.versions[0].is_merge);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn many_decorations_are_capped_and_reported_without_ambiguous_splitting() {
    let path = unique_temp_dir("history-many-decorations");
    git_init(&path);
    git_commit_empty(&path);
    for index in 0..40 {
        assert!(git_command(&path)
            .args(["tag", &format!("release,{index:02}")])
            .status()
            .unwrap()
            .success());
    }

    let page = read_history_page(path.clone(), None, Some(50)).unwrap();
    assert_eq!(
        page.versions[0].decorations.len(),
        MAX_DECORATIONS_PER_VERSION
    );
    assert!(page.versions[0].decorations_truncated);
    assert!(page.versions[0]
        .decorations
        .iter()
        .any(|item| item.name == "release,00"));
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::DecorationsTruncated));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn details_compare_root_to_empty_tree_and_merge_to_first_parent() {
    let path = unique_temp_dir("history-detail-bases");
    git_init(&path);
    write_file(&path, "root.txt", "root\n");
    commit_all(&path, "root");
    let root = head(&path);
    let main = current_branch(&path);
    assert!(git_command(&path)
        .args(["switch", "-c", "side"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "side.txt", "side\n");
    commit_all(&path, "side");
    assert!(git_command(&path)
        .args(["switch", &main])
        .status()
        .unwrap()
        .success());
    write_file(&path, "main.txt", "main\n");
    commit_all(&path, "main");
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "--no-ff",
            "-m",
            "merge",
            "side",
        ])
        .status()
        .unwrap()
        .success());
    let merge = head(&path);
    let page = read_history_page(path.clone(), None, Some(50)).unwrap();

    let root_detail =
        read_saved_version_detail(path.clone(), page.snapshot_token.clone(), root).unwrap();
    assert!(root_detail.comparison_is_empty_tree);
    assert!(!root_detail.comparison_is_first_parent);
    assert!(root_detail
        .files
        .iter()
        .any(|file| file.path == "root.txt" && file.category == ChangeCategory::New));

    let merge_detail =
        read_saved_version_detail(path.clone(), page.snapshot_token.clone(), merge.clone())
            .unwrap();
    assert!(merge_detail.comparison_is_first_parent);
    assert!(merge_detail
        .files
        .iter()
        .any(|file| file.path == "side.txt"));
    let diff = read_saved_version_file_diff(
        path.clone(),
        page.snapshot_token,
        merge,
        "side.txt".to_string(),
    )
    .unwrap();
    assert!(matches!(
        diff,
        FileDiff::Text {
            change: ChangeCategory::New,
            ..
        }
    ));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn detail_reuses_typed_rename_delete_binary_and_too_large_diff_states() {
    let path = unique_temp_dir("history-detail-states");
    git_init(&path);
    write_file(&path, "old.txt", "old\n");
    write_file(&path, "delete.txt", "delete\n");
    fs::write(Path::new(&path).join("binary.bin"), [0_u8, 1, 2]).unwrap();
    commit_all(&path, "base files");

    assert!(git_command(&path)
        .args(["mv", "old.txt", "renamed.txt"])
        .status()
        .unwrap()
        .success());
    fs::remove_file(Path::new(&path).join("delete.txt")).unwrap();
    fs::write(Path::new(&path).join("binary.bin"), [0_u8, 9, 8, 7]).unwrap();
    fs::write(
        Path::new(&path).join("huge.txt"),
        vec![b'x'; MAX_DIFF_OUTPUT_BYTES + 1024],
    )
    .unwrap();
    commit_all(&path, "mixed file states");

    let page = read_history_page(path.clone(), None, Some(50)).unwrap();
    let commit = page.versions[0].commit.clone();
    let detail =
        read_saved_version_detail(path.clone(), page.snapshot_token.clone(), commit.clone())
            .unwrap();
    assert!(detail
        .files
        .iter()
        .any(|file| file.path == "renamed.txt" && file.category == ChangeCategory::Renamed));
    assert!(detail
        .files
        .iter()
        .any(|file| file.path == "delete.txt" && file.category == ChangeCategory::Deleted));
    let binary = read_saved_version_file_diff(
        path.clone(),
        page.snapshot_token.clone(),
        commit.clone(),
        "binary.bin".to_string(),
    )
    .unwrap();
    assert!(matches!(binary, FileDiff::Binary { .. }));
    let huge = read_saved_version_file_diff(
        path.clone(),
        page.snapshot_token,
        commit,
        "huge.txt".to_string(),
    )
    .unwrap();
    assert!(matches!(huge, FileDiff::TooLarge { .. }));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn unborn_and_oversized_messages_return_truthful_bounded_pages() {
    let unborn = unique_temp_dir("history-unborn");
    git_init(&unborn);
    let empty = read_history_page(unborn.clone(), None, Some(50)).unwrap();
    assert_eq!(empty.head_state, HeadState::Unborn);
    assert!(empty.versions.is_empty());

    let path = unique_temp_dir("history-large-message");
    git_init(&path);
    git_commit_empty(&path);
    let message_path = Path::new(&path).join("large-message.txt");
    fs::write(
        &message_path,
        "L".repeat(MAX_PAGE_COMMIT_OBJECT_BYTES + 1024),
    )
    .unwrap();
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "-q",
            "-F",
        ])
        .arg(&message_path)
        .status()
        .unwrap()
        .success());
    let page = read_history_page(path.clone(), None, Some(50)).unwrap();
    assert_eq!(page.versions.len(), 2);
    assert_eq!(
        page.versions[0].message_unavailable,
        Some(MessageUnavailableReason::TooLarge)
    );
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::MessagesTruncated));

    let _ = fs::remove_dir_all(unborn);
    let _ = fs::remove_dir_all(path);
}

#[test]
fn shallow_history_is_reported_explicitly() {
    let source = unique_temp_dir("history-shallow-source");
    git_init(&source);
    for index in 0..3 {
        write_file(&source, "file.txt", &format!("{index}\n"));
        commit_all(&source, &format!("version {index}"));
    }
    let clone = unique_temp_dir("history-shallow-clone");
    let file_url = if cfg!(windows) {
        format!("file:///{}", source.replace('\\', "/"))
    } else {
        format!("file://{source}")
    };
    assert!(git_command(&clone)
        .args(["clone", "--depth=1", "-q", &file_url, "."])
        .status()
        .unwrap()
        .success());
    let page = read_history_page(clone.clone(), None, Some(50)).unwrap();
    assert!(page.shallow);
    assert_eq!(page.versions.len(), 1);
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::ShallowRepository));

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}
