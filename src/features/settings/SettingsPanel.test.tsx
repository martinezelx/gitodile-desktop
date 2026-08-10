import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsPort } from "./port";
import type { GitDiagnostics, GitUpdateStatus } from "./domain";

afterEach(cleanup);

function createPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
  return {
    readDiagnostics: vi.fn(async () => ({ state: "available", version: "2.45.0" }) as GitDiagnostics),
    checkUpdate: vi.fn(async () => ({ state: "up_to_date", cached: false }) as GitUpdateStatus),
    installGit: vi.fn(async () => ({ outcome: "started" as const, platform: "windows" as const, guidanceUrl: null })),
    updateGit: vi.fn(async () => ({ outcome: "started" as const })),
    getIdentity: vi.fn(async () => ({ name: null, email: null })),
    setIdentity: vi.fn(async () => undefined),
    openGuidance: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderPanel(
  port: SettingsPort,
  overrides: Partial<{ gitDiagnostics: GitDiagnostics | null; gitUpdateStatus: GitUpdateStatus | null }> = {},
) {
  return render(
    <LanguageProvider>
      <SettingsPanel
        theme="system"
        setTheme={vi.fn()}
        gitDiagnostics={overrides.gitDiagnostics ?? { state: "available", version: "2.45.0" }}
        gitUpdateStatus={overrides.gitUpdateStatus ?? null}
        onCheckGitUpdate={vi.fn(async () => undefined)}
        isCheckingGitUpdate={false}
        onRefreshGitDiagnostics={vi.fn(async () => undefined)}
        isRefreshingGitDiagnostics={false}
        reopenLastProject={false}
        setReopenLastProject={vi.fn()}
        confirmCloseProject={false}
        setConfirmCloseProject={vi.fn()}
        port={port}
      />
    </LanguageProvider>,
  );
}

describe("Settings panel native boundary", () => {
  it("reads and saves the Git identity through its port instead of calling Tauri", async () => {
    const port = createPort({ getIdentity: vi.fn(async () => ({ name: "Ada", email: "ada@example.com" })) });
    renderPanel(port);

    await userEvent.click(screen.getByRole("button", { name: "Git" }));
    await waitFor(() => expect(port.getIdentity).toHaveBeenCalledTimes(1));
    // A complete stored identity is shown as settled rather than as an open
    // form, so the panel offers "modify" before it offers "save".
    await userEvent.click(await screen.findByRole("button", { name: "Edit identity" }));

    const email = screen.getByRole("textbox", { name: "Email" });
    await userEvent.clear(email);
    await userEvent.type(email, "ada@lovelace.dev");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(port.setIdentity).toHaveBeenCalledWith({ name: "Ada", email: "ada@lovelace.dev" }),
    );
  });

  it("opens the platform guidance page through the port when Git cannot be installed directly", async () => {
    const port = createPort({
      installGit: vi.fn(async () => ({
        outcome: "guidance" as const,
        platform: "linux" as const,
        guidanceUrl: "https://git-scm.com/download/linux",
      })),
    });
    renderPanel(port, { gitDiagnostics: { state: "missing", version: null } });

    await userEvent.click(screen.getByRole("button", { name: "Git" }));
    await userEvent.click(await screen.findByRole("button", { name: "Install Git" }));

    await waitFor(() => expect(port.installGit).toHaveBeenCalledTimes(1));
    expect(port.openGuidance).toHaveBeenCalledWith("https://git-scm.com/download/linux");
  });
});
