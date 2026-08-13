import { describe, expect, it } from "vitest";
import { detectSyntaxLanguage, tokenizeSyntaxLine } from "./syntaxHighlight";

describe("Changes syntax highlighting", () => {
  it("detects supported extensions and common extensionless files", () => {
    expect(detectSyntaxLanguage("src/view.tsx")).toBe("javascript");
    expect(detectSyntaxLanguage("src-tauri/src/lib.rs")).toBe("rust");
    expect(detectSyntaxLanguage("backend/main.go")).toBe("go");
    expect(detectSyntaxLanguage("app/Program.cs")).toBe("cFamily");
    expect(detectSyntaxLanguage("config/settings.yml")).toBe("yaml");
    expect(detectSyntaxLanguage("database/schema.sql")).toBe("sql");
    expect(detectSyntaxLanguage("Dockerfile")).toBe("shell");
    expect(detectSyntaxLanguage("assets/photo.png")).toBeNull();
  });

  it("recognizes language-specific comments, keywords, and configuration properties", () => {
    expect(tokenizeSyntaxLine("SELECT id FROM users -- active", "sql")).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "keyword", text: "SELECT" }),
      expect.objectContaining({ kind: "comment", text: "-- active" }),
    ]));
    expect(tokenizeSyntaxLine("server: true # local", "yaml")).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "property", text: "server" }),
      expect.objectContaining({ kind: "keyword", text: "true" }),
      expect.objectContaining({ kind: "comment", text: "# local" }),
    ]));
  });

  it("keeps the exact source text while adding semantic token kinds", () => {
    const source = 'const answer: Number = 42; // useful';
    const tokens = tokenizeSyntaxLine(source, "javascript");
    expect(tokens.map((token) => token.text).join("")).toBe(source);
    expect(tokens.some((token) => token.kind === "keyword" && token.text === "const")).toBe(true);
    expect(tokens.some((token) => token.kind === "number" && token.text === "42")).toBe(true);
    expect(tokens.at(-1)).toEqual({ kind: "comment", text: "// useful" });
  });

  it("treats markup-like strings as inert token text", () => {
    const source = '<img src=x onerror="alert(1)">';
    expect(tokenizeSyntaxLine(source, "markup").map((token) => token.text).join("")).toBe(source);
  });
});
