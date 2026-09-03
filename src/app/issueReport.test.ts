import { describe, expect, it } from "vitest";

import { buildIssueReportUrl, FEEDBACK_REPOSITORY_URL } from "./issueReport";

/** What a Windows machine with a working Git looks like to the report builder. */
const FULL_ENVIRONMENT = {
  appVersion: "0.1.0",
  system: { platform: "windows", version: "10.0.26200", arch: "x86_64" },
  webview: "Chromium 130.0.0.0",
  gitVersion: "2.45.0",
};

describe("issue report url", () => {
  it("selects the Spanish form without changing its diagnostics field", () => {
    const url = new URL(buildIssueReportUrl(FULL_ENVIRONMENT, "es"));
    expect(url.searchParams.get("template")).toBe("bug-es.yml");
    expect(url.searchParams.get("diagnostics")).toContain("Git: 2.45.0");
  });
  it("opens the public tracker's bug form and never the private repository", () => {
    const url = new URL(buildIssueReportUrl(FULL_ENVIRONMENT));

    expect(`${url.origin}${url.pathname}`).toBe(`${FEEDBACK_REPOSITORY_URL}/issues/new`);
    // The template has to be named: without it GitHub shows the chooser and
    // drops every prefilled value on the way through.
    expect(url.searchParams.get("template")).toBe("bug.yml");
    expect(url.href).not.toContain("project-gitodile");
  });

  it("prefills the same diagnostics block About copies", () => {
    const url = new URL(buildIssueReportUrl(FULL_ENVIRONMENT));

    expect(url.searchParams.get("diagnostics")).toBe(
      "GitOdile 0.1.0\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\n" +
        "Webview: Chromium 130.0.0.0\nGit: 2.45.0",
    );
  });

  it("survives a browser run, where neither the OS bridge nor Git answered", () => {
    // `pnpm dev` in a plain browser has no Tauri global, so the whole block
    // collapses to the one line the build always knows. A report with less in
    // it still has to be a report, not a crash or an "undefined" row.
    const url = new URL(
      buildIssueReportUrl({ appVersion: "0.1.0", system: null, webview: null, gitVersion: null }),
    );

    expect(url.searchParams.get("diagnostics")).toBe("GitOdile 0.1.0");
  });

  it("encodes the newlines rather than leaking them into the query string", () => {
    // A raw newline in a URL is what makes `openUrl` hand the shell a
    // truncated address, so this is the property that actually has to hold.
    expect(buildIssueReportUrl(FULL_ENVIRONMENT)).not.toMatch(/[\n\r]/);
  });
});
