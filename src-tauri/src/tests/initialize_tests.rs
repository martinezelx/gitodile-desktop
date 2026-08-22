use crate::test_support::{
    empty_identity_override, git_init, unique_temp_dir, write_failing_hook, write_fake_failing_gpg,
    write_file, write_test_identity_config,
};
use crate::*;
use std::fs;
use std::path::Path;

fn plan_new(parent: &str, name: &str, readme: bool) -> InitializeProjectPlan {
    plan_initialize_project(
        InitializeTargetKind::NewFolder,
        parent.into(),
        name.into(),
        String::new(),
        "main".into(),
        readme,
        false,
    )
    .unwrap()
}

fn execute_plan(
    plan: InitializeProjectPlan,
    parent: &str,
    name: &str,
    existing: &str,
) -> InitializeProjectResult {
    initialize_project(
        plan.target_kind,
        parent.into(),
        name.into(),
        existing.into(),
        plan.initial_branch,
        plan.create_readme,
        plan.save_initial_version,
        plan.operation_id,
        plan.state_token,
        |_| {},
    )
    .unwrap()
}

#[test]
fn new_unicode_folder_initializes_unborn_branch_and_opens_normally() {
    let parent = unique_temp_dir("initialize-new-unicode");
    let name = "mi proyecto 🐊";
    let plan = plan_new(&parent, name, false);
    let destination = plan.destination_path.clone();
    let mut phases = Vec::new();
    let result = initialize_project(
        plan.target_kind,
        parent,
        name.into(),
        String::new(),
        "main".into(),
        false,
        false,
        plan.operation_id,
        plan.state_token,
        |phase| phases.push(phase),
    )
    .unwrap();

    assert_eq!(result.outcome, InitializeOutcome::Completed);
    assert_eq!(
        phases,
        vec![
            InitializeProgressPhase::Revalidating,
            InitializeProgressPhase::PreparingFolder,
            InitializeProgressPhase::InitializingGit,
            InitializeProgressPhase::Verifying,
            InitializeProgressPhase::Finalizing,
        ]
    );
    assert!(!Path::new(&destination).join(OWNER_MARKER).exists());
    assert!(!Path::new(&destination)
        .join(".git")
        .join(OWNER_MARKER)
        .exists());
    let opened = open_repository(destination, None).unwrap();
    assert_eq!(opened.branch.as_deref(), Some("main"));
    assert_eq!(opened.head_state, HeadState::Unborn);
}

#[test]
fn existing_files_remain_byte_identical_and_readme_requires_explicit_consent() {
    let folder = unique_temp_dir("initialize-existing-bytes");
    let binary = [0, 1, 2, 0xff, b'\n'];
    fs::write(Path::new(&folder).join("existing.bin"), binary).unwrap();
    fs::write(
        Path::new(&folder).join("notes.txt"),
        "línea uno\r\nlínea dos\n",
    )
    .unwrap();
    let before_binary = fs::read(Path::new(&folder).join("existing.bin")).unwrap();
    let before_notes = fs::read(Path::new(&folder).join("notes.txt")).unwrap();

    let plan = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        folder.clone(),
        "trunk".into(),
        false,
        false,
    )
    .unwrap();
    assert_eq!(plan.existing_entry_count, 2);
    execute_plan(plan, "", "", &folder);

    assert_eq!(
        fs::read(Path::new(&folder).join("existing.bin")).unwrap(),
        before_binary
    );
    assert_eq!(
        fs::read(Path::new(&folder).join("notes.txt")).unwrap(),
        before_notes
    );
    assert!(!Path::new(&folder).join("README.md").exists());

    let second = unique_temp_dir("initialize-existing-readme");
    let plan = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        second.clone(),
        "main".into(),
        true,
        false,
    )
    .unwrap();
    execute_plan(plan, "", "", &second);
    assert_eq!(
        fs::read(Path::new(&second).join("README.md")).unwrap(),
        b"# Project\n"
    );
}

#[test]
fn existing_git_metadata_nested_projects_and_linked_worktrees_are_blocked() {
    let repository = unique_temp_dir("initialize-existing-repo");
    git_init(&repository);
    let error = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        repository.clone(),
        "main".into(),
        false,
        false,
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::ExistingGitMetadata);

    let child = Path::new(&repository).join("ordinary-child");
    fs::create_dir(&child).unwrap();
    let nested = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        child.to_string_lossy().into_owned(),
        "main".into(),
        false,
        false,
    )
    .unwrap_err();
    assert_eq!(nested.code, AppErrorCode::NestedRepository);

    let outer = unique_temp_dir("initialize-outer-with-nested");
    let nested_repo = Path::new(&outer).join("vendor");
    fs::create_dir(&nested_repo).unwrap();
    git_init(&nested_repo.to_string_lossy());
    let nested_descendant = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        outer,
        "main".into(),
        false,
        false,
    )
    .unwrap_err();
    assert_eq!(nested_descendant.code, AppErrorCode::NestedRepository);

    write_file(&repository, "tracked.txt", "one\n");
    let add = git_command(&repository)
        .args(["add", "tracked.txt"])
        .status()
        .unwrap();
    assert!(add.success());
    let commit = git_command(&repository)
        .args([
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.test",
            "commit",
            "-q",
            "-m",
            "one",
        ])
        .status()
        .unwrap();
    assert!(commit.success());
    let worktree_parent = unique_temp_dir("initialize-worktree-parent");
    let worktree = Path::new(&worktree_parent).join("linked");
    let created = git_command(&repository)
        .args([
            "worktree",
            "add",
            "-q",
            "-b",
            "linked-test",
            worktree.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(created.success());
    let linked = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        worktree.to_string_lossy().into_owned(),
        "main".into(),
        false,
        false,
    )
    .unwrap_err();
    assert_eq!(linked.code, AppErrorCode::LinkedWorktree);
}

#[test]
fn destinations_case_collisions_existing_paths_and_races_preserve_user_content() {
    let parent = unique_temp_dir("initialize-collision");
    fs::create_dir(Path::new(&parent).join("Project")).unwrap();
    let collision = plan_initialize_project(
        InitializeTargetKind::NewFolder,
        parent.clone(),
        "project".into(),
        String::new(),
        "main".into(),
        false,
        false,
    )
    .unwrap_err();
    assert!(matches!(
        collision.code,
        AppErrorCode::ProjectDestinationExists | AppErrorCode::ProjectDestinationCollides
    ));

    let race_parent = unique_temp_dir("initialize-race");
    let plan = plan_new(&race_parent, "raced", false);
    let destination = Path::new(&race_parent).join("raced");
    let result = initialize_project(
        plan.target_kind,
        race_parent,
        "raced".into(),
        String::new(),
        "main".into(),
        false,
        false,
        plan.operation_id,
        plan.state_token,
        |phase| {
            if phase == InitializeProgressPhase::Revalidating {
                fs::create_dir(&destination).unwrap();
                fs::write(destination.join("user.txt"), b"mine\n").unwrap();
            }
        },
    );
    assert_eq!(
        result.unwrap_err().code,
        AppErrorCode::ProjectDestinationExists
    );
    assert_eq!(fs::read(destination.join("user.txt")).unwrap(), b"mine\n");
}

#[test]
fn stale_plan_invalid_branch_and_readme_collision_mutate_nothing() {
    let parent = unique_temp_dir("initialize-stale");
    let plan = plan_new(&parent, "project", false);
    let stale = initialize_project(
        plan.target_kind,
        parent.clone(),
        "changed".into(),
        String::new(),
        "main".into(),
        false,
        false,
        plan.operation_id,
        plan.state_token,
        |_| {},
    );
    assert_eq!(stale.unwrap_err().code, AppErrorCode::StaleInitializePlan);
    assert!(!Path::new(&parent).join("project").exists());
    assert!(!Path::new(&parent).join("changed").exists());

    let invalid = plan_initialize_project(
        InitializeTargetKind::NewFolder,
        parent,
        "project".into(),
        String::new(),
        "bad branch".into(),
        false,
        false,
    )
    .unwrap_err();
    assert_eq!(invalid.code, AppErrorCode::InvalidInitialBranch);

    let existing = unique_temp_dir("initialize-readme-collision");
    fs::write(Path::new(&existing).join("ReadMe.md"), b"keep\n").unwrap();
    let readme = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        existing.clone(),
        "main".into(),
        true,
        false,
    )
    .unwrap_err();
    assert_eq!(readme.code, AppErrorCode::ReadmeAlreadyExists);
    assert_eq!(
        fs::read(Path::new(&existing).join("ReadMe.md")).unwrap(),
        b"keep\n"
    );
}

#[test]
fn initialized_project_reuses_identity_hook_and_signing_aware_save_contract() {
    let parent = unique_temp_dir("initialize-first-save");
    let plan = plan_new(&parent, "project", true);
    let result = execute_plan(plan, &parent, "project", "");
    let opened = open_repository(result.destination_path.clone(), None).unwrap();

    let missing = empty_identity_override("initialize-missing");
    let error =
        plan_save_version_with_identity_override(result.destination_path.clone(), Some(&missing))
            .unwrap_err();
    assert_eq!(error.code, AppErrorCode::MissingIdentity);

    let identity = write_test_identity_config("initialize-hook");
    write_failing_hook(Path::new(&opened.git_dir), "pre-commit");
    let save_plan =
        plan_save_version_with_identity_override(result.destination_path.clone(), Some(&identity))
            .unwrap();
    let hook = save_version_with_identity_override(
        result.destination_path.clone(),
        "First version".into(),
        None,
        save_plan.state_token,
        Some(&identity),
    )
    .unwrap_err();
    assert_eq!(hook.code, AppErrorCode::HookRejected);
    assert!(Path::new(&result.destination_path)
        .join("README.md")
        .exists());
    let head = git_command(&result.destination_path)
        .args(["rev-parse", "--verify", "HEAD"])
        .status()
        .unwrap();
    assert!(!head.success(), "hook failure must leave the branch unborn");

    fs::remove_file(Path::new(&opened.git_dir).join("hooks").join("pre-commit")).unwrap();
    let fake_gpg = write_fake_failing_gpg("initialize-first-save");
    assert!(git_command(&result.destination_path)
        .args(["config", "commit.gpgsign", "true"])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&result.destination_path)
        .args(["config", "gpg.program", &fake_gpg])
        .status()
        .unwrap()
        .success());
    let signing_plan =
        plan_save_version_with_identity_override(result.destination_path.clone(), Some(&identity))
            .unwrap();
    let signing = save_version_with_identity_override(
        result.destination_path.clone(),
        "First version".into(),
        None,
        signing_plan.state_token,
        Some(&identity),
    )
    .unwrap_err();
    assert_eq!(signing.code, AppErrorCode::SigningFailed);
    assert!(!git_command(&result.destination_path)
        .args(["rev-parse", "--verify", "HEAD"])
        .status()
        .unwrap()
        .success());
    let _ = fs::remove_file(fake_gpg);

    let success_parent = unique_temp_dir("initialize-first-save-success");
    let success_plan = plan_new(&success_parent, "project", true);
    let success_result = execute_plan(success_plan, &success_parent, "project", "");
    let success_identity = write_test_identity_config("initialize-first-save-success");
    let save_plan = plan_save_version_with_identity_override(
        success_result.destination_path.clone(),
        Some(&success_identity),
    )
    .unwrap();
    save_version_with_identity_override(
        success_result.destination_path.clone(),
        "First version".into(),
        None,
        save_plan.state_token,
        Some(&success_identity),
    )
    .unwrap();
    assert!(git_command(&success_result.destination_path)
        .args(["rev-parse", "--verify", "HEAD"])
        .status()
        .unwrap()
        .success());
}

#[test]
fn remote_connection_is_separately_planned_redacted_and_preserves_config() {
    let parent = unique_temp_dir("initialize-remote");
    let init = plan_new(&parent, "project", false);
    let result = execute_plan(init, &parent, "project", "");
    let opened = open_repository(result.destination_path.clone(), None).unwrap();
    let before = git_command(&result.destination_path)
        .args(["config", "--local", "custom.keep", "yes"])
        .status()
        .unwrap();
    assert!(before.success());

    let submitted = "https://alice:secret@example.test/team/repo.git?token=hidden#fragment";
    let plan = plan_connect_remote(
        result.destination_path.clone(),
        opened.session_epoch.clone(),
        "origin".into(),
        submitted.into(),
    )
    .unwrap();
    assert_eq!(plan.fetch_url_display, "https://example.test/team/repo.git");
    assert!(!plan.fetch_url_display.contains("secret"));
    assert!(!plan.contacts_network);
    assert!(plan.future_network_access);
    let connected = connect_remote(
        result.destination_path.clone(),
        opened.session_epoch,
        "origin".into(),
        submitted.into(),
        plan.state_token,
    )
    .unwrap();
    assert_eq!(connected.remote_name, "origin");
    let url = git_command(&result.destination_path)
        .args(["config", "--local", "--get", "remote.origin.url"])
        .output()
        .unwrap();
    assert_eq!(git_stdout(&url), "https://example.test/team/repo.git");
    let keep = git_command(&result.destination_path)
        .args(["config", "--local", "--get", "custom.keep"])
        .output()
        .unwrap();
    assert_eq!(git_stdout(&keep), "yes");

    let duplicate = plan_connect_remote(
        result.destination_path.clone(),
        connected.session_epoch.clone(),
        "ORIGIN".into(),
        "ssh://git@example.test/team/other.git".into(),
    )
    .unwrap_err();
    assert_eq!(duplicate.code, AppErrorCode::RemoteNameExists);

    let invalid = plan_connect_remote(
        result.destination_path.clone(),
        connected.session_epoch.clone(),
        "backup".into(),
        "javascript:alert(1)".into(),
    )
    .unwrap_err();
    assert_eq!(invalid.code, AppErrorCode::InvalidRemoteUrl);

    let stale_plan = plan_connect_remote(
        result.destination_path.clone(),
        connected.session_epoch.clone(),
        "backup".into(),
        "ssh://git@example.test/team/backup.git".into(),
    )
    .unwrap();
    assert!(git_command(&result.destination_path)
        .args([
            "config",
            "--local",
            "remote.origin.pushurl",
            "ssh://git@example.test/team/publish.git",
        ])
        .status()
        .unwrap()
        .success());
    let stale = connect_remote(
        result.destination_path.clone(),
        connected.session_epoch,
        "backup".into(),
        "ssh://git@example.test/team/backup.git".into(),
        stale_plan.state_token,
    )
    .unwrap_err();
    assert_eq!(stale.code, AppErrorCode::StaleConnectRemotePlan);
    assert!(!git_stdout(
        &git_command(&result.destination_path)
            .args(["remote"])
            .output()
            .unwrap()
    )
    .lines()
    .any(|name| name == "backup"));
}

#[test]
fn long_local_paths_and_custom_unborn_branch_are_supported_within_platform_limits() {
    let root = unique_temp_dir("initialize-long-path");
    let level_one = Path::new(&root).join("a".repeat(48));
    let level_two = level_one.join("b".repeat(48));
    fs::create_dir_all(&level_two).unwrap();
    let parent = level_two.to_string_lossy().into_owned();
    let name = "c".repeat(48);
    let plan = plan_initialize_project(
        InitializeTargetKind::NewFolder,
        parent.clone(),
        name.clone(),
        String::new(),
        "release/first".into(),
        false,
        false,
    )
    .unwrap();
    let result = execute_plan(plan, &parent, &name, "");
    let opened = open_repository(result.destination_path, None).unwrap();
    assert_eq!(opened.branch.as_deref(), Some("release/first"));
    assert_eq!(opened.head_state, HeadState::Unborn);
}

#[cfg(windows)]
#[test]
fn existing_folder_windows_symlink_alias_is_resolved_when_privileges_allow_it() {
    use std::os::windows::fs::symlink_dir;
    let root = unique_temp_dir("initialize-windows-symlink");
    let target = Path::new(&root).join("target");
    let alias = Path::new(&root).join("alias");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("data.txt"), b"unchanged\n").unwrap();
    if symlink_dir(&target, &alias).is_err() {
        return;
    }
    let plan = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        alias.to_string_lossy().into_owned(),
        "main".into(),
        false,
        false,
    )
    .unwrap();
    assert_eq!(
        Path::new(&plan.destination_path),
        target.canonicalize().unwrap()
    );
    execute_plan(plan, "", "", &alias.to_string_lossy());
    assert_eq!(fs::read(target.join("data.txt")).unwrap(), b"unchanged\n");
    assert!(alias.symlink_metadata().unwrap().file_type().is_symlink());
}

#[cfg(unix)]
#[test]
fn existing_folder_symlink_is_resolved_without_touching_the_alias() {
    use std::os::unix::fs::symlink;
    let root = unique_temp_dir("initialize-symlink");
    let target = Path::new(&root).join("target");
    let alias = Path::new(&root).join("alias");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("data.txt"), b"unchanged\n").unwrap();
    symlink(&target, &alias).unwrap();
    let plan = plan_initialize_project(
        InitializeTargetKind::ExistingFolder,
        String::new(),
        String::new(),
        alias.to_string_lossy().into_owned(),
        "main".into(),
        false,
        false,
    )
    .unwrap();
    assert_eq!(
        Path::new(&plan.destination_path),
        target.canonicalize().unwrap()
    );
    execute_plan(plan, "", "", &alias.to_string_lossy());
    assert_eq!(fs::read(target.join("data.txt")).unwrap(), b"unchanged\n");
    assert!(alias.symlink_metadata().unwrap().file_type().is_symlink());
}
