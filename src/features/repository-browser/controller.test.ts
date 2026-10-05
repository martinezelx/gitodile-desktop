import { describe, expect, it, vi } from "vitest";
import { createRepositoryBrowserController } from "./controller";
import type { RepositoryPage } from "./domain";

const page = (accountId: string, number = 1): RepositoryPage => ({ accountId, page: number, repositories: [], nextPage: 2 });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe("repository discovery ownership", () => {
  it("requires intent, isolates caches, and rejects an old account's late private result", async () => {
    const waiting = deferred<RepositoryPage>();
    const list = vi.fn().mockReturnValueOnce(waiting.promise).mockResolvedValueOnce(page("github:token.work"));
    const cancel = vi.fn(async () => undefined);
    const controller = createRepositoryBrowserController({ list, cancel });
    controller.select("github:personal"); expect(list).not.toHaveBeenCalled();
    const old = controller.load(); controller.select("github:token.work");
    expect(controller.snapshot().page).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
    await controller.load(); waiting.resolve(page("github:personal")); await old;
    expect(controller.snapshot().page?.accountId).toBe("github:token.work");
    controller.select("github:personal"); expect(controller.snapshot().page).toBeNull();
    controller.select("github:token.work"); expect(controller.snapshot().page?.accountId).toBe("github:token.work");
    expect(list).toHaveBeenCalledTimes(2);
    controller.reconcile([]); expect(controller.snapshot().page).toBeNull();
  });
  it("cancels reads and drops cached private data on permission or authentication failure", async () => {
    const waiting = deferred<RepositoryPage>();
    const list = vi.fn().mockResolvedValueOnce(page("github:a")).mockReturnValueOnce(waiting.promise);
    const controller = createRepositoryBrowserController({ list, cancel: vi.fn(async () => undefined) });
    controller.select("github:a"); await controller.load();
    const refreshing = controller.load(); waiting.reject({ code: "authentication_failed" }); await refreshing;
    expect(controller.snapshot().page).toBeNull(); expect(controller.snapshot().error).toEqual({ code: "authentication_failed" });
    controller.select("github:b"); controller.select("github:a"); expect(controller.snapshot().page).toBeNull();
  });
  it("rejects mismatched response identities and ignores results after closure", async () => {
    const waiting = deferred<RepositoryPage>();
    const list = vi.fn().mockResolvedValueOnce(page("github:wrong")).mockReturnValueOnce(waiting.promise);
    const controller = createRepositoryBrowserController({ list, cancel: vi.fn(async () => undefined) });
    controller.select("github:a"); await controller.load(); expect(controller.snapshot().page).toBeNull();
    const loading = controller.load(); controller.cancel(); waiting.resolve(page("github:a")); await loading;
    expect(controller.snapshot().page).toBeNull(); expect(controller.snapshot().pending).toBe(false);
  });
});
