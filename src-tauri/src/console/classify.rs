//! Decides what a typed Git command would do, from its arguments alone.
//!
//! Only Git's built-in subcommands named here are accepted. On top of that
//! allowlist, a deny list removes the options that would run another program,
//! write a file, reach outside the project or need a terminal, whatever the
//! subcommand. Each subcommand then reads its arguments and returns one tier;
//! when a combination is not recognised the stricter tier wins. See ADR 0017.
//!
//! Nothing here starts a process: a refused line never reaches Git.

use super::{Intent, OutputShape, Refusal, RefusalReason, Tier};

/// What the plan will run once the tier allows it.
#[derive(Debug, PartialEq)]
pub(super) struct Classified {
    /// Everything after `git`: the subcommand, the flags the console adds,
    /// then the person's own arguments.
    pub(super) arguments: Vec<String>,
    pub(super) tier: Tier,
    pub(super) shape: OutputShape,
    /// What a change plan previews before it asks to go ahead.
    pub(super) intent: Intent,
}

#[derive(Clone, Copy)]
enum Danger {
    RunsProgram,
    WritesFile,
    LeavesProject,
}

impl Danger {
    fn refusal(self, option: &str) -> Refusal {
        let reason = match self {
            Self::RunsProgram => RefusalReason::RunsProgram,
            Self::WritesFile => RefusalReason::WritesFile,
            Self::LeavesProject => RefusalReason::LeavesProject,
        };
        Refusal::never(reason, option)
    }
}

/// Long options no console command may carry, whatever the subcommand. Git
/// accepts a unique abbreviation of a long option, so a prefix of any of these
/// is refused too, unless it is itself an exact option listed in
/// [`EXACT_PREFIXES`].
const DENIED_LONG: &[(&str, Danger)] = &[
    ("--ext-diff", Danger::RunsProgram),
    ("--textconv", Danger::RunsProgram),
    ("--filters", Danger::RunsProgram),
    ("--exec", Danger::RunsProgram),
    ("--upload-pack", Danger::RunsProgram),
    ("--receive-pack", Danger::RunsProgram),
    ("--open-files-in-pager", Danger::RunsProgram),
    // Verifying a signature runs the configured GPG program, and the project's
    // own configuration can choose that program.
    ("--show-signature", Danger::RunsProgram),
    ("--output", Danger::WritesFile),
    ("--output-directory", Danger::WritesFile),
    ("--no-index", Danger::LeavesProject),
    ("--contents", Danger::LeavesProject),
    ("--ignore-revs-file", Danger::LeavesProject),
    ("--exclude-from", Danger::LeavesProject),
    ("--resolve-git-dir", Danger::LeavesProject),
    // Reads the paths to act on from a file, which may lie anywhere.
    ("--pathspec-from-file", Danger::LeavesProject),
];

/// Real options that are also a prefix of a denied one. Git matches an exact
/// option before it considers abbreviations, so these mean themselves.
const EXACT_PREFIXES: &[&str] = &["--text", "--exclude", "--filter", "--ignore-rev"];

/// Global options may not precede the subcommand: `-C`, `--git-dir` or
/// `--work-tree` leave the project, `-c` and `--exec-path` choose programs,
/// and the rest change what the command means. `--no-pager` is accepted and
/// dropped, since the console never pages.
const HARMLESS_GLOBAL: &str = "--no-pager";

/// Git built-ins that the console knows and does not offer.
const NOT_AVAILABLE: &[&str] = &[
    "am",
    "annotate-stdin",
    "apply",
    "archive",
    "bugreport",
    "bundle",
    "check-attr",
    "check-ignore",
    "check-mailmap",
    "check-ref-format",
    "checkout-index",
    "cherry",
    "citool",
    "clone",
    "column",
    "commit-graph",
    "commit-tree",
    "config",
    "credential",
    "credential-cache",
    "credential-store",
    "daemon",
    "diagnose",
    "diff-files",
    "diff-index",
    "diff-tree",
    "difftool",
    "fast-export",
    "fast-import",
    "fetch-pack",
    "filter-branch",
    "fmt-merge-msg",
    "format-patch",
    "fsck",
    "fsmonitor--daemon",
    "gc",
    "get-tar-commit-id",
    "gui",
    "hash-object",
    "help",
    "hook",
    "http-backend",
    "http-fetch",
    "http-push",
    "imap-send",
    "index-pack",
    "init",
    "instaweb",
    "interpret-trailers",
    "maintenance",
    "merge-file",
    "merge-index",
    "merge-tree",
    "mergetool",
    "mktag",
    "mktree",
    "multi-pack-index",
    "notes",
    "pack-objects",
    "pack-redundant",
    "pack-refs",
    "patch-id",
    "prune",
    "prune-packed",
    "quiltimport",
    "range-diff",
    "read-tree",
    "receive-pack",
    "repack",
    "replace",
    "replay",
    "request-pull",
    "rerere",
    "rev-list",
    "scalar",
    "send-email",
    "send-pack",
    "shell",
    "show-branch",
    "show-index",
    "sparse-checkout",
    "stripspace",
    "submodule",
    "symbolic-ref",
    "unpack-file",
    "unpack-objects",
    "update-index",
    "update-ref",
    "update-server-info",
    "upload-archive",
    "upload-pack",
    "var",
    "verify-commit",
    "verify-pack",
    "verify-tag",
    "version-control",
    "web--browse",
    "worktree",
    "write-tree",
];

/// The Read subcommands, in the order `help git` lists them; `stash` reads
/// only through its two read actions. The renderer
/// keeps the same list for completion and help; a test holds them together.
#[cfg(test)]
pub(super) const READ_SUBCOMMANDS: &[&str] = &[
    "status",
    "log",
    "show",
    "diff",
    "blame",
    "grep",
    "branch",
    "tag",
    "reflog",
    "stash list",
    "stash show",
    "remote",
    "ls-files",
    "ls-tree",
    "cat-file",
    "rev-parse",
    "describe",
    "shortlog",
    "count-objects",
    "whatchanged",
    "name-rev",
    "merge-base",
    "for-each-ref",
    "show-ref",
    "version",
];

pub(super) fn classify(tokens: &[String]) -> Result<Classified, Refusal> {
    match tokens.first() {
        Some(first) if first == "git" => {}
        _ => return Err(Refusal::new(RefusalReason::NotGit, None)),
    }
    let mut index = 1;
    while let Some(option) = tokens.get(index).filter(|token| token.starts_with('-')) {
        if option == HARMLESS_GLOBAL {
            index += 1;
            continue;
        }
        // `git --version` is the one global option people type as a command.
        if option == "--version" && index + 1 == tokens.len() {
            return classify_subcommand("version", &[]);
        }
        return Err(Refusal::never(RefusalReason::GlobalOption, option));
    }
    let Some(subcommand) = tokens.get(index) else {
        return Err(Refusal::new(RefusalReason::MissingSubcommand, None));
    };
    classify_subcommand(subcommand, &tokens[index + 1..])
}

/// Flags every diff-producing read gets, so neither a configured external
/// diff, a text conversion nor a signature check can run a program.
const LOG_READ_FLAGS: &[&str] = &["--no-ext-diff", "--no-textconv", "--no-show-signature"];
const DIFF_READ_FLAGS: &[&str] = &["--no-ext-diff", "--no-textconv"];
/// Short options of the log and diff family that take an attached value, so
/// the letters after them are that value rather than more flags.
const DIFF_VALUE_SHORTS: &str = "lSGIUMCBXnLO";

fn classify_subcommand(subcommand: &str, rest: &[String]) -> Result<Classified, Refusal> {
    let args = Args::split(rest);
    for option in &args.options {
        check_denied(option)?;
    }
    let read = |shape| Plan::new(Tier::Read, shape);
    let plan = match subcommand {
        "status" => read(OutputShape::Status),
        "log" | "whatchanged" | "show" => {
            // `-O` reads the order of files from the file it names.
            args.deny_short('O', DIFF_VALUE_SHORTS, Danger::LeavesProject)?;
            let shape = if subcommand != "show" && args.has_long("--graph") {
                OutputShape::Graph
            } else {
                OutputShape::Commits
            };
            read(shape).with_flags(0, LOG_READ_FLAGS)
        }
        "diff" => {
            args.deny_short('O', DIFF_VALUE_SHORTS, Danger::LeavesProject)?;
            // `git diff a b` compares two files outside Git when either path
            // lies outside the project, the same as `--no-index`.
            if let Some(path) = args
                .positionals
                .iter()
                .chain(&args.paths)
                .find(|path| leaves_project(path))
            {
                return Err(Refusal::never(RefusalReason::LeavesProject, path));
            }
            read(OutputShape::Commits).with_flags(0, DIFF_READ_FLAGS)
        }
        "blame" | "annotate" => {
            // `-S` reads a list of revisions from a file.
            args.deny_short('S', "LCM", Danger::LeavesProject)?;
            read(OutputShape::Commits).with_flags(0, &["--no-textconv"])
        }
        "grep" => {
            args.deny_short('O', "ABCem", Danger::RunsProgram)?;
            args.deny_short('f', "ABCem", Danger::LeavesProject)?;
            read(OutputShape::Plain).with_flags(0, &["--no-textconv"])
        }
        "ls-files" => {
            args.deny_short('X', "x", Danger::LeavesProject)?;
            read(OutputShape::Plain)
        }
        "ls-tree" | "cat-file" | "rev-parse" | "describe" | "count-objects" | "name-rev"
        | "merge-base" | "for-each-ref" | "show-ref" | "version" => read(OutputShape::Plain),
        "shortlog" => {
            // Without a revision `shortlog` reads standard input, which the
            // console never provides, so the plan names HEAD.
            if args.positionals.is_empty() && args.paths.is_empty() {
                read(OutputShape::Authors).with_trailing("HEAD")
            } else {
                read(OutputShape::Authors)
            }
        }
        "branch" => classify_branch(&args, rest)?,
        "tag" => classify_tag(&args, rest)?,
        "remote" => classify_remote(&args)?,
        "stash" => classify_stash(rest)?,
        "reflog" => classify_reflog(rest)?,
        "add" => {
            args.deny_interactive("pie", "", &["--patch", "--interactive", "--edit"])?;
            Plan::new(Tier::LocalChange, OutputShape::Plain).with_intent(Intent::Stage)
        }
        // `-f` overwrites whatever is at the destination.
        "mv" => Plan::new(
            if args.has_short('f', "") || args.has_long("--force") {
                Tier::Destructive
            } else {
                Tier::LocalChange
            },
            OutputShape::Plain,
        ),
        "rm" => Plan::new(
            if args.has_short('f', "") || args.has_long("--force") {
                Tier::Destructive
            } else {
                Tier::LocalChange
            },
            OutputShape::Plain,
        ),
        "commit" => classify_commit(&args, rest)?,
        "switch" => {
            // `--orphan` empties the tracked files from the working tree and
            // `-m` merges local changes into the target, both past undoing.
            let tier = if args.has_short('f', "cC")
                || args.has_short('m', "cC")
                || ["--force", "--discard-changes", "--orphan", "--merge"]
                    .iter()
                    .any(|option| args.has_long(option))
            {
                Tier::Destructive
            } else if args.has_short('C', "c") || args.has_long("--force-create") {
                Tier::HistoryChange
            } else {
                Tier::LocalChange
            };
            let create = args.has_short('c', "C") || args.has_long("--create");
            let target = if create {
                option_value(rest, 'c', &["--create"])
            } else {
                operands(rest, "cC", &["--create", "--force-create", "--orphan"])
                    .first()
                    .map(|target| target.to_string())
            }
            .unwrap_or_default();
            Plan::new(tier, OutputShape::Plain).with_intent(Intent::Switch { target, create })
        }
        "checkout" => classify_checkout(&args, rest)?,
        "restore" => {
            args.deny_interactive("p", "s", &["--patch"])?;
            let staged_only = (args.has_short('S', "s") || args.has_long("--staged"))
                && !(args.has_short('W', "s") || args.has_long("--worktree"));
            Plan::new(
                if staged_only {
                    Tier::LocalChange
                } else {
                    Tier::Destructive
                },
                OutputShape::Plain,
            )
        }
        "reset" => {
            args.deny_interactive("p", "", &["--patch"])?;
            let tier = if ["--hard", "--merge", "--keep"]
                .iter()
                .any(|mode| args.has_long(mode))
            {
                Tier::Destructive
            } else if args.has_long("--soft") || !args.positionals.is_empty() {
                // A bare name may be a commit, which moves the line.
                Tier::HistoryChange
            } else {
                Tier::LocalChange
            };
            Plan::new(tier, OutputShape::Plain)
        }
        "revert" | "cherry-pick" => {
            args.deny_interactive("e", "mSX", &["--edit"])?;
            let sequencing = ["--continue", "--skip", "--quit"]
                .iter()
                .any(|option| args.has_long(option));
            if args.has_long("--abort") {
                Plan::new(Tier::Destructive, OutputShape::Plain)
            } else if sequencing {
                Plan::new(Tier::LocalChange, OutputShape::Plain)
            } else {
                let version = operands(
                    rest,
                    "mX",
                    &["--mainline", "--strategy", "--strategy-option"],
                )
                .first()
                .map(|version| version.to_string())
                .unwrap_or_default();
                if subcommand == "revert" {
                    // A revert opens an editor for its message; the plan
                    // keeps Git's own message instead, and shows that it does.
                    Plan::new(Tier::LocalChange, OutputShape::Plain)
                        .with_flags(0, &["--no-edit"])
                        .with_intent(Intent::Revert(version))
                } else {
                    Plan::new(Tier::LocalChange, OutputShape::Plain)
                        .with_intent(Intent::CherryPick(version))
                }
            }
        }
        "merge" => {
            args.deny_interactive("e", "mFsSX", &["--edit"])?;
            Plan::new(
                if args.has_long("--abort") {
                    Tier::Destructive
                } else {
                    Tier::HistoryChange
                },
                OutputShape::Plain,
            )
        }
        "rebase" => {
            args.deny_short('x', "sXCS", Danger::RunsProgram)?;
            args.deny_interactive("i", "sXCS", &["--interactive", "--edit-todo"])?;
            Plan::new(
                if args.has_long("--abort") {
                    Tier::Destructive
                } else {
                    Tier::HistoryChange
                },
                OutputShape::Plain,
            )
        }
        "clean" => {
            args.deny_interactive("i", "e", &["--interactive"])?;
            Plan::new(Tier::Destructive, OutputShape::Plain)
        }
        "bisect" => match args.positionals.first().map(|action| action.as_str()) {
            Some("run") => return Err(Refusal::never(RefusalReason::RunsProgram, "bisect run")),
            // A bisection leaves the project on a detached commit across
            // several commands; it stays with a terminal for now.
            _ => return Err(Refusal::never(RefusalReason::NotAvailable, "bisect")),
        },
        "fetch" | "pull" | "push" | "ls-remote" => classify_transfer(subcommand, &args, rest)?,
        known if NOT_AVAILABLE.contains(&known) => {
            return Err(Refusal::never(RefusalReason::NotAvailable, known))
        }
        unknown => return Err(Refusal::never(RefusalReason::UnknownSubcommand, unknown)),
    };
    Ok(plan.into_classified(subcommand, rest))
}

struct Plan {
    tier: Tier,
    shape: OutputShape,
    /// How many of the person's arguments come before the added flags: one
    /// for `stash show`, whose flags follow its action.
    flags_after: usize,
    flags: &'static [&'static str],
    trailing: Option<&'static str>,
    intent: Intent,
}

impl Plan {
    fn new(tier: Tier, shape: OutputShape) -> Self {
        Self {
            tier,
            shape,
            flags_after: 0,
            flags: &[],
            trailing: None,
            intent: Intent::None,
        }
    }

    fn with_intent(mut self, intent: Intent) -> Self {
        self.intent = intent;
        self
    }

    fn with_flags(mut self, after: usize, flags: &'static [&'static str]) -> Self {
        self.flags_after = after;
        self.flags = flags;
        self
    }

    fn with_trailing(mut self, argument: &'static str) -> Self {
        self.trailing = Some(argument);
        self
    }

    fn into_classified(self, subcommand: &str, rest: &[String]) -> Classified {
        let (before, after) = rest.split_at(self.flags_after.min(rest.len()));
        let mut arguments = Vec::with_capacity(rest.len() + self.flags.len() + 2);
        arguments.push(subcommand.to_string());
        arguments.extend(before.iter().cloned());
        arguments.extend(self.flags.iter().map(|flag| flag.to_string()));
        arguments.extend(after.iter().cloned());
        arguments.extend(self.trailing.map(str::to_string));
        Classified {
            arguments,
            tier: self.tier,
            shape: self.shape,
            intent: self.intent,
        }
    }
}

/// The operands of a command, in order: its arguments that are neither
/// options nor the separate value of an option. `short` and `long` name the
/// options whose value may follow as the next argument.
fn operands<'a>(rest: &'a [String], short: &str, long: &[&str]) -> Vec<&'a String> {
    let mut operands = Vec::new();
    let mut index = 0;
    while let Some(token) = rest.get(index) {
        index += 1;
        if token == "--" {
            operands.extend(&rest[index..]);
            break;
        }
        if token.starts_with("--") {
            if !token.contains('=') && long.contains(&token.as_str()) {
                index += 1;
            }
        } else if token.len() > 1 && token.starts_with('-') {
            // A value-taking letter swallows the rest of the bundle, or the
            // next argument when it ends the bundle.
            let letters = token[1..].char_indices();
            for (at, letter) in letters {
                if short.contains(letter) {
                    if at + letter.len_utf8() == token.len() - 1 {
                        index += 1;
                    }
                    break;
                }
            }
        } else {
            operands.push(token);
        }
    }
    operands
}

/// The value of an option, attached (`-cname`, `--create=name`) or given as
/// the next argument (`-c name`, `--create name`).
fn option_value(rest: &[String], short: char, long: &[&str]) -> Option<String> {
    let mut tokens = rest.iter().take_while(|token| token.as_str() != "--");
    while let Some(token) = tokens.next() {
        if let Some(name) = token.strip_prefix("--") {
            let (name, attached) = match name.split_once('=') {
                Some((name, value)) => (name, Some(value)),
                None => (name, None),
            };
            if long
                .iter()
                .any(|option| option.strip_prefix("--") == Some(name))
            {
                return attached
                    .map(str::to_string)
                    .or_else(|| tokens.next().cloned());
            }
        } else if let Some(bundle) = token.strip_prefix('-') {
            if let Some(at) = bundle.find(short) {
                let value = &bundle[at + short.len_utf8()..];
                return if value.is_empty() {
                    tokens.next().cloned()
                } else {
                    Some(value.to_string())
                };
            }
        }
    }
    None
}

fn classify_checkout(args: &Args, rest: &[String]) -> Result<Plan, Refusal> {
    args.deny_interactive("p", "bB", &["--patch"])?;
    if args.has_short('B', "b") {
        return Ok(Plan::new(Tier::HistoryChange, OutputShape::Plain));
    }
    let discards = args.has_short('f', "bB")
        || ["--force", "--ours", "--theirs", "--merge", "--overlay"]
            .iter()
            .any(|option| args.has_long(option))
        || args.has_short('m', "bB")
        || !args.paths.is_empty();
    if discards {
        return Ok(Plan::new(Tier::Destructive, OutputShape::Plain));
    }
    let named = operands(rest, "", &[]);
    let create = args.has_short('b', "") || args.has_long("--orphan");
    if create {
        let target = option_value(rest, 'b', &["--orphan"]).unwrap_or_default();
        return Ok(
            Plan::new(Tier::LocalChange, OutputShape::Plain).with_intent(Intent::Switch {
                target,
                create: true,
            }),
        );
    }
    Ok(match named.as_slice() {
        [target] if args.has_long("--detach") => Plan::new(Tier::LocalChange, OutputShape::Plain)
            .with_intent(Intent::Switch {
                target: target.to_string(),
                create: false,
            }),
        // `checkout name` switches line when the name is a line, and
        // restores a file when it is a path: the plan looks it up and stays
        // Destructive until it does.
        [name] => Plan::new(Tier::Destructive, OutputShape::Plain)
            .with_intent(Intent::CheckoutName(name.to_string())),
        _ => Plan::new(Tier::Destructive, OutputShape::Plain),
    })
}

/// The arguments after the subcommand, sorted the way Git's option parser
/// would see them. A value given as a separate argument lands in
/// `positionals`; where that matters, the subcommand accounts for it.
struct Args<'a> {
    options: Vec<&'a String>,
    positionals: Vec<&'a String>,
    /// Everything after `--`: paths, never options.
    paths: Vec<&'a String>,
}

impl<'a> Args<'a> {
    fn split(rest: &'a [String]) -> Self {
        let mut args = Self {
            options: Vec::new(),
            positionals: Vec::new(),
            paths: Vec::new(),
        };
        let mut after_separator = false;
        for token in rest {
            if after_separator {
                args.paths.push(token);
            } else if token == "--" {
                after_separator = true;
            } else if token.len() > 1 && token.starts_with('-') {
                args.options.push(token);
            } else {
                args.positionals.push(token);
            }
        }
        args
    }

    fn has_long(&self, name: &str) -> bool {
        self.options.iter().any(|option| {
            option.as_str() == name || option.split_once('=').is_some_and(|(key, _)| key == name)
        })
    }

    /// Whether a single-dash option carries `letter`, reading a bundle such
    /// as `-fd` up to the first letter in `takes_value`, whose remainder is
    /// that option's value rather than more flags.
    fn has_short(&self, letter: char, takes_value: &str) -> bool {
        self.options
            .iter()
            .filter(|option| !option.starts_with("--"))
            .any(|option| {
                for flag in option.chars().skip(1) {
                    if flag == letter {
                        return true;
                    }
                    if takes_value.contains(flag) {
                        return false;
                    }
                }
                false
            })
    }

    fn deny_short(&self, letter: char, takes_value: &str, danger: Danger) -> Result<(), Refusal> {
        if self.has_short(letter, takes_value) {
            return Err(danger.refusal(&format!("-{letter}")));
        }
        Ok(())
    }

    /// Options that open an editor or ask what a terminal would answer.
    fn deny_interactive(
        &self,
        short: &str,
        takes_value: &str,
        long: &[&str],
    ) -> Result<(), Refusal> {
        if let Some(letter) = short
            .chars()
            .find(|letter| self.has_short(*letter, takes_value))
        {
            return Err(Refusal::never(
                RefusalReason::NeedsTerminal,
                &format!("-{letter}"),
            ));
        }
        if let Some(option) = long.iter().find(|option| self.has_long(option)) {
            return Err(Refusal::never(RefusalReason::NeedsTerminal, option));
        }
        Ok(())
    }
}

fn check_denied(option: &str) -> Result<(), Refusal> {
    if !option.starts_with("--") {
        return Ok(());
    }
    let name = option.split_once('=').map_or(option, |(name, _)| name);
    if EXACT_PREFIXES.contains(&name) {
        return Ok(());
    }
    // A name that starts a denied option could be Git's abbreviation of it.
    match DENIED_LONG
        .iter()
        .find(|(denied, _)| denied.starts_with(name))
    {
        Some((_, danger)) => Err(danger.refusal(name)),
        None => Ok(()),
    }
}

/// A path typed as absolute, or climbing out with `..`, names something
/// outside the project the console is bound to.
fn leaves_project(path: &str) -> bool {
    let bytes = path.as_bytes();
    let absolute = path.starts_with('/')
        || path.starts_with('\\')
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':');
    absolute || path.split(['/', '\\']).any(|part| part == "..")
}

/// A message file (`-F`, `--file`) outside the project would copy that file
/// into the project's history.
fn deny_outside_message_file(rest: &[String]) -> Result<(), Refusal> {
    match option_value(rest, 'F', &["--file"]) {
        Some(file) if leaves_project(&file) => {
            Err(Refusal::never(RefusalReason::LeavesProject, &file))
        }
        _ => Ok(()),
    }
}

fn classify_commit(args: &Args, rest: &[String]) -> Result<Plan, Refusal> {
    const VALUES: &str = "mFCctS";
    deny_outside_message_file(rest)?;
    args.deny_interactive("pe", VALUES, &["--patch", "--interactive", "--edit"])?;
    // `-c` reopens a message in the editor; `-C` reuses it as it is.
    if args.has_short('c', VALUES) || args.has_long("--reedit-message") {
        return Err(Refusal::never(RefusalReason::NeedsTerminal, "-c"));
    }
    let has_message = ['m', 'F', 'C']
        .iter()
        .any(|letter| args.has_short(*letter, VALUES))
        || [
            "--message",
            "--file",
            "--reuse-message",
            "--fixup",
            "--no-edit",
        ]
        .iter()
        .any(|option| args.has_long(option));
    if !has_message {
        // Without a message Git opens an editor; `-m "…"` is the way here.
        return Err(Refusal::never(RefusalReason::NeedsTerminal, "commit"));
    }
    let paths = !operands(
        rest,
        "mFCct",
        &[
            "--message",
            "--file",
            "--reuse-message",
            "--reedit-message",
            "--fixup",
            "--squash",
            "--author",
            "--date",
            "--template",
            "--trailer",
            "--cleanup",
        ],
    )
    .is_empty();
    let all = args.has_short('a', VALUES) || args.has_long("--all");
    Ok(Plan::new(
        if args.has_long("--amend") {
            Tier::HistoryChange
        } else {
            Tier::LocalChange
        },
        OutputShape::Plain,
    )
    .with_intent(Intent::Commit { all, paths }))
}

/// Filters that make `branch` or `tag` list rather than create.
const LIST_FILTERS: &[&str] = &[
    "--merged",
    "--no-merged",
    "--contains",
    "--no-contains",
    "--points-at",
];
/// Listing options whose value may follow as the next argument: always for
/// the first two, and for the filters only when it does not look like an
/// option, since their value is optional.
const REQUIRED_VALUES: &[&str] = &["--sort", "--format"];
const BRANCH_READ_LONG: &[&str] = &[
    "--list",
    "--all",
    "--remotes",
    "--verbose",
    "--quiet",
    "--abbrev",
    "--no-abbrev",
    "--color",
    "--no-color",
    "--column",
    "--no-column",
    "--sort",
    "--merged",
    "--no-merged",
    "--contains",
    "--no-contains",
    "--points-at",
    "--format",
    "--ignore-case",
    "--omit-empty",
    "--show-current",
];
const TAG_READ_LONG: &[&str] = &[
    "--list",
    "--sort",
    "--format",
    "--contains",
    "--no-contains",
    "--merged",
    "--no-merged",
    "--points-at",
    "--column",
    "--no-column",
    "--color",
    "--no-color",
    "--ignore-case",
    "--omit-empty",
];

/// The listing form of `branch` or `tag`: `Some(true)` when every option is
/// a read option and the command lists, `Some(false)` when read options only
/// accompany a name to create, and `None` when some option is not a listing
/// option, so the caller looks for what it changes instead.
fn lists(
    rest: &[String],
    read_long: &[&str],
    read_short: &str,
    listing_short: &str,
) -> Option<bool> {
    let mut listing = false;
    let mut positionals = 0;
    let mut index = 0;
    while let Some(token) = rest.get(index) {
        index += 1;
        if token == "--" {
            positionals += rest.len() - index;
            break;
        }
        if token.starts_with("--") {
            let (name, attached) = match token.split_once('=') {
                Some((name, _)) => (name, true),
                None => (token.as_str(), false),
            };
            if !read_long.contains(&name) {
                return None;
            }
            listing |= name == "--list" || name == "--verbose" || LIST_FILTERS.contains(&name);
            let takes_next = REQUIRED_VALUES.contains(&name)
                || (LIST_FILTERS.contains(&name)
                    && rest.get(index).is_some_and(|next| !next.starts_with('-')));
            if !attached && takes_next {
                index += 1;
            }
        } else if token.len() > 1 && token.starts_with('-') {
            // `tag -n5` attaches a count to its flag.
            let flags = token[1..].trim_end_matches(|ch: char| ch.is_ascii_digit());
            if flags.is_empty() || !flags.chars().all(|flag| read_short.contains(flag)) {
                return None;
            }
            listing |= flags.chars().any(|flag| listing_short.contains(flag));
        } else {
            positionals += 1;
        }
    }
    Some(listing || positionals == 0)
}

fn classify_branch(args: &Args, rest: &[String]) -> Result<Plan, Refusal> {
    args.deny_interactive("", "", &["--edit-description"])?;
    let create = |rest: &[String]| {
        let name = operands(rest, "", &["--sort", "--format"])
            .first()
            .map(|name| name.to_string())
            .unwrap_or_default();
        Plan::new(Tier::LocalChange, OutputShape::Plain).with_intent(Intent::CreateLine(name))
    };
    match lists(rest, BRANCH_READ_LONG, "larvqi", "lv") {
        Some(true) => return Ok(Plan::new(Tier::Read, OutputShape::Branches)),
        Some(false) => return Ok(create(rest)),
        None => {}
    }
    let tier = if args.has_short('d', "u") || args.has_short('D', "u") || args.has_long("--delete")
    {
        Tier::Destructive
    } else if ['m', 'M', 'c', 'C', 'f']
        .iter()
        .any(|flag| args.has_short(*flag, "u"))
        || ["--move", "--copy", "--force"]
            .iter()
            .any(|option| args.has_long(option))
    {
        Tier::HistoryChange
    } else if ["--set-upstream-to", "--unset-upstream"]
        .iter()
        .any(|option| args.has_long(option))
        || args.has_short('u', "")
    {
        Tier::LocalChange
    } else if [
        "--track",
        "--no-track",
        "--create-reflog",
        "--recurse-submodules",
    ]
    .iter()
    .any(|option| args.has_long(option))
        || args.has_short('t', "u")
    {
        return Ok(create(rest));
    } else {
        // An option this classifier does not know: assume the worst.
        Tier::Destructive
    };
    Ok(Plan::new(tier, OutputShape::Plain))
}

fn classify_tag(args: &Args, rest: &[String]) -> Result<Plan, Refusal> {
    const VALUES: &str = "mFu";
    deny_outside_message_file(rest)?;
    if args.has_short('v', VALUES) || args.has_long("--verify") {
        return Err(Refusal::never(RefusalReason::RunsProgram, "--verify"));
    }
    args.deny_interactive("e", VALUES, &["--edit"])?;
    let create = |rest: &[String]| {
        let name = operands(
            rest,
            "mFu",
            &["--message", "--file", "--local-user", "--sort", "--format"],
        )
        .first()
        .map(|name| name.to_string())
        .unwrap_or_default();
        Plan::new(Tier::LocalChange, OutputShape::Plain).with_intent(Intent::CreateTag(name))
    };
    match lists(rest, TAG_READ_LONG, "lin", "ln") {
        Some(true) => return Ok(Plan::new(Tier::Read, OutputShape::Plain)),
        Some(false) => return Ok(create(rest)),
        None => {}
    }
    let tier = if args.has_short('d', VALUES) || args.has_long("--delete") {
        Tier::Destructive
    } else if args.has_short('f', VALUES) || args.has_long("--force") {
        Tier::HistoryChange
    } else {
        let annotated = ['a', 's', 'u']
            .iter()
            .any(|flag| args.has_short(*flag, VALUES))
            || ["--annotate", "--sign", "--local-user"]
                .iter()
                .any(|option| args.has_long(option));
        let has_message = ['m', 'F'].iter().any(|flag| args.has_short(*flag, VALUES))
            || ["--message", "--file"]
                .iter()
                .any(|option| args.has_long(option));
        if annotated && !has_message {
            // An annotated tag without a message opens an editor.
            return Err(Refusal::never(RefusalReason::NeedsTerminal, "-a"));
        }
        return Ok(create(rest));
    };
    Ok(Plan::new(tier, OutputShape::Plain))
}

fn classify_remote(args: &Args) -> Result<Plan, Refusal> {
    let Some(action) = args.positionals.first().map(|action| action.as_str()) else {
        let listing = args
            .options
            .iter()
            .all(|option| matches!(option.as_str(), "-v" | "--verbose"));
        return Ok(if listing {
            Plan::new(Tier::Read, OutputShape::Remotes)
        } else {
            Plan::new(Tier::LocalChange, OutputShape::Plain)
        });
    };
    Ok(match action {
        "get-url" => Plan::new(Tier::Read, OutputShape::Plain),
        // `show` asks the remote for its branches unless told not to.
        "show" => Plan::new(Tier::Remote, OutputShape::Plain).with_intent(Intent::AskRemote(
            args.positionals.get(1).map(|remote| remote.to_string()),
        )),
        "prune" | "update" => Plan::new(Tier::Remote, OutputShape::Plain),
        "add" | "rename" | "set-url" | "set-head" | "set-branches" => {
            Plan::new(Tier::LocalChange, OutputShape::Plain)
        }
        "remove" | "rm" => Plan::new(Tier::Destructive, OutputShape::Plain),
        other => {
            return Err(Refusal::never(
                RefusalReason::UnknownSubcommand,
                &format!("remote {other}"),
            ))
        }
    })
}

fn classify_stash(rest: &[String]) -> Result<Plan, Refusal> {
    let action = rest
        .first()
        .map(String::as_str)
        .filter(|first| !first.starts_with('-'));
    let args = Args::split(if action.is_some() { &rest[1..] } else { rest });
    Ok(match action {
        // `stash list` takes log options, `stash show` diff options.
        Some("list") => {
            Plan::new(Tier::Read, OutputShape::Stashes).with_flags(1, &["--no-show-signature"])
        }
        Some("show") => {
            args.deny_short('O', DIFF_VALUE_SHORTS, Danger::LeavesProject)?;
            Plan::new(Tier::Read, OutputShape::Commits).with_flags(1, DIFF_READ_FLAGS)
        }
        None | Some("push") | Some("save") => {
            args.deny_interactive("p", "m", &["--patch"])?;
            Plan::new(Tier::LocalChange, OutputShape::Plain).with_intent(Intent::SetAside)
        }
        Some("apply") => Plan::new(Tier::LocalChange, OutputShape::Plain).with_intent(
            Intent::ApplySetAside(args.positionals.first().map(|stash| stash.to_string())),
        ),
        // Both drop the entry once applied, so they wait for recovery points.
        Some("pop") | Some("branch") | Some("drop") | Some("clear") => {
            Plan::new(Tier::Destructive, OutputShape::Plain)
        }
        Some(other @ ("create" | "store")) => {
            return Err(Refusal::never(
                RefusalReason::NotAvailable,
                &format!("stash {other}"),
            ))
        }
        Some(other) => {
            return Err(Refusal::never(
                RefusalReason::UnknownSubcommand,
                &format!("stash {other}"),
            ))
        }
    })
}

fn classify_reflog(rest: &[String]) -> Result<Plan, Refusal> {
    let plan = Plan::new(Tier::Read, OutputShape::Commits);
    Ok(match rest.first().map(String::as_str) {
        Some("show") => plan.with_flags(1, &["--no-show-signature"]),
        Some("list" | "exists") => plan,
        Some(action @ ("expire" | "delete" | "drop")) => {
            return Err(Refusal::never(
                RefusalReason::NotAvailable,
                &format!("reflog {action}"),
            ))
        }
        // Nothing, an option or a ref name: each means `show`.
        _ => plan.with_flags(0, &["--no-show-signature"]),
    })
}

fn classify_transfer(subcommand: &str, args: &Args, rest: &[String]) -> Result<Plan, Refusal> {
    // A transport that is itself a command line.
    if let Some(url) = args
        .positionals
        .iter()
        .find(|url| url.starts_with("ext::") || url.starts_with("fd::"))
    {
        return Err(Refusal::never(RefusalReason::RunsProgram, url));
    }
    if subcommand == "pull"
        && args
            .options
            .iter()
            .any(|option| matches!(option.as_str(), "--rebase=interactive" | "--rebase=i"))
    {
        return Err(Refusal::never(
            RefusalReason::NeedsTerminal,
            "--rebase=interactive",
        ));
    }
    let forced = subcommand == "push"
        && (args.has_short('f', "o")
            || args.has_short('d', "o")
            || [
                "--force",
                "--force-with-lease",
                "--force-if-includes",
                "--delete",
                "--mirror",
                "--prune",
            ]
            .iter()
            .any(|option| args.has_long(option))
            // After the remote, `+ref` forces and `:ref` deletes.
            || args
                .positionals
                .iter()
                .skip(1)
                .any(|refspec| refspec.starts_with('+') || refspec.starts_with(':')));
    if forced {
        return Ok(Plan::new(Tier::Destructive, OutputShape::Plain));
    }
    // A fetch refspec with a destination (`main:main`), or a refmap, writes
    // local refs directly: history, or past undoing when forced.
    if matches!(subcommand, "fetch" | "pull") {
        let refspecs = args
            .positionals
            .iter()
            .skip(1)
            .filter(|refspec| refspec.contains(':'));
        let mut writes_refs = args.has_long("--refmap");
        let mut forces = args.has_long("--force") || args.has_short('f', "ojt");
        for refspec in refspecs {
            writes_refs = true;
            forces |= refspec.starts_with('+');
        }
        if writes_refs {
            return Ok(Plan::new(
                if forces {
                    Tier::Destructive
                } else {
                    Tier::HistoryChange
                },
                OutputShape::Plain,
            ));
        }
    }
    let named = operands(
        rest,
        "ojt",
        &[
            "--push-option",
            "--repo",
            "--depth",
            "--deepen",
            "--shallow-since",
            "--shallow-exclude",
            "--refmap",
            "--jobs",
            "--negotiation-tip",
            "--server-option",
            "--sort",
        ],
    );
    let remote = named.first().map(|remote| remote.to_string());
    Ok(match subcommand {
        "fetch" => Plan::new(Tier::Remote, OutputShape::Plain).with_intent(Intent::Fetch(remote)),
        "pull" => {
            // Pulling integrates what it fetched. Only a fast-forward keeps
            // saved history as it is, so the plan asks for exactly that; a
            // rebase or a merge commit changes history and waits for task 139.
            let rewrites = args.has_short('r', "ojt")
                || ["--rebase", "--no-ff", "--ff", "--squash"]
                    .iter()
                    .any(|option| args.has_long(option));
            if rewrites {
                Plan::new(Tier::HistoryChange, OutputShape::Plain)
            } else {
                Plan::new(Tier::Remote, OutputShape::Plain)
                    .with_flags(0, &["--no-rebase", "--ff-only"])
                    .with_intent(Intent::Pull(remote))
            }
        }
        "push" => Plan::new(Tier::Remote, OutputShape::Plain).with_intent(Intent::Push {
            remote,
            line: named.get(1).map(|line| line.to_string()),
            plain: named.is_empty(),
        }),
        _ => Plan::new(Tier::Remote, OutputShape::Plain).with_intent(Intent::AskRemote(remote)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(line: &str) -> Vec<String> {
        // Enough of the console grammar for fixtures: plain words and
        // single-quoted groups.
        let mut words = Vec::new();
        let mut current = String::new();
        let mut quoted = false;
        let mut started = false;
        for ch in line.chars() {
            match ch {
                '\'' => {
                    quoted = !quoted;
                    started = true;
                }
                ' ' if !quoted => {
                    if started {
                        words.push(std::mem::take(&mut current));
                        started = false;
                    }
                }
                other => {
                    current.push(other);
                    started = true;
                }
            }
        }
        if started {
            words.push(current);
        }
        words
    }

    fn classified(line: &str) -> Classified {
        classify(&tokens(line)).unwrap_or_else(|refusal| panic!("{line}: {refusal:?}"))
    }

    fn tier(line: &str) -> Tier {
        classified(line).tier
    }

    fn refusal(line: &str) -> Refusal {
        match classify(&tokens(line)) {
            Ok(classified) => panic!("{line} was accepted as {classified:?}"),
            Err(refusal) => refusal,
        }
    }

    fn assert_refused(line: &str, reason: RefusalReason, subject: &str) {
        let refusal = refusal(line);
        assert_eq!(refusal.reason, reason, "{line}");
        assert_eq!(refusal.subject.as_deref(), Some(subject), "{line}");
    }

    #[test]
    fn changes_that_reach_past_their_tier_take_the_stricter_one() {
        for option in ["--pathspec-from-file=/tmp/paths", "--pathspec-from-file"] {
            for subcommand in [
                "add",
                "rm",
                "restore --staged",
                "reset",
                "stash push",
                "checkout",
            ] {
                assert_refused(
                    &format!("git {subcommand} {option}"),
                    RefusalReason::LeavesProject,
                    "--pathspec-from-file",
                );
            }
        }
        for (line, file) in [
            ("git commit -F /etc/passwd", "/etc/passwd"),
            ("git commit --file=../notes.txt", "../notes.txt"),
            (r"git tag -a v1 -F C:\secret.txt", r"C:\secret.txt"),
        ] {
            assert_refused(line, RefusalReason::LeavesProject, file);
        }
        assert_eq!(tier("git commit -F message.txt"), Tier::LocalChange);
        for line in [
            "git switch --orphan fresh",
            "git switch -m other",
            "git switch --merge other",
            "git mv -f a b",
            "git mv --force a b",
            "git fetch origin +main:main",
            "git fetch --force origin main:main",
            "git pull origin +main:main",
        ] {
            assert_eq!(tier(line), Tier::Destructive, "{line}");
        }
        for line in [
            "git fetch origin main:main",
            "git fetch . main:other",
            "git fetch --refmap=refs/heads/*:refs/remotes/o/* origin",
        ] {
            assert_eq!(tier(line), Tier::HistoryChange, "{line}");
        }
        assert_eq!(tier("git fetch origin main"), Tier::Remote);
        assert_eq!(tier("git mv a b"), Tier::LocalChange);
    }

    #[test]
    fn change_plans_carry_what_they_preview() {
        let switch = |target: &str, create| Intent::Switch {
            target: target.into(),
            create,
        };
        for (line, intent) in [
            ("git add .", Intent::Stage),
            (
                "git commit -am 'x'",
                Intent::Commit {
                    all: true,
                    paths: false,
                },
            ),
            (
                "git commit -m x -- a.txt",
                Intent::Commit {
                    all: false,
                    paths: true,
                },
            ),
            (
                "git commit -m x a.txt",
                Intent::Commit {
                    all: false,
                    paths: true,
                },
            ),
            (
                "git commit --message x",
                Intent::Commit {
                    all: false,
                    paths: false,
                },
            ),
            ("git switch -c try", switch("try", true)),
            ("git switch -ctry", switch("try", true)),
            ("git switch main", switch("main", false)),
            ("git checkout -b try main", switch("try", true)),
            ("git checkout --detach HEAD~1", switch("HEAD~1", false)),
            ("git checkout main", Intent::CheckoutName("main".into())),
            ("git branch try main", Intent::CreateLine("try".into())),
            (
                "git branch --track try origin/try",
                Intent::CreateLine("try".into()),
            ),
            ("git tag -a v1 -m 'release'", Intent::CreateTag("v1".into())),
            ("git tag -m 'release' v2", Intent::CreateTag("v2".into())),
            ("git stash push -m wip", Intent::SetAside),
            ("git stash", Intent::SetAside),
            (
                "git stash apply stash@{1}",
                Intent::ApplySetAside(Some("stash@{1}".into())),
            ),
            ("git stash apply", Intent::ApplySetAside(None)),
            ("git revert HEAD", Intent::Revert("HEAD".into())),
            (
                "git cherry-pick -x abc1234",
                Intent::CherryPick("abc1234".into()),
            ),
            ("git fetch", Intent::Fetch(None)),
            (
                "git fetch --depth 1 upstream",
                Intent::Fetch(Some("upstream".into())),
            ),
            ("git pull origin main", Intent::Pull(Some("origin".into()))),
            (
                "git push -u origin main",
                Intent::Push {
                    remote: Some("origin".into()),
                    line: Some("main".into()),
                    plain: false,
                },
            ),
            (
                "git push -o ci.skip origin",
                Intent::Push {
                    remote: Some("origin".into()),
                    line: None,
                    plain: false,
                },
            ),
            (
                "git push",
                Intent::Push {
                    remote: None,
                    line: None,
                    plain: true,
                },
            ),
            (
                "git remote show origin",
                Intent::AskRemote(Some("origin".into())),
            ),
            (
                "git ls-remote origin",
                Intent::AskRemote(Some("origin".into())),
            ),
            ("git mv a b", Intent::None),
        ] {
            assert_eq!(classified(line).intent, intent, "{line}");
        }
    }

    #[test]
    fn changes_that_would_open_an_editor_or_rewrite_history_get_their_safe_form() {
        assert_eq!(
            classified("git revert HEAD").arguments,
            ["revert", "--no-edit", "HEAD"]
        );
        assert_eq!(
            classified("git revert --continue").arguments,
            ["revert", "--continue"]
        );
        assert_eq!(
            classified("git cherry-pick abc").arguments,
            ["cherry-pick", "abc"]
        );
        assert_eq!(
            classified("git pull origin main").arguments,
            ["pull", "--no-rebase", "--ff-only", "origin", "main"]
        );
        assert_eq!(tier("git pull origin main"), Tier::Remote);
    }

    #[test]
    fn the_renderer_offers_the_same_read_commands() {
        let source = include_str!("../../../src/features/console/domain.ts");
        let start = source
            .find("export const GIT_READ_COMMANDS = [")
            .expect("the renderer's read command list");
        let list = &source[start..];
        let list = &list[list.find('[').unwrap()..list.find("] as const;").unwrap()];
        let offered = list.split('"').skip(1).step_by(2).collect::<Vec<_>>();
        assert_eq!(offered, READ_SUBCOMMANDS);
    }

    #[test]
    fn every_read_subcommand_classifies_as_read() {
        for subcommand in READ_SUBCOMMANDS {
            assert_eq!(
                tier(&format!("git {subcommand}")),
                Tier::Read,
                "{subcommand}"
            );
        }
        for line in [
            "git log --graph --oneline -- src/",
            "git show HEAD~2:README.md",
            "git blame -L 10,20 src/main.rs",
            "git annotate src/main.rs",
            "git diff --stat HEAD~1 -- src",
            "git diff main..feature",
            "git diff --text",
            "git grep -n 'fn main' -- src",
            "git log -SOops",
            "git log --exclude=refs/stash --all",
            "git blame --ignore-rev abc1234 src/main.rs",
            "git branch -a",
            "git branch -vv",
            "git branch --list 'feat*'",
            "git branch --contains HEAD",
            "git branch --sort -committerdate",
            "git branch --show-current",
            "git tag -l 'v*'",
            "git tag -n5",
            "git tag --contains HEAD",
            "git remote -v",
            "git remote get-url origin",
            "git stash list",
            "git stash show -p stash@{0}",
            "git reflog show main",
            "git reflog main",
            "git reflog exists HEAD",
            "git cat-file -p HEAD",
            "git cat-file -t HEAD",
            "git cat-file -s HEAD",
            "git rev-parse --show-toplevel",
            "git describe --always --dirty",
            "git merge-base --fork-point main",
            "git for-each-ref --format='%(refname)' refs/heads",
            "git show-ref --heads",
            "git --no-pager log",
            "git --version",
        ] {
            assert_eq!(tier(line), Tier::Read, "{line}");
        }
    }

    #[test]
    fn read_plans_add_the_flags_that_keep_programs_from_running() {
        assert_eq!(
            classified("git log --graph --oneline -- src/"),
            Classified {
                arguments: [
                    "log",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-show-signature",
                    "--graph",
                    "--oneline",
                    "--",
                    "src/"
                ]
                .map(String::from)
                .to_vec(),
                tier: Tier::Read,
                shape: OutputShape::Graph,
                intent: Intent::None,
            }
        );
        assert_eq!(
            classified("git stash show -p stash@{1}").arguments,
            [
                "stash",
                "show",
                "--no-ext-diff",
                "--no-textconv",
                "-p",
                "stash@{1}"
            ]
        );
        assert_eq!(
            classified("git diff HEAD").arguments,
            ["diff", "--no-ext-diff", "--no-textconv", "HEAD"]
        );
        assert_eq!(
            classified("git blame f").arguments,
            ["blame", "--no-textconv", "f"]
        );
        assert_eq!(
            classified("git reflog exists HEAD").arguments,
            ["reflog", "exists", "HEAD"]
        );
        assert_eq!(
            classified("git reflog").arguments,
            ["reflog", "--no-show-signature"]
        );
        // Without a revision `shortlog` would wait on standard input.
        assert_eq!(
            classified("git shortlog -sn").arguments,
            ["shortlog", "-sn", "HEAD"]
        );
        assert_eq!(
            classified("git shortlog -sn main").arguments,
            ["shortlog", "-sn", "main"]
        );
        assert_eq!(classified("git --no-pager status").arguments, ["status"]);
        assert_eq!(classified("git --version").arguments, ["version"]);
        assert_eq!(classified("git status").shape, OutputShape::Status);
        assert_eq!(classified("git branch -a").shape, OutputShape::Branches);
        assert_eq!(classified("git remote -v").shape, OutputShape::Remotes);
        assert_eq!(classified("git stash list").shape, OutputShape::Stashes);
        assert_eq!(classified("git shortlog -sn").shape, OutputShape::Authors);
        assert_eq!(classified("git show HEAD").shape, OutputShape::Commits);
        // A mutation runs exactly as typed.
        assert_eq!(
            classified("git commit -m 'x'").arguments,
            ["commit", "-m", "x"]
        );
    }

    #[test]
    fn every_denied_long_option_and_its_abbreviations_are_refused() {
        for (option, danger) in DENIED_LONG {
            let reason = match danger {
                Danger::RunsProgram => RefusalReason::RunsProgram,
                Danger::WritesFile => RefusalReason::WritesFile,
                Danger::LeavesProject => RefusalReason::LeavesProject,
            };
            // Every subcommand, not only the one that owns the option.
            for subcommand in ["log", "show", "diff", "cat-file", "grep", "status"] {
                assert_refused(&format!("git {subcommand} {option}"), reason, option);
                assert_refused(&format!("git {subcommand} {option}=x"), reason, option);
            }
        }
        for (abbreviation, reason) in [
            ("--ext", RefusalReason::RunsProgram),
            ("--textc", RefusalReason::RunsProgram),
            ("--filt", RefusalReason::RunsProgram),
            ("--upload", RefusalReason::RunsProgram),
            ("--open", RefusalReason::RunsProgram),
            ("--show-sig", RefusalReason::RunsProgram),
            ("--out", RefusalReason::WritesFile),
            ("--no-ind", RefusalReason::LeavesProject),
            ("--cont", RefusalReason::LeavesProject),
            ("--resolve", RefusalReason::LeavesProject),
        ] {
            assert_refused(
                &format!("git cat-file {abbreviation}=x HEAD"),
                reason,
                abbreviation,
            );
        }
        // Exact options that merely begin like a denied one keep their meaning.
        for exact in EXACT_PREFIXES {
            assert_eq!(tier(&format!("git log {exact}=x")), Tier::Read, "{exact}");
        }
        // After `--`, a word is a path, never an option.
        assert_eq!(tier("git log -- --output"), Tier::Read);
    }

    #[test]
    fn denied_short_options_are_found_inside_bundles() {
        for (line, reason, subject) in [
            ("git grep -O foo", RefusalReason::RunsProgram, "-O"),
            ("git grep -nO foo", RefusalReason::RunsProgram, "-O"),
            ("git grep -Ovim foo", RefusalReason::RunsProgram, "-O"),
            (
                "git grep -f patterns.txt",
                RefusalReason::LeavesProject,
                "-f",
            ),
            ("git diff -Oorder.txt", RefusalReason::LeavesProject, "-O"),
            (
                "git log -p -O/tmp/order",
                RefusalReason::LeavesProject,
                "-O",
            ),
            ("git show -O x", RefusalReason::LeavesProject, "-O"),
            ("git stash show -Ox", RefusalReason::LeavesProject, "-O"),
            (
                "git blame -S revs.txt f",
                RefusalReason::LeavesProject,
                "-S",
            ),
            (
                "git ls-files -X ignores",
                RefusalReason::LeavesProject,
                "-X",
            ),
            ("git rebase -x make main", RefusalReason::RunsProgram, "-x"),
            (
                "git rebase --exec=make main",
                RefusalReason::RunsProgram,
                "--exec",
            ),
        ] {
            assert_refused(line, reason, subject);
        }
        // A letter that is the value of an earlier short option is not a flag.
        // A value that looks like a denied option is treated as one: strict.
        assert_refused("git grep -e -Ofoo", RefusalReason::RunsProgram, "-O");
        assert_eq!(tier("git grep -A3 foo"), Tier::Read);
        assert_eq!(tier("git log -n5 -Sneedle"), Tier::Read);
    }

    #[test]
    fn global_options_are_refused_before_the_subcommand() {
        for option in [
            "-c",
            "-C",
            "--exec-path",
            "--exec-path=/tmp",
            "--git-dir=../other/.git",
            "--work-tree=/",
            "--namespace=x",
            "--config-env=core.pager=X",
            "--super-prefix=x",
            "-p",
            "--paginate",
            "--bare",
            "--literal-pathspecs",
        ] {
            assert_refused(
                &format!("git {option} status"),
                RefusalReason::GlobalOption,
                option,
            );
        }
        assert_refused("git -c alias.x=!sh x", RefusalReason::GlobalOption, "-c");
        assert_refused(
            "git --version log",
            RefusalReason::GlobalOption,
            "--version",
        );
    }

    #[test]
    fn only_built_in_subcommands_run_and_aliases_or_programs_never_do() {
        for name in ["lg", "st", "lfs", "flow", "LOG", "log;", "x!"] {
            assert_refused(
                &format!("git {name}"),
                RefusalReason::UnknownSubcommand,
                name,
            );
        }
        for name in [
            "config",
            "bisect",
            "gc",
            "prune",
            "submodule",
            "worktree",
            "filter-branch",
            "update-ref",
            "hook",
            "help",
            "instaweb",
            "daemon",
            "send-email",
            "credential",
            "difftool",
            "mergetool",
            "archive",
            "bundle",
            "format-patch",
            "init",
            "clone",
        ] {
            assert_refused(&format!("git {name}"), RefusalReason::NotAvailable, name);
        }
        assert_refused(
            "git reflog expire --all",
            RefusalReason::NotAvailable,
            "reflog expire",
        );
        assert_refused(
            "git stash store x",
            RefusalReason::NotAvailable,
            "stash store",
        );
        assert_refused(
            "git remote frobnicate",
            RefusalReason::UnknownSubcommand,
            "remote frobnicate",
        );
        assert_eq!(refusal("status").reason, RefusalReason::NotGit);
        assert_eq!(refusal("git-lfs ls-files").reason, RefusalReason::NotGit);
        assert_eq!(refusal("git").reason, RefusalReason::MissingSubcommand);
        assert_eq!(
            refusal("git --no-pager").reason,
            RefusalReason::MissingSubcommand
        );
    }

    #[test]
    fn a_diff_never_reads_a_file_outside_the_project() {
        for path in [
            "/etc/passwd",
            r"\\server\share",
            r"C:\Windows\win.ini",
            "../other",
            r"..\other",
            "src/../../x",
        ] {
            assert_refused(
                &format!("git diff {path} README.md"),
                RefusalReason::LeavesProject,
                path,
            );
            assert_refused(
                &format!("git diff HEAD -- {path}"),
                RefusalReason::LeavesProject,
                path,
            );
        }
    }

    #[test]
    fn commands_that_need_a_terminal_are_refused_with_the_option_named() {
        for (line, subject) in [
            ("git commit", "commit"),
            ("git commit -a", "commit"),
            ("git commit -c HEAD", "-c"),
            ("git commit -e -m x", "-e"),
            ("git add -p", "-p"),
            ("git add --interactive", "--interactive"),
            ("git checkout -p", "-p"),
            ("git reset -p", "-p"),
            ("git stash push -p", "-p"),
            ("git rebase -i HEAD~2", "-i"),
            ("git rebase --interactive main", "--interactive"),
            ("git merge --edit topic", "--edit"),
            ("git tag -a v1", "-a"),
            ("git tag -e v1", "-e"),
            ("git branch --edit-description", "--edit-description"),
            ("git clean -i", "-i"),
            ("git pull --rebase=interactive", "--rebase=interactive"),
        ] {
            assert_refused(line, RefusalReason::NeedsTerminal, subject);
        }
        // Letters inside an attached message are the message, not flags.
        assert_eq!(tier("git commit -mupdate"), Tier::LocalChange);
        assert_eq!(tier("git commit -am 'keep it'"), Tier::LocalChange);
        assert_eq!(tier("git stash push -mpatch"), Tier::LocalChange);
    }

    #[test]
    fn higher_tiers_are_named_by_what_they_change() {
        for line in [
            "git add .",
            "git mv a b",
            "git rm a",
            "git rm --cached a",
            "git commit -m 'save'",
            "git switch main",
            "git switch -c try",
            "git branch try",
            "git branch -u origin/main",
            "git tag v1",
            "git tag -a v1 -m 'release'",
            "git stash",
            "git stash push -m wip",
            "git stash apply",
            "git revert HEAD",
            "git cherry-pick abc1234",
            "git restore --staged a",
            "git reset",
            "git reset -- a",
            "git remote add origin https://example.test/x.git",
            "git checkout -b try",
            "git checkout --detach HEAD~1",
        ] {
            assert_eq!(tier(line), Tier::LocalChange, "{line}");
        }
        for line in [
            "git commit --amend -m 'x'",
            "git reset --soft HEAD~1",
            "git reset HEAD~1",
            "git rebase main",
            "git merge topic",
            "git branch -m old new",
            "git branch -f topic HEAD",
            "git switch -C try",
            "git checkout -B try",
            "git tag -f v1",
            "git pull --rebase",
            "git pull -r origin main",
            "git pull --no-ff",
        ] {
            assert_eq!(tier(line), Tier::HistoryChange, "{line}");
        }
        for line in [
            "git fetch",
            "git fetch origin",
            "git pull",
            "git pull --no-rebase",
            "git push",
            "git push -u origin main",
            "git ls-remote",
            "git remote show origin",
            "git remote prune origin",
        ] {
            assert_eq!(tier(line), Tier::Remote, "{line}");
        }
        for line in [
            "git reset --hard",
            "git reset --hard HEAD~1",
            "git clean -fd",
            "git clean -n",
            "git restore a",
            "git restore --staged --worktree a",
            "git checkout -- a",
            "git checkout main",
            "git branch -d topic",
            "git branch -D topic",
            "git branch --delete topic",
            "git branch --frobnicate",
            "git tag -d v1",
            "git stash drop",
            "git stash clear",
            "git stash pop",
            "git stash branch topic",
            "git rm -f a",
            "git rm -rf dir",
            "git switch --discard-changes main",
            "git switch -f main",
            "git merge --abort",
            "git rebase --abort",
            "git cherry-pick --abort",
            "git remote remove origin",
            "git push --force",
            "git push -f",
            "git push --force-with-lease",
            "git push origin --delete topic",
            "git push -d origin topic",
            "git push origin +main",
            "git push origin :old",
            "git push --mirror",
        ] {
            assert_eq!(tier(line), Tier::Destructive, "{line}");
        }
        for (line, subject) in [
            ("git fetch ext::sh", "ext::sh"),
            ("git push fd::7 main", "fd::7"),
            ("git bisect run make", "bisect run"),
            ("git tag -v v1", "--verify"),
            ("git tag --verify v1", "--verify"),
        ] {
            assert_refused(line, RefusalReason::RunsProgram, subject);
        }
    }
}
