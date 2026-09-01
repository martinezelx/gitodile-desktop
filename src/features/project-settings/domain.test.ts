import { describe, expect, it } from "vitest";

import {
  hasIdentityDraftChanged,
  hasIgnoreDraftChanged,
  hasRemoteUrlChanged,
  identityDraftFrom,
  isIdentityDraftValid,
  projectSettingsSectionLabel,
  type IgnoreFile,
  type ProjectIdentity,
  type ProjectRemote,
} from "./domain";

const remote: ProjectRemote = {
  name: "origin",
  url: "https://example.test/repo.git",
  pushUrl: null,
  hasHiddenCredentials: true,
};

const identity: ProjectIdentity = {
  localName: null,
  localEmail: null,
  inheritedName: "Global Person",
  inheritedEmail: "global@example.test",
  effectiveName: "Global Person",
  effectiveEmail: "global@example.test",
  source: "inherited",
};

const file: IgnoreFile = {
  scope: "project",
  relativePath: ".gitignore",
  exists: true,
  contents: "build/\n",
  stateToken: "abc",
  byteLength: 7,
  unavailable: null,
};

describe("remote URL edits", () => {
  it("refuses to save the address it is already showing", () => {
    // The displayed URL is redacted, so saving it unchanged would replace a
    // stored password with nothing while looking like a no-op.
    expect(hasRemoteUrlChanged(remote.url, remote)).toBe(false);
    expect(hasRemoteUrlChanged(`  ${remote.url}  `, remote)).toBe(false);
    expect(hasRemoteUrlChanged("", remote)).toBe(false);
    expect(hasRemoteUrlChanged("   ", remote)).toBe(false);
  });

  it("accepts a genuinely different address", () => {
    expect(hasRemoteUrlChanged("https://example.test/moved.git", remote)).toBe(true);
  });
});

describe("identity drafts", () => {
  it("seeds from the local override, and from the inherited identity without one", () => {
    expect(identityDraftFrom(identity)).toEqual({
      name: "Global Person",
      email: "global@example.test",
    });
    expect(
      identityDraftFrom({ ...identity, localName: "Work", localEmail: "work@example.test" }),
    ).toEqual({ name: "Work", email: "work@example.test" });
    expect(identityDraftFrom(null)).toEqual({ name: "", email: "" });
  });

  it("compares against the local override rather than the effective identity", () => {
    // Seeded from the inherited values, an untouched draft still has nothing
    // stored locally — so it is a change, and saving it is what creates the
    // override the user asked for.
    expect(hasIdentityDraftChanged(identityDraftFrom(identity), identity)).toBe(true);
    const overridden = { ...identity, localName: "Work", localEmail: "work@example.test" };
    expect(hasIdentityDraftChanged(identityDraftFrom(overridden), overridden)).toBe(false);
    expect(
      hasIdentityDraftChanged({ name: " Work ", email: " work@example.test " }, overridden),
    ).toBe(false);
  });

  it("requires both fields, and an address shaped like one", () => {
    expect(isIdentityDraftValid({ name: "Work", email: "work@example.test" })).toBe(true);
    expect(isIdentityDraftValid({ name: "  ", email: "work@example.test" })).toBe(false);
    expect(isIdentityDraftValid({ name: "Work", email: "work@example" })).toBe(false);
    expect(isIdentityDraftValid({ name: "Work", email: "" })).toBe(false);
  });
});

describe("ignore file edits", () => {
  it("is dirty only against a file that could be read", () => {
    expect(hasIgnoreDraftChanged("build/\n", file)).toBe(false);
    expect(hasIgnoreDraftChanged("build/\nnode_modules/\n", file)).toBe(true);
    expect(hasIgnoreDraftChanged("anything", null)).toBe(false);
    expect(
      hasIgnoreDraftChanged("anything", { ...file, contents: null, unavailable: "too_large" }),
    ).toBe(false);
  });
});

describe("section labels", () => {
  it("names every section exactly once", () => {
    const t = {
      projectSettingsRemote: "Remote",
      projectSettingsIgnored: "Ignored files",
      projectSettingsIdentity: "Identity",
    };
    expect(projectSettingsSectionLabel("remote", t)).toBe("Remote");
    expect(projectSettingsSectionLabel("ignored", t)).toBe("Ignored files");
    expect(projectSettingsSectionLabel("identity", t)).toBe("Identity");
  });
});
