import { describe, expect, it } from "vitest";
import { acceptsRepositoryInvalidation } from "./repositoryInvalidation";
import type { ProjectSession } from "./projectSessions";

const session = { id: "/repo", epoch: "new" } as ProjectSession;

describe("repository invalidation envelope", () => {
  it("rejects an old incarnation and non-monotonic callbacks", () => {
    expect(acceptsRepositoryInvalidation(session, { projectId: "/repo", sessionEpoch: "old", sequence: 2, kind: "worktree" }, 0)).toBe(false);
    expect(acceptsRepositoryInvalidation(session, { projectId: "/repo", sessionEpoch: "new", sequence: 2, kind: "worktree" }, 2)).toBe(false);
    expect(acceptsRepositoryInvalidation(session, { projectId: "/repo", sessionEpoch: "new", sequence: 3, kind: "worktree" }, 2)).toBe(true);
  });
});
