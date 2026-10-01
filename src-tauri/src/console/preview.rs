//! The pre-flight reads a change plan makes before it asks to go ahead: what
//! it will change, stated from the repository as it is, and the fingerprint
//! the run compares against so a moved repository refuses the plan.
//!
//! Everything here only reads. It runs inside the caller's command frame.

use super::{Intent, PlanFact, CONSOLE_ENV};
use crate::error::AppError;
use crate::git_command::run_git_bounded_with_env;
use std::hash::{Hash, Hasher};
use std::path::Path;

/// Files named in a fact; the total says how many more there are.
const LISTED_FILES: usize = 5;

struct Read {
    ok: bool,
    stdout: String,
}

fn read(path: &str, args: &[&str]) -> Result<Read, AppError> {
    let output = run_git_bounded_with_env(path, args, CONSOLE_ENV)?;
    Ok(Read {
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
    })
}

/// The state a change plan describes: where HEAD is and what it points at,
/// every ref (lines, tags, remote-tracking refs, the set-aside stack), and
/// the index and working tree as `status` reports them. A plan whose
/// repository no longer matches is stale.
pub(super) fn fingerprint(path: &str) -> Result<String, AppError> {
    let status = read(
        path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=normal",
        ],
    )?;
    let refs = read(path, &["for-each-ref", "--format=%(refname) %(objectname)"])?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    status.stdout.hash(&mut hasher);
    refs.stdout.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

/// Whether `checkout <name>` would switch to a line: an existing local line,
/// or a single remote line Git would create a local one from.
pub(super) fn names_a_line(path: &str, name: &str) -> Result<bool, AppError> {
    let local = format!("refs/heads/{name}");
    if read(path, &["show-ref", "--verify", "--quiet", &local])?.ok {
        return Ok(true);
    }
    let remote = format!("refs/remotes/*/{name}");
    let found = read(path, &["for-each-ref", "--format=%(refname)", &remote])?;
    Ok(found.stdout.lines().count() == 1)
}

fn current_line(path: &str) -> Result<Option<String>, AppError> {
    let head = read(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    Ok(head
        .ok
        .then(|| head.stdout.trim().to_string())
        .filter(|line| !line.is_empty()))
}

/// The upstream of the current line as (remote, line), when it has one.
fn upstream(path: &str) -> Result<Option<(String, String)>, AppError> {
    let upstream = read(
        path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )?;
    if !upstream.ok {
        return Ok(None);
    }
    Ok(upstream
        .stdout
        .trim()
        .split_once('/')
        .map(|(remote, line)| (remote.to_string(), line.to_string())))
}

fn count_nul_separated(text: &str) -> usize {
    text.split('\0').filter(|entry| !entry.is_empty()).count()
}

/// What the plan will change, read from the repository without changing it.
/// `arguments` is the plan's argument vector after `git`.
pub(super) fn facts(
    path: &str,
    intent: &Intent,
    arguments: &[String],
) -> Result<Vec<PlanFact>, AppError> {
    Ok(match intent {
        Intent::None | Intent::CheckoutName(_) => Vec::new(),
        Intent::Stage => {
            // The same arguments, as a dry run: exactly the files it would add.
            let mut dry_run = vec!["add", "--dry-run"];
            dry_run.extend(arguments.iter().skip(1).map(String::as_str));
            let listed = read(path, &dry_run)?;
            let files = listed
                .stdout
                .lines()
                .filter_map(|line| {
                    line.strip_prefix("add '")
                        .or_else(|| line.strip_prefix("remove '"))
                        .and_then(|rest| rest.strip_suffix('\''))
                })
                .map(str::to_string)
                .collect::<Vec<_>>();
            vec![PlanFact::Stages {
                total: files.len(),
                files: files.into_iter().take(LISTED_FILES).collect(),
            }]
        }
        Intent::Commit { all, paths } => {
            let files = if *paths {
                None
            } else {
                let staged = read(path, &["diff", "--cached", "--name-only", "-z"])?;
                let mut names = staged
                    .stdout
                    .split('\0')
                    .filter(|name| !name.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>();
                if *all {
                    let tracked = read(path, &["diff", "--name-only", "-z"])?;
                    names.extend(
                        tracked
                            .stdout
                            .split('\0')
                            .filter(|name| !name.is_empty())
                            .map(str::to_string),
                    );
                    names.sort();
                    names.dedup();
                }
                Some(names.len())
            };
            vec![PlanFact::Commits {
                line: current_line(path)?,
                files,
            }]
        }
        Intent::Switch { target, create } => vec![PlanFact::Switches {
            target: target.clone(),
            create: *create,
        }],
        Intent::CreateLine(name) => vec![PlanFact::CreatesLine { name: name.clone() }],
        Intent::CreateTag(name) => vec![PlanFact::CreatesTag { name: name.clone() }],
        Intent::SetAside => {
            let changed = read(
                path,
                &["status", "--porcelain=v1", "-z", "--untracked-files=no"],
            )?;
            vec![PlanFact::SetsAside {
                files: count_nul_separated(&changed.stdout),
            }]
        }
        Intent::ApplySetAside(stash) => vec![PlanFact::AppliesSetAside {
            stash: stash.clone().unwrap_or_else(|| "stash@{0}".to_string()),
        }],
        Intent::Revert(version) => vec![PlanFact::Reverts {
            version: version.clone(),
        }],
        Intent::CherryPick(version) => vec![PlanFact::CopiesVersion {
            version: version.clone(),
        }],
        Intent::Fetch(remote) => vec![PlanFact::Fetches {
            remote: match remote {
                Some(remote) => Some(remote.clone()),
                None => upstream(path)?.map(|(remote, _)| remote),
            },
        }],
        Intent::Pull(remote) => vec![PlanFact::Pulls {
            remote: match remote {
                Some(remote) => Some(remote.clone()),
                None => upstream(path)?.map(|(remote, _)| remote),
            },
        }],
        Intent::Push {
            remote,
            line,
            plain,
        } => {
            if *plain {
                match upstream(path)? {
                    Some((remote, line)) => {
                        let ahead = read(path, &["rev-list", "--count", "@{upstream}..HEAD"])?;
                        vec![PlanFact::Publishes {
                            remote: Some(remote),
                            line: Some(line),
                            versions: ahead.stdout.trim().parse().ok(),
                        }]
                    }
                    None => vec![PlanFact::Publishes {
                        remote: None,
                        line: current_line(path)?,
                        versions: None,
                    }],
                }
            } else {
                vec![PlanFact::Publishes {
                    remote: remote.clone(),
                    line: line.clone(),
                    versions: None,
                }]
            }
        }
        Intent::AskRemote(remote) => vec![PlanFact::AsksRemote {
            remote: remote.clone(),
        }],
    })
}

/// Whether a hook that could have stopped `subcommand` is installed, where
/// the project's configuration puts hooks.
pub(super) fn hook_installed(path: &str, subcommand: &str) -> bool {
    let names: &[&str] = match subcommand {
        "commit" => &["pre-commit", "prepare-commit-msg", "commit-msg"],
        "push" => &["pre-push"],
        _ => return false,
    };
    let Ok(hooks) = read(path, &["rev-parse", "--git-path", "hooks"]) else {
        return false;
    };
    let hooks = Path::new(path).join(hooks.stdout.trim());
    names.iter().any(|name| hooks.join(name).is_file())
}
