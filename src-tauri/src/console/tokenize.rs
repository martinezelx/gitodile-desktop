//! Turns a typed console line into an argument vector without a shell.
//!
//! The grammar is deliberately small and the same on every platform:
//! whitespace separates arguments, single quotes are literal, double quotes
//! allow `\"` and `\\`, and an unquoted backslash is literal so Windows paths
//! type as they read. Nothing is expanded. Shell syntax that would mean
//! something else in a terminal (`;`, `&`, `|`, `<`, `>`, a backtick, `$(`)
//! rejects the line instead of reaching Git as a literal.

use super::{Refusal, RefusalReason};

/// Far longer than any command a person types, short enough that planning
/// stays cheap and the echoed command stays readable.
pub(super) const MAX_LINE_CHARS: usize = 4096;
pub(super) const MAX_ARGUMENTS: usize = 256;

/// Characters a terminal would read as control or display tricks. A command
/// line has no use for them, and a bidirectional override would make the
/// echoed command read differently from the arguments Git receives.
fn is_rejected_character(ch: char) -> bool {
    ch.is_control() || matches!(ch, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
}

fn checked(ch: char) -> Result<char, Refusal> {
    if is_rejected_character(ch) {
        Err(Refusal::new(RefusalReason::ControlCharacter, None))
    } else {
        Ok(ch)
    }
}

pub(super) fn tokenize(line: &str) -> Result<Vec<String>, Refusal> {
    if line.chars().count() > MAX_LINE_CHARS {
        return Err(Refusal::new(RefusalReason::TooLong, None));
    }
    let mut arguments = Vec::new();
    let mut current = String::new();
    // Distinguishes `''` (one empty argument) from no argument at all.
    let mut in_argument = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            ' ' | '\t' => {
                if in_argument {
                    arguments.push(std::mem::take(&mut current));
                    in_argument = false;
                }
            }
            '\'' => {
                in_argument = true;
                loop {
                    match chars.next() {
                        Some('\'') => break,
                        Some(quoted) => current.push(checked(quoted)?),
                        None => return Err(Refusal::new(RefusalReason::UnclosedQuote, None)),
                    }
                }
            }
            '"' => {
                in_argument = true;
                loop {
                    match chars.next() {
                        Some('"') => break,
                        Some('\\') if matches!(chars.peek(), Some('"' | '\\')) => {
                            current.push(chars.next().expect("peeked"));
                        }
                        Some(quoted) => current.push(checked(quoted)?),
                        None => return Err(Refusal::new(RefusalReason::UnclosedQuote, None)),
                    }
                }
            }
            ';' | '&' | '|' | '<' | '>' | '`' => {
                return Err(Refusal::new(
                    RefusalReason::ShellSyntax,
                    Some(ch.to_string()),
                ));
            }
            '$' if chars.peek() == Some(&'(') => {
                return Err(Refusal::new(RefusalReason::ShellSyntax, Some("$(".into())));
            }
            other => {
                in_argument = true;
                current.push(checked(other)?);
            }
        }
        if arguments.len() > MAX_ARGUMENTS {
            return Err(Refusal::new(RefusalReason::TooLong, None));
        }
    }
    if in_argument {
        arguments.push(current);
    }
    if arguments.len() > MAX_ARGUMENTS {
        return Err(Refusal::new(RefusalReason::TooLong, None));
    }
    Ok(arguments)
}

/// The argument vector as a line the tokenizer reads back unchanged, for the
/// command echoed above a result.
pub(super) fn display(arguments: &[String]) -> String {
    arguments
        .iter()
        .map(|argument| quote(argument))
        .collect::<Vec<_>>()
        .join(" ")
}

fn quote(argument: &str) -> String {
    let plain = !argument.is_empty()
        && !argument.chars().any(|ch| {
            ch.is_whitespace() || matches!(ch, '\'' | '"' | ';' | '&' | '|' | '<' | '>' | '`')
        })
        && !argument.contains("$(");
    if plain {
        return argument.to_string();
    }
    if !argument.contains('\'') {
        return format!("'{argument}'");
    }
    let mut quoted = String::with_capacity(argument.len() + 2);
    quoted.push('"');
    for ch in argument.chars() {
        if matches!(ch, '"' | '\\') {
            quoted.push('\\');
        }
        quoted.push(ch);
    }
    quoted.push('"');
    quoted
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(line: &str) -> Vec<String> {
        tokenize(line).unwrap_or_else(|refusal| panic!("{line}: {refusal:?}"))
    }

    fn reason(line: &str) -> RefusalReason {
        tokenize(line).unwrap_err().reason
    }

    #[test]
    fn whitespace_separates_and_quotes_group() {
        assert_eq!(words("git  log\t--oneline "), ["git", "log", "--oneline"]);
        assert_eq!(
            words("git log --format='%h %s' -- \"src dir/\""),
            ["git", "log", "--format=%h %s", "--", "src dir/"]
        );
        assert_eq!(words("git grep ''"), ["git", "grep", ""]);
        assert_eq!(words("git show a'b'\"c\"d"), ["git", "show", "abcd"]);
        assert!(words("").is_empty());
        assert!(words("   \t ").is_empty());
    }

    #[test]
    fn escapes_apply_only_inside_double_quotes() {
        assert_eq!(
            words(r#"git log --grep="say \"hi\" \\ \n""#),
            ["git", "log", r#"--grep=say "hi" \ \n"#]
        );
        assert_eq!(words(r"git grep 'a\'"), ["git", "grep", r"a\"]);
        assert_eq!(words(r"git grep a\ b"), ["git", "grep", r"a\", "b"]);
    }

    #[test]
    fn windows_paths_keep_their_backslashes() {
        assert_eq!(
            words(r"git log -- src\app\main.rs C:\work"),
            ["git", "log", "--", r"src\app\main.rs", r"C:\work"]
        );
    }

    #[test]
    fn unicode_is_kept_and_nothing_is_expanded() {
        assert_eq!(
            words("git log --author=Muñoz -- señal/✓ $HOME ~ *.rs {a,b} #x"),
            [
                "git",
                "log",
                "--author=Muñoz",
                "--",
                "señal/✓",
                "$HOME",
                "~",
                "*.rs",
                "{a,b}",
                "#x"
            ]
        );
    }

    #[test]
    fn every_shell_construct_rejects_the_line() {
        for (line, subject) in [
            ("git status; rm -rf .", ";"),
            ("git status && git push", "&"),
            ("git status & calc", "&"),
            ("git log | more", "|"),
            ("git log > out.txt", ">"),
            ("git log 2>&1", ">"),
            ("git apply < patch", "<"),
            ("git log `whoami`", "`"),
            ("git log $(whoami)", "$("),
            ("git log x$(whoami)", "$("),
        ] {
            let refusal = tokenize(line).unwrap_err();
            assert_eq!(refusal.reason, RefusalReason::ShellSyntax, "{line}");
            assert_eq!(refusal.subject.as_deref(), Some(subject), "{line}");
        }
        // Quoted, the same characters are ordinary text for Git to read.
        assert_eq!(
            words("git log --grep='a; b | c > d' --format=\"`$(x)`\""),
            ["git", "log", "--grep=a; b | c > d", "--format=`$(x)`"]
        );
    }

    #[test]
    fn unclosed_quotes_control_characters_and_huge_input_are_refused() {
        assert_eq!(reason("git log 'open"), RefusalReason::UnclosedQuote);
        assert_eq!(reason("git log \"open"), RefusalReason::UnclosedQuote);
        assert_eq!(reason("git log \"x\\\""), RefusalReason::UnclosedQuote);
        assert_eq!(reason("git status\nrm"), RefusalReason::ControlCharacter);
        assert_eq!(
            reason("git log '\u{1b}[31m'"),
            RefusalReason::ControlCharacter
        );
        assert_eq!(
            reason("git log \u{202e}txt"),
            RefusalReason::ControlCharacter
        );
        assert_eq!(
            reason(&format!("git log {}", "x".repeat(MAX_LINE_CHARS))),
            RefusalReason::TooLong
        );
        assert_eq!(
            reason(&"a ".repeat(MAX_ARGUMENTS + 1)),
            RefusalReason::TooLong
        );
        assert_eq!(words(&"a ".repeat(MAX_ARGUMENTS)).len(), MAX_ARGUMENTS);
    }

    #[test]
    fn the_echoed_command_reads_back_as_the_same_arguments() {
        for arguments in [
            vec!["git", "log", "--oneline"],
            vec!["git", "log", "--format=%h %s", "--", "a b"],
            vec!["git", "grep", ""],
            vec!["git", "grep", "it's"],
            vec!["git", "grep", r#"say "it's" \ fine"#],
            vec!["git", "grep", "a;b|c$(d)`e`"],
            vec!["git", "log", "--", r"C:\work\señal"],
        ] {
            let arguments = arguments.into_iter().map(String::from).collect::<Vec<_>>();
            assert_eq!(words(&display(&arguments)), arguments);
        }
        assert_eq!(
            display(&["git".into(), "log".into(), "--format=%h %s".into()]),
            "git log '--format=%h %s'"
        );
    }
}
