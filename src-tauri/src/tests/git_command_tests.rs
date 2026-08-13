use crate::*;

// Until task 039 this silently returned a repository-read policy, so a Git
// call that forgot its frame ran with read concurrency and never acquired a
// repository permit — bypassing the commonGitDir coordinator that keeps
// related worktrees from colliding. Both branches are pinned: debug panics
// where a programmer sees it, release reports a structured failure rather
// than crashing a user's session. The release half needs
// `cargo test --release` to run.
#[test]
#[cfg(debug_assertions)]
#[should_panic(expected = "outside a registered command")]
fn starting_git_without_a_command_frame_is_rejected() {
    let _ = require_policy();
}

#[test]
#[cfg(not(debug_assertions))]
fn starting_git_without_a_command_frame_is_rejected() {
    let error = require_policy().expect_err("a frameless Git call must not be allowed");
    assert_eq!(error.code, AppErrorCode::GitCommandFailed);
}

#[test]
fn a_command_frame_supplies_the_policy_its_git_calls_run_under() {
    let _frame = application::enter_test_frame();
    let policy = require_policy().expect("a frame must supply a policy");
    assert_eq!(policy.concurrency, git::ConcurrencyClass::RepositoryRead);
    assert!(policy.stdout_cap > 0 && !policy.timeout.is_zero());
}
