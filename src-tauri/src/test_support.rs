use crate::*;
use std::fs;
use std::path::Path;

pub(crate) fn unique_temp_dir(label: &str) -> String {
    let mut dir = std::env::temp_dir();
    dir.push(format!("gitodile-test-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("create temp dir for test");
    dir.to_string_lossy().to_string()
}

pub(crate) fn git_init(path: &str) {
    let status = git_command(path)
        .args(["init", "-q"])
        .status()
        .expect("run git init");
    assert!(status.success(), "git init should succeed");
}

pub(crate) fn git_commit_empty(path: &str) {
    let status = git_command(path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "-q",
            "-m",
            "init",
        ])
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit --allow-empty should succeed");
}

pub(crate) fn write_file(repo_path: &str, name: &str, contents: &str) {
    fs::write(Path::new(repo_path).join(name), contents).expect("write test file");
}

pub(crate) fn git_add(path: &str, file: &str) {
    let status = git_command(path)
        .args(["add", "--", file])
        .status()
        .expect("run git add");
    assert!(status.success(), "git add should succeed");
}

pub(crate) fn git_add_all(path: &str) {
    let status = git_command(path)
        .args(["add", "-A"])
        .status()
        .expect("run git add -A");
    assert!(status.success(), "git add -A should succeed");
}

pub(crate) fn git_commit(path: &str, message: &str) {
    let status = git_command(path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "-q",
            "-m",
            message,
        ])
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit should succeed");
}

pub(crate) fn current_branch(path: &str) -> String {
    let output = git_command(path)
        .args(["symbolic-ref", "--short", "HEAD"])
        .output()
        .expect("read current branch");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// A `GIT_CONFIG_GLOBAL` file with an identity set, so planner tests don't
/// depend on (or risk reading) the real machine's global Git identity.
pub(crate) fn write_test_identity_config(label: &str) -> String {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "gitodile-test-identity-{label}-{}.gitconfig",
        std::process::id()
    ));
    fs::write(
        &path,
        "[user]\n\tname = GitOdile Test\n\temail = test@gitodile.local\n",
    )
    .expect("write temp identity config");
    path.to_string_lossy().to_string()
}

/// A `GIT_CONFIG_GLOBAL` path that does not exist, so `git config --get`
/// finds no identity there and (with no local repo config set either)
/// reports none configured, deterministically.
pub(crate) fn empty_identity_override(label: &str) -> String {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "gitodile-test-no-identity-{label}-{}.gitconfig",
        std::process::id()
    ));
    let _ = fs::remove_file(&path);
    path.to_string_lossy().to_string()
}

/// A pre-commit hook that always rejects, written the same way on every
/// platform: Git for Windows executes shebang scripts through its bundled
/// `sh`, so no `.exe`/`.bat` wrapper or executable bit is needed there.
/// Unix needs the executable bit set explicitly.
pub(crate) fn write_failing_hook(git_dir: &Path, name: &str) {
    let hooks_dir = git_dir.join("hooks");
    fs::create_dir_all(&hooks_dir).expect("create hooks dir");
    let hook_path = hooks_dir.join(name);
    fs::write(
        &hook_path,
        "#!/bin/sh\necho 'rejected by test hook' 1>&2\nexit 1\n",
    )
    .expect("write failing hook");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&hook_path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&hook_path, perms).unwrap();
    }
}

/// A `gpg.program` replacement that always fails the way real GPG does,
/// so signing failures can be tested without a real GPG/SSH signing setup.
/// Written under the system temp directory rather than inside the test
/// repository, so the fixture script itself never shows up as an
/// untracked file in that repository's status.
#[cfg(target_os = "windows")]
pub(crate) fn write_fake_failing_gpg(label: &str) -> String {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "gitodile-fake-gpg-{label}-{}.bat",
        std::process::id()
    ));
    fs::write(
        &path,
        "@echo off\r\necho gpg failed to sign the data 1>&2\r\nexit /b 1\r\n",
    )
    .expect("write fake gpg script");
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn write_fake_failing_gpg(label: &str) -> String {
    use std::os::unix::fs::PermissionsExt;
    let mut path = std::env::temp_dir();
    path.push(format!(
        "gitodile-fake-gpg-{label}-{}.sh",
        std::process::id()
    ));
    fs::write(
        &path,
        "#!/bin/sh\necho 'gpg failed to sign the data' 1>&2\nexit 1\n",
    )
    .expect("write fake gpg script");
    let mut perms = fs::metadata(&path).unwrap().permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&path, perms).unwrap();
    path.to_string_lossy().to_string()
}

pub(crate) fn find_diff<'a>(diffs: &'a [FileDiff], path: &str) -> Option<&'a FileDiff> {
    diffs.iter().find(|diff| match diff {
        FileDiff::Text { path: p, .. }
        | FileDiff::Binary { path: p, .. }
        | FileDiff::Image { path: p, .. }
        | FileDiff::TooLarge { path: p, .. }
        | FileDiff::Unchanged { path: p, .. } => p == path,
        FileDiff::Conflict { path: p, .. } => p == path,
    })
}

pub(crate) fn init_bare_remote(path: &str) {
    let status = git_command(path)
        .args(["init", "--bare", "-q"])
        .status()
        .expect("run git init --bare");
    assert!(status.success(), "git init --bare should succeed");
}

pub(crate) fn wire_remote(repo_path: &str, remote_name: &str, remote_path: &str) {
    let status = git_command(repo_path)
        .args(["remote", "add", remote_name, remote_path])
        .status()
        .expect("run git remote add");
    assert!(status.success(), "git remote add should succeed");
}

pub(crate) fn remote_branch_sha(remote_path: &str, branch: &str) -> Option<String> {
    let output = git_command(remote_path)
        .args(["rev-parse", "--verify", branch])
        .output()
        .expect("run git rev-parse on the remote");
    output.status.success().then(|| git_stdout(&output))
}

/// Sets up a repository with one commit already published to a fresh bare
/// remote under `origin`, with upstream tracking configured — the common
/// starting point most publish tests build on.
pub(crate) fn published_repo_and_remote(label: &str) -> (String, String, String) {
    let repo = unique_temp_dir(&format!("publish-{label}"));
    git_init(&repo);
    write_file(&repo, "a.txt", "hello\n");
    git_add_all(&repo);
    git_commit(&repo, "first");
    let branch = current_branch(&repo);

    let remote = unique_temp_dir(&format!("publish-{label}-remote"));
    init_bare_remote(&remote);
    wire_remote(&repo, "origin", &remote);

    let plan = plan_publish(repo.clone(), None, None).expect("first plan should succeed");
    publish(
        repo.clone(),
        plan.target.remote,
        plan.state_token,
        None,
        true,
    )
    .expect("first publish should succeed");

    (repo, remote, branch)
}
