import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { DiscardRecoveryRecord } from "./domain";
import { DiscardChangesDialog, type DiscardDialogRequest } from "./DiscardChangesDialog";
import type { ChangesController } from "./controller";

const record = (recoveryId: string, previewPath: string): DiscardRecoveryRecord => ({
  recoveryId,
  createdAtMs: 1756000000000,
  fileCount: 1,
  selectedPath: null,
  previewPaths: [previewPath],
  stateToken: `token-${recoveryId}`,
  availability: "restorable",
  restoresPreparedState: false,
});

function renderPicker(request: DiscardDialogRequest): void {
  // The picker only lists here; nothing is restored or deleted.
  const controller = {
    listDiscardRecoveries: vi.fn(async () => [record("newest", "a.txt"), record("older", "b.txt")]),
  } as unknown as ChangesController;
  render(
    <LanguageProvider>
      <DiscardChangesDialog
        request={request}
        projectPath="/repo"
        sessionEpoch="epoch"
        controller={controller}
        onClose={vi.fn()}
        onMutationCompleted={vi.fn()}
        onFinished={vi.fn()}
      />
    </LanguageProvider>,
  );
}

afterEach(cleanup);

describe("DiscardChangesDialog restore picker", () => {
  it("opens on the newest copy that can be restored", async () => {
    renderPicker({ mode: "restore", selectedPath: null });

    const options = await screen.findAllByRole("radio");
    expect(options[0]).toBeChecked();
    expect(options[1]).not.toBeChecked();
  });

  it("opens on the copy it was asked for, when that one can be restored", async () => {
    renderPicker({ mode: "restore", selectedPath: null, recoveryId: "older" });

    const options = await screen.findAllByRole("radio");
    expect(options[0]).not.toBeChecked();
    expect(options[1]).toBeChecked();
  });

  it("falls back to the newest when the asked-for copy is not offered", async () => {
    renderPicker({ mode: "restore", selectedPath: null, recoveryId: "gone" });

    const options = await screen.findAllByRole("radio");
    expect(options[0]).toBeChecked();
  });
});
