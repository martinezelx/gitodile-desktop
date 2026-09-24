import { describe, expect, it } from "vitest";
import { checkLineName, prevailingLinePrefix } from "./lineNames";

describe("checkLineName", () => {
  const existing = ["main", "feature/login", "Fix/Typo"];

  it("accepts what Git accepts and nobody has taken", () => {
    // Each checked against `git check-ref-format --branch` itself, "@" too:
    // Git takes a lone "@" as a branch name, so this mirror must as well.
    for (const name of ["feature/new", "fix-42", "docs/readme.v2", "v1.0", "@", "@x", "HEADER", "a.lock.b"]) {
      expect(checkLineName(name, existing)).toBeNull();
    }
    expect(checkLineName("", existing)).toBeNull();
  });

  it("says at once what typing on cannot fix", () => {
    expect(checkLineName("my line", existing)).toEqual({ issue: { kind: "space" }, when: "live" });
    for (const character of ["~", "^", ":", "?", "*", "[", "\\"]) {
      expect(checkLineName(`a${character}b`, existing)).toEqual({ issue: { kind: "character", character }, when: "live" });
    }
    expect(checkLineName("a\u0007b", existing)).toEqual({ issue: { kind: "control" }, when: "live" });
    expect(checkLineName("a..b", existing)).toEqual({ issue: { kind: "sequence", sequence: ".." }, when: "live" });
    expect(checkLineName("a//b", existing)).toEqual({ issue: { kind: "sequence", sequence: "//" }, when: "live" });
    expect(checkLineName("a@{b", existing)).toEqual({ issue: { kind: "sequence", sequence: "@{" }, when: "live" });
    expect(checkLineName("-x", existing)).toEqual({ issue: { kind: "leading", character: "-" }, when: "live" });
    expect(checkLineName("/x", existing)).toEqual({ issue: { kind: "leading", character: "/" }, when: "live" });
    expect(checkLineName(".x", existing)).toEqual({ issue: { kind: "leading", character: "." }, when: "live" });
    expect(checkLineName("feature/.hidden", existing)).toEqual({ issue: { kind: "part-leading-dot" }, when: "live" });
    expect(checkLineName("a.lock/b", existing)).toEqual({ issue: { kind: "lock-suffix" }, when: "live" });
  });

  it("keeps what every half-typed name looks like until the reader asks to create", () => {
    expect(checkLineName("feature/", existing)).toEqual({ issue: { kind: "trailing", character: "/" }, when: "submit" });
    expect(checkLineName("v1.", existing)).toEqual({ issue: { kind: "trailing", character: "." }, when: "submit" });
    expect(checkLineName("x.lock", existing)).toEqual({ issue: { kind: "lock-suffix" }, when: "submit" });
    expect(checkLineName("HEAD", existing)).toEqual({ issue: { kind: "reserved", name: "HEAD" }, when: "submit" });
  });

  it("names the line a new one would clash with, exactly or by letter case", () => {
    expect(checkLineName("feature/login", existing)).toEqual({ issue: { kind: "taken", name: "feature/login" }, when: "live" });
    expect(checkLineName("fix/typo", existing)).toEqual({ issue: { kind: "case-collision", existing: "Fix/Typo" }, when: "live" });
  });

  it("is never stricter than Git or Rust", () => {
    // Both checked against Git: a non-breaking space is a valid ref
    // character, and Rust's clash check folds ASCII letters only.
    expect(checkLineName("a\u00a0b", existing)).toBeNull();
    expect(checkLineName("a\tb", existing)).toEqual({ issue: { kind: "control" }, when: "live" });
    expect(checkLineName("ñandú", ["Ñandú"])).toBeNull();
    expect(checkLineName("ÑANDÚ-x", ["Ñandú-X"])).toBeNull();
    expect(checkLineName("Main", ["main"])).toEqual({ issue: { kind: "case-collision", existing: "main" }, when: "live" });
  });

  it("reports what is in the name before how it ends", () => {
    expect(checkLineName("my line/", existing)?.issue.kind).toBe("space");
  });
});

describe("prevailingLinePrefix", () => {
  it("is the prefix most lines share, once at least two do", () => {
    expect(prevailingLinePrefix(["main", "fix/a", "fix/b", "feat/c"])).toBe("fix");
    expect(prevailingLinePrefix(["main", "fix/a", "feat/c"])).toBeNull();
    expect(prevailingLinePrefix(["main", "develop"])).toBeNull();
  });

  it("breaks a tie alphabetically, so the example does not flip between readings", () => {
    expect(prevailingLinePrefix(["fix/a", "fix/b", "docs/a", "docs/b"])).toBe("docs");
  });

  it("ignores a name that only starts with a slash", () => {
    expect(prevailingLinePrefix(["/a", "/b"])).toBeNull();
  });
});
