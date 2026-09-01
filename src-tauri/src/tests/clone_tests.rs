use crate::test_support::{git_add_all, git_commit, git_init, unique_temp_dir, write_file};
use crate::*;
use std::fs;
use std::path::Path;

fn clone_fixture(label: &str) -> (String, String) {
    let source = unique_temp_dir(&format!("clone-source-{label}"));
    git_init(&source);
    write_file(&source, "hello.txt", "hello from clone\n");
    git_add_all(&source);
    git_commit(&source, "first");
    let destination_parent = unique_temp_dir(&format!("clone-destination-{label}"));
    (source, destination_parent)
}

#[test]
fn local_clone_stages_verifies_publishes_and_opens_through_the_existing_lifecycle() {
    let (source, destination_parent) = clone_fixture("success");
    let plan = plan_clone(source.clone(), destination_parent.clone(), "project".into()).unwrap();
    let registry = CloneOperationRegistry::default();
    let mut phases = Vec::new();
    let result = clone_repository(
        &registry,
        source,
        destination_parent.clone(),
        "project".into(),
        plan.operation_id.clone(),
        plan.state_token,
        |phase| phases.push(phase),
    )
    .unwrap();

    assert_eq!(result.outcome, CloneOutcome::Completed);
    assert_eq!(
        phases,
        vec![
            CloneProgressPhase::Preparing,
            CloneProgressPhase::Cloning,
            CloneProgressPhase::SanitizingRemote,
            CloneProgressPhase::Verifying,
            CloneProgressPhase::Publishing,
            CloneProgressPhase::Finalizing,
        ]
    );
    assert!(Path::new(&result.destination_path)
        .join("hello.txt")
        .is_file());
    assert!(!Path::new(&destination_parent)
        .join(format!(".gitodile-clone-{}", plan.operation_id))
        .exists());

    let opened = open_repository(result.destination_path, None).unwrap();
    assert_eq!(opened.name, "project");
}

#[test]
fn a_destination_race_blocks_publication_and_cleans_only_owned_staging() {
    let (source, destination_parent) = clone_fixture("race");
    let destination = Path::new(&destination_parent).join("project");
    let plan = plan_clone(source.clone(), destination_parent.clone(), "project".into()).unwrap();
    let registry = CloneOperationRegistry::default();
    let result = clone_repository(
        &registry,
        source,
        destination_parent.clone(),
        "project".into(),
        plan.operation_id.clone(),
        plan.state_token,
        |phase| {
            if phase == CloneProgressPhase::Publishing {
                fs::create_dir(&destination).unwrap();
                fs::write(destination.join("user-file.txt"), "do not touch\n").unwrap();
            }
        },
    );

    assert_eq!(
        result.unwrap_err().code,
        AppErrorCode::CloneDestinationExists
    );
    assert_eq!(
        fs::read_to_string(destination.join("user-file.txt")).unwrap(),
        "do not touch\n"
    );
    assert!(!Path::new(&destination_parent)
        .join(format!(".gitodile-clone-{}", plan.operation_id))
        .exists());
}

#[test]
fn stale_plan_and_existing_empty_destination_do_not_modify_user_content() {
    let (source, destination_parent) = clone_fixture("stale");
    let plan = plan_clone(source.clone(), destination_parent.clone(), "project".into()).unwrap();
    let registry = CloneOperationRegistry::default();
    let stale = clone_repository(
        &registry,
        source.clone(),
        destination_parent.clone(),
        "different".into(),
        plan.operation_id.clone(),
        plan.state_token,
        |_| {},
    );
    assert_eq!(stale.unwrap_err().code, AppErrorCode::StaleClonePlan);

    fs::create_dir(Path::new(&destination_parent).join("project")).unwrap();
    let existing = plan_clone(source, destination_parent, "project".into()).unwrap_err();
    assert_eq!(existing.code, AppErrorCode::CloneDestinationExists);
}

#[test]
fn file_url_clone_strips_suffixes_from_the_persisted_origin() {
    let (source, destination_parent) = clone_fixture("file-url");
    let normalized = source.replace('\\', "/");
    let safe_url = if normalized.starts_with('/') {
        format!("file://{normalized}")
    } else {
        format!("file:///{normalized}")
    };
    let submitted = format!("{safe_url}?token=must-not-persist#fragment");
    let nested = plan_clone(submitted.clone(), source.clone(), "nested-copy".into()).unwrap_err();
    assert_eq!(nested.code, AppErrorCode::InvalidCloneDestination);
    let plan = plan_clone(
        submitted.clone(),
        destination_parent.clone(),
        "file-copy".into(),
    )
    .unwrap();
    assert!(!plan.source_display.contains("token"));
    let result = clone_repository(
        &CloneOperationRegistry::default(),
        submitted,
        destination_parent,
        "file-copy".into(),
        plan.operation_id,
        plan.state_token,
        |_| {},
    )
    .unwrap();

    let _frame = application::enter_test_frame();
    let origin = run_git(&result.destination_path, &["remote", "get-url", "origin"]).unwrap();
    assert!(origin.status.success());
    let origin = git_stdout(&origin);
    assert_eq!(origin, safe_url);
    assert!(!origin.contains("token"));
    assert!(!origin.contains("fragment"));
}
