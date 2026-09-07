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
    let page = read_history_page(path.clone(), None, Some(50), None).expect("history should load");

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
    let page = read_history_page_cached(&cache, path.clone(), None, Some(50), None).unwrap();
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
    let first = read_history_page(path.clone(), None, Some(1), None).unwrap();
    assert!(first.has_more);
    let cursor = first.next_cursor.expect("continuation");

    write_file(&path, "file.txt", "changed again\n");
    commit_all(&path, "new head");
    let error = read_history_page(path.clone(), Some(cursor), Some(1), None).unwrap_err();
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

    let first = read_history_page(path.clone(), None, Some(100), None).unwrap();
    assert_eq!(first.versions.len(), 100);
    assert!(first.has_more);
    let second = read_history_page(path.clone(), first.next_cursor, Some(100), None).unwrap();
    assert_eq!(second.versions.len(), 100);
    assert!(second.has_more);
    let third = read_history_page(path.clone(), second.next_cursor, Some(100), None).unwrap();
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

    let page = read_history_page(path.clone(), None, Some(50), None).unwrap();
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
    let page = read_history_page(path.clone(), None, Some(50), None).unwrap();
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

    let attached = read_history_page(path.clone(), None, Some(50), None).unwrap();
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
    let detached = read_history_page(path.clone(), None, Some(50), None).unwrap();
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

    let page = read_history_page(path.clone(), None, Some(50), None).unwrap();
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
    let page = read_history_page(path.clone(), None, Some(50), None).unwrap();

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

    let page = read_history_page(path.clone(), None, Some(50), None).unwrap();
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
    let empty = read_history_page(unborn.clone(), None, Some(50), None).unwrap();
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
    let page = read_history_page(path.clone(), None, Some(50), None).unwrap();
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

fn commit_as(path: &str, author: &str, message: &str) {
    git_add_all(path);
    let status = git_command(path)
        .args([
            "-c",
            &format!("user.name={author}"),
            "-c",
            "user.email=author@gitodile.local",
            "commit",
            "-q",
            "-m",
            message,
        ])
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit should succeed");
}

fn subjects(page: &HistoryPage) -> Vec<String> {
    page.versions
        .iter()
        .map(|version| version.subject.clone())
        .collect()
}

fn filters() -> HistoryFilters {
    HistoryFilters::default()
}

/// Every filter is an argument to the same `rev-list` that pages the timeline,
/// so it narrows the whole reachable history. The page size here is 1: each
/// assertion would still pass if the filter ran over the loaded rows, but the
/// pagination assertion below would not.
#[test]
fn filters_narrow_the_whole_history_rather_than_one_page() {
    let path = unique_temp_dir("history-filters");
    git_init(&path);
    write_file(&path, "one.txt", "1\n");
    commit_as(&path, "Ada Lovelace", "ada writes one");
    write_file(&path, "two.txt", "2\n");
    commit_as(&path, "Grace Hopper", "grace writes two");
    write_file(&path, "one.txt", "1\n1\n");
    commit_as(&path, "Ada Lovelace", "ada writes one again");

    let by_author = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("Ada".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(
        subjects(&by_author),
        vec!["ada writes one again", "ada writes one"]
    );

    let by_path = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            path: Some("two.txt".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(subjects(&by_path), vec!["grace writes two"]);

    // The match the filter has to reach lives on the third commit, one page
    // past a page of one. A filter applied to loaded rows could not find it.
    let first = read_history_page(
        path.clone(),
        None,
        Some(1),
        Some(HistoryFilters {
            author: Some("Ada".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(subjects(&first), vec!["ada writes one again"]);
    assert!(first.has_more);
    let second = read_history_page(
        path.clone(),
        first.next_cursor,
        Some(1),
        Some(HistoryFilters {
            author: Some("Ada".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(subjects(&second), vec!["ada writes one"]);
    assert!(!second.has_more);

    let _ = fs::remove_dir_all(path);
}

/// A name box is not a regular-expression box. Git reads `--author` as one by
/// default, so a bracket typed into it fails the read outright rather than
/// matching nothing — and the screen can only report that as an error.
#[test]
fn author_filter_matches_text_rather_than_a_pattern() {
    let path = unique_temp_dir("history-author-text");
    git_init(&path);
    write_file(
        &path, "one.txt", "1
",
    );
    commit_as(&path, "Ada Lovelace", "ada writes");

    // Regex metacharacters are matched, not interpreted: an unterminated
    // bracket expression used to abort the whole page read.
    let bracket = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("a[".to_string()),
            ..filters()
        }),
    )
    .expect("a bracket in a name is text, not a broken pattern");
    assert!(bracket.versions.is_empty());

    // And the match ignores case, because "ada" is how someone looks for Ada.
    let lowercase = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("ada".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(subjects(&lowercase), vec!["ada writes"]);

    let _ = fs::remove_dir_all(path);
}

/// The unpublished filter is `--not <upstream>`, and publication for a filtered
/// page is classified per commit rather than by the windowed walk an unfiltered
/// page uses — the two must agree.
#[test]
fn unpublished_filter_and_publication_agree_against_the_upstream() {
    let source = unique_temp_dir("history-unpublished-source");
    git_init(&source);
    write_file(&source, "file.txt", "published\n");
    commit_all(&source, "published version");

    let clone = unique_temp_dir("history-unpublished-clone");
    let file_url = if cfg!(windows) {
        format!("file:///{}", source.replace('\\', "/"))
    } else {
        format!("file://{source}")
    };
    assert!(git_command(&clone)
        .args(["clone", "-q", &file_url, "."])
        .status()
        .unwrap()
        .success());
    write_file(&clone, "file.txt", "local\n");
    commit_all(&clone, "local version");

    let all = read_history_page(clone.clone(), None, Some(50), None).unwrap();
    assert_eq!(subjects(&all), vec!["local version", "published version"]);
    assert_eq!(all.versions[0].publication, PublicationState::LocalOnly);
    assert_eq!(all.versions[1].publication, PublicationState::Published);

    let unpublished = read_history_page(
        clone.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            unpublished_only: true,
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(subjects(&unpublished), vec!["local version"]);
    assert_eq!(
        unpublished.versions[0].publication,
        PublicationState::LocalOnly
    );

    // A filtered page takes the per-commit classification path; it must reach
    // the same verdict the unfiltered page did.
    let by_author = read_history_page(
        clone.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("GitOdile Test".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(by_author.versions.len(), 2);
    assert_eq!(
        by_author.versions[0].publication,
        PublicationState::LocalOnly
    );
    assert_eq!(
        by_author.versions[1].publication,
        PublicationState::Published
    );

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}

#[test]
fn history_filters_are_validated_before_they_reach_git() {
    let path = unique_temp_dir("history-filter-validation");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");

    for invalid in [
        HistoryFilters {
            since: Some("last tuesday".to_string()),
            ..filters()
        },
        HistoryFilters {
            until: Some("2026-9-1".to_string()),
            ..filters()
        },
        HistoryFilters {
            path: Some("../outside.txt".to_string()),
            ..filters()
        },
        HistoryFilters {
            author: Some("a\u{7}b".to_string()),
            ..filters()
        },
        HistoryFilters {
            author: Some("a".repeat(201)),
            ..filters()
        },
    ] {
        assert!(
            read_history_page(path.clone(), None, Some(50), Some(invalid)).is_err(),
            "an invalid filter must be refused rather than passed to Git"
        );
    }

    // Blank is not invalid, it is simply nothing asked for.
    let blank = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("   ".to_string()),
            path: Some(String::new()),
            ..filters()
        }),
    )
    .unwrap();
    assert_eq!(blank.versions.len(), 1);

    let _ = fs::remove_dir_all(path);
}

/// A date filter is a calendar day, and merges can be hidden.
#[test]
fn date_and_merge_filters_narrow_the_timeline() {
    let path = unique_temp_dir("history-date-merge");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");
    assert!(git_command(&path)
        .args(["checkout", "-q", "-b", "side"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "side.txt", "side\n");
    commit_all(&path, "side work");
    assert!(git_command(&path)
        .args(["checkout", "-q", "-"])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "merge side",
            "side",
        ])
        .status()
        .unwrap()
        .success());

    let all = read_history_page(path.clone(), None, Some(50), None).unwrap();
    assert!(subjects(&all).contains(&"merge side".to_string()));

    let without_merges = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            no_merges: true,
            ..filters()
        }),
    )
    .unwrap();
    assert!(!subjects(&without_merges).contains(&"merge side".to_string()));
    assert!(without_merges
        .versions
        .iter()
        .all(|version| !version.is_merge));

    // Everything in this repository was written today, so a window that closed
    // before it started has to come back empty rather than unfiltered.
    let none = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            until: Some("2000-01-01".to_string()),
            ..filters()
        }),
    )
    .unwrap();
    assert!(none.versions.is_empty());

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
    let page = read_history_page(clone.clone(), None, Some(50), None).unwrap();
    assert!(page.shallow);
    assert_eq!(page.versions.len(), 1);
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::ShallowRepository));

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}
