import { describe, expect, it, vi } from "vitest";

import { createRepositoryController } from "./controller";
import type { RepositoryInfo } from "./domain";

const project = (epoch: string): RepositoryInfo => ({
  name: "repo", path: "/repo", selectedPath: "/repo", gitDir: "/repo/.git", commonGitDir: "/repo/.git",
  branch: "main", headState: "branch", kind: "repository", sessionEpoch: epoch,
});

describe("repository controller", () => {
  it("deduplicates one discovery per selected path and epoch", async () => {
    const open = vi.fn().mockResolvedValue(project("epoch-1"));
    const controller = createRepositoryController({ open });
    const request = { selectedPath: "/repo", sessionEpoch: "epoch-1" };
    const first = controller.open(request);
    const second = controller.open(request);
    expect(first).toBe(second);
    await first;
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a failed open attempt", async () => {
    const open = vi.fn().mockRejectedValueOnce(new Error("missing")).mockResolvedValueOnce(project("epoch-2"));
    const controller = createRepositoryController({ open });
    await expect(controller.open({ selectedPath: "/missing" })).rejects.toThrow("missing");
    await expect(controller.open({ selectedPath: "/missing" })).resolves.toEqual(project("epoch-2"));
  });
});
