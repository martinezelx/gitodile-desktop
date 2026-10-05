import { afterEach, expect, it, vi } from "vitest";
import { cloneSourceSummary, cloneSuggestedName, createCloneSourceAccess, githubCloneAddress, hostingCloneAddress } from "./sourceAccess";

afterEach(() => vi.useRealTimers());
it("only probes complete, secret-free GitHub addresses", () => {
  expect(githubCloneAddress("https://github.com/team/project.git")).toEqual({ https: true });
  expect(githubCloneAddress("git@github.com:team/project.git")).toEqual({ https: false });
  expect(githubCloneAddress("ssh://git@github.com/team/project")).toEqual({ https: false });
  for (const source of ["https://github.com/team", "https://github.com.evil.test/team/project", "https://token@github.com/team/project",
    "https://github.com/team/project?token=secret", "https://github.com/team/project#secret", "C:\\projects", "--upload-pack=evil"]) {
    expect(githubCloneAddress(source)).toBeNull();
  }
  expect(cloneSourceSummary("https://alice:secret@example.test/team/project.git?token=secret")).toBe("https://example.test/team/project.git");
  expect(cloneSuggestedName("https://example.test/team/r%C3%A9po.git")).toBe("répo");
});

it("redacts malformed URL credentials and preserves local filename punctuation", () => {
  for (const source of ["https://alice:secret@", "https://alice:secret@host:invalid/project?token=secret"]) {
    expect(cloneSourceSummary(source)).not.toContain("secret");
  }
  for (const source of ["C:\\projects\\my#project.git", "/projects/my#project.git", "my?project.git"]) {
    expect(cloneSourceSummary(source)).toBe(source);
    expect(cloneSuggestedName(source)).toBe(source === "my?project.git" ? "my?project" : "my#project");
  }
});

it("debounces edits, cancels the exact request and rejects late identities and results", async () => {
  vi.useFakeTimers();
  let finish!: (status: "accessible") => void;
  const checkSource = vi.fn().mockImplementationOnce(() => new Promise<"accessible">(resolve => { finish = resolve; }))
    .mockResolvedValueOnce("unavailable");
  const cancelSourceCheck = vi.fn(async () => undefined);
  const controller = createCloneSourceAccess({ checkSource, cancelSourceCheck });
  const first = "https://github.com/team/one";
  controller.update(first, "github:token.one");
  await vi.advanceTimersByTimeAsync(300);
  controller.update(first, "github:token.two");
  await vi.advanceTimersByTimeAsync(550);
  expect(checkSource).toHaveBeenCalledTimes(1);
  expect(checkSource.mock.calls[0].slice(0, 2)).toEqual([first, "github:token.two"]);
  controller.update("https://github.com/team/two", null);
  expect(cancelSourceCheck).toHaveBeenCalledWith(checkSource.mock.calls[0][2]);
  finish("accessible");
  await vi.advanceTimersByTimeAsync(550);
  expect(controller.snapshot()).toMatchObject({ source: "https://github.com/team/two", accountId: null, status: "unavailable" });
  controller.cancel();
  await vi.advanceTimersByTimeAsync(1000);
  expect(checkSource).toHaveBeenCalledTimes(2);
  expect(controller.snapshot().status).toBe("idle");
  controller.reset();
  expect(controller.snapshot()).toEqual({ source: "", accountId: null, status: "idle" });
});

it("keeps transient failures unconfirmed and never runs from mere subscription", async () => {
  vi.useFakeTimers();
  const checkSource = vi.fn(async () => { throw new Error("network"); });
  const controller = createCloneSourceAccess({ checkSource, cancelSourceCheck: vi.fn(async () => undefined) });
  controller.subscribe(vi.fn());
  await vi.advanceTimersByTimeAsync(1000);
  expect(checkSource).not.toHaveBeenCalled();
  controller.update("https://github.com/team/project", null);
  await vi.advanceTimersByTimeAsync(550);
  expect(controller.snapshot().status).toBe("unconfirmed");
  controller.update("https://github.com/team/project?secret=x", null);
  await vi.advanceTimersByTimeAsync(1000);
  expect(checkSource).toHaveBeenCalledTimes(1);
  expect(controller.snapshot().status).toBe("idle");
  controller.reset();
  expect(controller.snapshot()).toEqual({ source: "", accountId: null, status: "idle" });
});

it("accepts nested GitLab sources and refuses cross-provider account reads", async () => {
  expect(hostingCloneAddress("https://gitlab.com/group/subgroup/project.git")).toEqual({ https: true, provider: "gitlab" });
  expect(hostingCloneAddress("git@gitlab.com:group/subgroup/project.git")).toEqual({ https: false, provider: "gitlab" });
  for (const source of ["https://gitlab.com.evil.test/team/project", "https://token@gitlab.com/team/project", "https://gitlab.com/team/project?token=x", "http://gitlab.com/team/project", "https://gitlab.com/group"]) expect(hostingCloneAddress(source)).toBeNull();
  vi.useFakeTimers();
  const checkSource = vi.fn(async () => "accessible" as const);
  const controller = createCloneSourceAccess({ checkSource, cancelSourceCheck: vi.fn(async () => undefined) });
  controller.update("https://gitlab.com/team/subgroup/project", "github:token.work");
  await vi.advanceTimersByTimeAsync(1000); expect(checkSource).not.toHaveBeenCalled();
  controller.update("https://gitlab.com/team/subgroup/project", "gitlab:token.42");
  await vi.advanceTimersByTimeAsync(550);
  expect(checkSource).toHaveBeenCalledWith("https://gitlab.com/team/subgroup/project", "gitlab:token.42", expect.any(String));
});
