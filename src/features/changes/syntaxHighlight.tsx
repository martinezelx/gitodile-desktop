import React from "react";

export type SyntaxLanguage =
  | "javascript" | "json" | "css" | "markup" | "rust" | "python" | "shell" | "markdown"
  | "go" | "java" | "cFamily" | "php" | "ruby" | "swift" | "kotlin" | "dart"
  | "sql" | "yaml" | "toml" | "lua";
export type SyntaxTokenKind = "comment" | "string" | "number" | "keyword" | "type" | "property" | "plain";
export type SyntaxToken = { kind: SyntaxTokenKind; text: string };

const EXTENSIONS: Record<string, SyntaxLanguage> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "javascript", tsx: "javascript", mts: "javascript", cts: "javascript",
  json: "json", jsonc: "json", css: "css", scss: "css", less: "css",
  html: "markup", htm: "markup", xml: "markup", svg: "markup", vue: "markup", svelte: "markup",
  rs: "rust", py: "python", pyw: "python", sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  md: "markdown", mdx: "markdown", markdown: "markdown",
  go: "go", java: "java", kt: "kotlin", kts: "kotlin",
  c: "cFamily", h: "cFamily", cc: "cFamily", cpp: "cFamily", cxx: "cFamily", hpp: "cFamily", cs: "cFamily",
  php: "php", rb: "ruby", swift: "swift", dart: "dart", lua: "lua",
  sql: "sql", yaml: "yaml", yml: "yaml", toml: "toml",
};

export function detectSyntaxLanguage(path: string): SyntaxLanguage | null {
  const name = path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
  if (["dockerfile", "containerfile", "makefile", "justfile"].includes(name)) return "shell";
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return EXTENSIONS[extension] ?? null;
}

const KEYWORDS: Record<SyntaxLanguage, Set<string>> = {
  javascript: new Set("as async await break case catch class const continue default delete do else export extends false finally for from function get if implements import in instanceof interface let new null of private protected public return set static super switch this throw true try type typeof undefined var void while yield".split(" ")),
  json: new Set(["true", "false", "null"]),
  css: new Set(["from", "to", "important"]), markup: new Set(),
  rust: new Set("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(" ")),
  python: new Set("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield".split(" ")),
  shell: new Set("case do done elif else esac export fi for function if in local readonly then unset until while".split(" ")),
  markdown: new Set(),
  go: new Set("break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var".split(" ")),
  java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends false final finally float for goto if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true try void volatile while".split(" ")),
  cFamily: new Set("alignas alignof auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend goto if inline int long namespace new nullptr operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while".split(" ")),
  php: new Set("abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include instanceof interface isset list match namespace new null or print private protected public readonly require return static switch throw trait true try unset use var while xor yield".split(" ")),
  ruby: new Set("alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield".split(" ")),
  swift: new Set("associatedtype break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self static struct subscript super switch throw throws true try typealias var where while".split(" ")),
  kotlin: new Set("as break by catch class companion const constructor continue data do else enum false finally for fun if import in interface internal is lateinit null object open operator out override package private protected public return sealed super suspend this throw true try typealias val var when while".split(" ")),
  dart: new Set("abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield".split(" ")),
  sql: new Set("all alter and as asc begin between by case create delete desc distinct drop else end exists false from full group having in inner insert into is join left like limit not null on or order outer primary references right select set table then true union unique update values when where with".split(" ")),
  yaml: new Set(["true", "false", "null", "yes", "no"]),
  toml: new Set(["true", "false"]),
  lua: new Set("and break do else elseif end false for function goto if in local nil not or repeat return then true until while".split(" ")),
};
const TYPES = new Set("Array Boolean Error Map Number Object Promise Record Set String Vec Option Result Some None Ok Err".split(" "));

/** A deliberately small inert lexer: a plain line is preferable to a wrong
 * grammar or any tokenizer that asks React to trust generated HTML. */
export function tokenizeSyntaxLine(line: string, language: SyntaxLanguage): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const commentStart = ["python", "shell", "ruby", "yaml", "toml"].includes(language) ? "#"
    : language === "markup" ? "<!--"
      : language === "sql" ? "--"
        : language === "lua" ? "--"
          : language === "markdown" || language === "json" ? null : "//";
  const push = (kind: SyntaxTokenKind, text: string): void => {
    if (!text) return;
    const previous = tokens.at(-1);
    if (previous?.kind === kind) previous.text += text;
    else tokens.push({ kind, text });
  };
  let index = 0;
  while (index < line.length) {
    if (commentStart && line.startsWith(commentStart, index)) { push("comment", line.slice(index)); break; }
    const character = line[index];
    if (character === '"' || character === "'" || character === "`") {
      let end = index + 1;
      while (end < line.length) {
        if (line[end] === "\\") end += 2;
        else if (line[end++] === character) break;
      }
      push("string", line.slice(index, end)); index = end; continue;
    }
    const number = line.slice(index).match(/^(?:0x[\da-f]+|\d+(?:\.\d+)?)/i)?.[0];
    if (number) { push("number", number); index += number.length; continue; }
    const word = line.slice(index).match(/^[A-Za-z_$][\w$-]*/)?.[0];
    if (word) {
      const rest = line.slice(index + word.length);
      const keyword = language === "sql" ? word.toLowerCase() : word;
      const kind: SyntaxTokenKind = KEYWORDS[language].has(keyword) ? "keyword"
        : TYPES.has(word) || (/^[A-Z]/.test(word) && !["json", "css", "markup", "markdown", "yaml", "toml", "sql"].includes(language)) ? "type"
          : /^\s*(?::|=)/.test(rest) && ["json", "css", "yaml", "toml"].includes(language) ? "property" : "plain";
      push(kind, word); index += word.length; continue;
    }
    push("plain", character); index += 1;
  }
  return tokens;
}

export function highlightSyntaxLine(line: string, language: SyntaxLanguage): React.ReactNode {
  return tokenizeSyntaxLine(line, language).map((token, index) => token.kind === "plain"
    ? token.text
    : <span className={`syntax-token syntax-token--${token.kind}`} key={index}>{token.text}</span>);
}
