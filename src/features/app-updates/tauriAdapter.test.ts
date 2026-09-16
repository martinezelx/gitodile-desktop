import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { appUpdatesPort } from "./tauriAdapter";

describe("app update Tauri adapter", () => {
  beforeEach(() => invoke.mockReset());

  it("exposes only opaque ids and the closed check source", async () => {
    invoke.mockResolvedValue({ kind: "idle" });
    await appUpdatesPort.check("manual");
    await appUpdatesPort.download("candidate-opaque");
    await appUpdatesPort.cancel("operation-opaque");
    await appUpdatesPort.readChannel();
    await appUpdatesPort.setChannel("preview");
    expect(invoke.mock.calls).toEqual([
      ["check_app_update", { source: "manual" }],
      ["download_app_update", { candidateId: "candidate-opaque" }],
      ["cancel_app_update", { operationId: "operation-opaque" }],
      ["get_app_update_channel"],
      ["set_app_update_channel", { channel: "preview" }],
    ]);
    const serialized = JSON.stringify(invoke.mock.calls);
    for (const forbidden of ["url", "feed", "publicKey", "signature", "target", "path", "headers", "endpoint"]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });

  it("sends consent and a bounded draft summary without renderer owner ids", async () => {
    invoke.mockResolvedValue({ kind: "installing", candidateId: "candidate-opaque" });
    await appUpdatesPort.install("candidate-opaque", {
      protectedCount: 2,
      blockers: ["version message"],
    });
    expect(invoke).toHaveBeenCalledWith("install_app_update", {
      request: {
        candidateId: "candidate-opaque",
        consent: true,
        drafts: { protectedCount: 2, blockers: ["version message"] },
      },
    });
  });
});
