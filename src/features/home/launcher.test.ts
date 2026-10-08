import { beforeEach, describe, expect, it } from "vitest";
import {
  PROMPTS_PER_SLOT,
  classifyLauncherQuery,
  daySlot,
  greetingName,
  isPlausibleProjectName,
  matchRecentProjects,
  nameFromRemoteUrl,
  nextPromptIndex,
  groupAccountsByKind,
  nextSetupStep,
  planSetup,
  shortGitVersion,
  accountChoiceParts,
  readHomeAccounts,
} from "./launcher";

describe("daySlot", () => {
  it.each([
    [6, "morning"],
    [13, "morning"],
    [14, "afternoon"],
    [20, "afternoon"],
    [21, "evening"],
    [0, "evening"],
    [5, "evening"],
  ] as const)("reads %i:00 as %s", (hour, slot) => {
    expect(daySlot(hour)).toBe(slot);
  });
});

describe("greetingName", () => {
  it("greets by the first word of the Git name", () => {
    expect(greetingName("Luis Muñoz Martínez")).toBe("Luis");
    expect(greetingName("  ada  ")).toBe("ada");
  });

  it("drops the name when there is none", () => {
    expect(greetingName("")).toBeNull();
    expect(greetingName("   ")).toBeNull();
    expect(greetingName(null)).toBeNull();
  });
});

describe("classifyLauncherQuery", () => {
  it("treats blank input as empty", () => {
    expect(classifyLauncherQuery("  ")).toEqual({ kind: "empty" });
  });

  it.each([
    ["https://github.com/luis/pixel-dungeon.git", "pixel-dungeon"],
    ["git@github.com:luis/pixel-dungeon.git", "pixel-dungeon"],
    ["ssh://git@gitlab.com/team/app", "app"],
    ["https://example.com/repo/", "repo"],
    ["file:///C:/backups/notes.git", "notes"],
  ])("recognizes %s as a remote URL", (url, name) => {
    expect(classifyLauncherQuery(` ${url} `)).toEqual({ kind: "url", url, name });
  });

  it.each(["C:\\Users\\luis\\dev\\app", "D:/uni/tfg", "\\\\server\\share\\repo", "/home/luis/app"])(
    "recognizes %s as an absolute path",
    (path) => {
      expect(classifyLauncherQuery(path)).toEqual({ kind: "path", path });
    },
  );

  it("leaves anything else as search text", () => {
    expect(classifyLauncherQuery("tfg")).toEqual({ kind: "text", text: "tfg" });
    expect(classifyLauncherQuery("~/dev/app")).toEqual({ kind: "text", text: "~/dev/app" });
  });
});

describe("nameFromRemoteUrl", () => {
  it("returns null when the URL has no last segment", () => {
    expect(nameFromRemoteUrl("https://")).toBeNull();
  });
});

describe("isPlausibleProjectName", () => {
  it("accepts a folder name and rejects separators", () => {
    expect(isPlausibleProjectName("tfg")).toBe(true);
    expect(isPlausibleProjectName("a/b")).toBe(false);
    expect(isPlausibleProjectName("x".repeat(65))).toBe(false);
    expect(isPlausibleProjectName(".")).toBe(false);
    expect(isPlausibleProjectName("..")).toBe(false);
  });
});

describe("matchRecentProjects", () => {
  const entries = [
    { name: "portfolio-web", path: "C:\\dev\\portfolio-web" },
    { name: "notes", path: "C:\\dev\\tfg\\notes" },
    { name: "tfg-robotica", path: "D:\\uni\\tfg-robotica" },
  ];

  it("lists name matches before path matches, each in the given order", () => {
    expect(matchRecentProjects(entries, "TFG").map((entry) => entry.name)).toEqual(["tfg-robotica", "notes"]);
  });

  it("returns everything for blank text", () => {
    expect(matchRecentProjects(entries, " ")).toHaveLength(3);
  });
});

describe("nextPromptIndex", () => {
  beforeEach(() => localStorage.clear());

  it("never repeats the previous visit's prompt", () => {
    const first = nextPromptIndex(() => 0);
    const second = nextPromptIndex(() => 0);
    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it("stays within the prompts of a slot", () => {
    expect(nextPromptIndex(() => 0.999)).toBeLessThan(PROMPTS_PER_SLOT);
  });
});

describe("planSetup", () => {
  const ready = {
    git: { state: "available" as const, version: "2.50.0", isRechecking: false },
    identity: { name: "Luis", email: "luis@example.com" },
    accounts: [{ id: "github:luis", kind: "github" as const, login: "luis", source: "connection" as const, server: null }],
  };

  it("is complete when Git runs, the identity is set and an account is connected", () => {
    const plan = planSetup(ready);
    expect(plan).toMatchObject({ gitBlocked: false, identityMissing: false, requiredLeft: 0, complete: true });
    expect(nextSetupStep(plan)).toBeNull();
  });

  it("blocks on a missing or unusable Git, but not while it is still being checked", () => {
    expect(planSetup({ ...ready, git: { state: "missing", version: null, isRechecking: false } }).gitBlocked).toBe(true);
    expect(planSetup({ ...ready, git: { state: "unusable", version: null, isRechecking: false } }).gitBlocked).toBe(true);
    expect(planSetup({ ...ready, git: { state: "checking", version: null, isRechecking: false } }).gitBlocked).toBe(false);
  });

  it("needs both name and email, and says nothing before the identity is read", () => {
    expect(planSetup({ ...ready, identity: { name: "Luis", email: " " } }).identityMissing).toBe(true);
    expect(planSetup({ ...ready, identity: null }).identityMissing).toBe(false);
  });

  it("leaves the account optional and points at the first step not done", () => {
    const plan = planSetup({ ...ready, identity: { name: "", email: "" }, accounts: [] });
    expect(plan.requiredLeft).toBe(1);
    expect(plan.complete).toBe(false);
    expect(nextSetupStep(plan)?.id).toBe("identity");
    expect(nextSetupStep(planSetup({ ...ready, accounts: [] }))?.id).toBe("account");
  });
});

describe("groupAccountsByKind", () => {
  it("gathers an account and a token on one provider into one group, keeping order", () => {
    const groups = groupAccountsByKind([
      { id: "github:luis", kind: "github", login: "luis", source: "connection", server: null },
      { id: "gitlab:luis", kind: "gitlab", login: "luis", source: "connection", server: null },
      { id: "github:token", kind: "github", login: "luis-bot", source: "token", server: null },
    ]);
    expect(groups.map((group) => [group.kind, group.accounts.map((account) => account.login)])).toEqual([
      ["github", ["luis", "luis-bot"]],
      ["gitlab", ["luis"]],
    ]);
  });
});

describe("shortGitVersion", () => {
  it("keeps the major and minor release only", () => {
    expect(shortGitVersion("2.55.0.windows.3")).toBe("2.55");
    expect(shortGitVersion("2.50.0")).toBe("2.50");
    expect(shortGitVersion("unknown")).toBe("unknown");
  });
});

describe("accountChoiceParts", () => {
  const connection = { id: "gitlab:cli.1", kind: "gitlab" as const, login: "martinezelx", source: "connection" as const, server: null };
  const token = { id: "gitlab:token.1", kind: "gitlab" as const, login: "martinezelx", source: "token" as const, server: null };
  const company = { id: "gitlab-acme:token.2", kind: "gitlab" as const, login: "luis", source: "token" as const, server: "git.acme.dev" };

  it("names the source when an account and a token share a login", () => {
    expect(accountChoiceParts(connection, [connection, token])).toEqual({ login: "martinezelx", showSource: true, server: null });
  });

  it("names the server only when the accounts are on different ones", () => {
    expect(accountChoiceParts(company, [token, company]).server).toBe("git.acme.dev");
    expect(accountChoiceParts(token, [token, company]).server).toBeNull();
  });
});

describe("readHomeAccounts", () => {
  const providers = [
    { id: "github", host: "github.com", kind: "github" as const, builtIn: true },
    { id: "gitlab", host: "gitlab.com", kind: "gitlab" as const, builtIn: true },
    { id: "gitlab-acme", host: "git.acme.dev", kind: "gitlab" as const, builtIn: false },
  ];
  const account = (id: string, provider: string, host: string, available: boolean) => ({
    id, provider, host, login: "luis", avatarDataUrl: null, available,
  });

  it("knows nothing until the receipt is read", () => {
    expect(readHomeAccounts(null, false)).toEqual({ accounts: null, pendingKinds: [] });
  });

  it("keeps usable accounts, telling a token from a connection and a company server from the public host", () => {
    const result = readHomeAccounts({
      providers,
      busy: false,
      accounts: [
        account("github:luis", "github", "github.com", true),
        account("gitlab-acme:token.luis", "gitlab-acme", "git.acme.dev", true),
        account("gitlab:token.old", "gitlab", "gitlab.com", false),
      ],
    }, true);
    expect(result.pendingKinds).toEqual([]);
    expect(result.accounts).toEqual([
      { id: "github:luis", kind: "github", login: "luis", source: "connection", server: null },
      { id: "gitlab-acme:token.luis", kind: "gitlab", login: "luis", source: "token", server: "git.acme.dev" },
    ]);
  });

  it("marks a provider pending while its saved connection is checked, but not one already usable", () => {
    const result = readHomeAccounts({
      providers,
      busy: true,
      accounts: [
        account("github:luis", "github", "github.com", true),
        account("github:token.bot", "github", "github.com", false),
        account("gitlab:token.luis", "gitlab", "gitlab.com", false),
      ],
    }, true);
    expect(result.pendingKinds).toEqual(["gitlab"]);
    expect(result.accounts?.map((item) => item.id)).toEqual(["github:luis"]);
  });

  it("stays unknown while checking with nothing listed yet", () => {
    expect(readHomeAccounts({ providers, busy: true, accounts: [] }, true).accounts).toBeNull();
    expect(readHomeAccounts({ providers, busy: false, accounts: [] }, true).accounts).toEqual([]);
  });
});
