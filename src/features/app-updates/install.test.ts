import { describe, expect, it, vi } from "vitest";

import { registerInstallParticipant } from "../../runtime/install";
import { installReadyUpdate } from "./install";
import type { AppUpdatesPort } from "./port";

function port(install: AppUpdatesPort["install"]): AppUpdatesPort {
  return {
    readState: vi.fn(),
    readStartupConfirmation: vi.fn(),
    check: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn(),
    install,
  };
}

describe("application update install preparation", () => {
  it("suspends renderer work before native admission and restores it on failure", async () => {
    const order: string[] = [];
    const unregister = registerInstallParticipant({
      id: "app-update-install-test",
      label: "test background work",
      suspend() {
        order.push("suspend");
        return () => order.push("resume");
      },
    });
    const install = vi.fn(async () => {
      order.push("native");
      return { kind: "failed", error: {
        code: "install_handoff_failed",
        stage: "install",
        retryable: true,
      } } as const;
    });
    try {
      const result = await installReadyUpdate(port(install), "candidate-opaque");
      expect(result.kind).toBe("submitted");
      expect(order).toEqual(["suspend", "native", "resume"]);
      expect(install).toHaveBeenCalledWith("candidate-opaque", {
        protectedCount: expect.any(Number),
        blockers: [],
      });
    } finally {
      unregister();
    }
  });
});
