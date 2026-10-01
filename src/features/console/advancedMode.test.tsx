import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { ConsoleAdvancedModeSetting, useConsoleAdvancedMode } from "./advancedMode";
import type { ConsoleModes, ConsolePort } from "./port";

afterEach(cleanup);

function fakePort(initial: ConsoleModes, failSaves = false) {
  let stored = { ...initial };
  const save = (change: Partial<ConsoleModes>) => failSaves
    ? Promise.reject(new Error("disk full"))
    : Promise.resolve((stored = { ...stored, ...change }));
  return {
    getSettings: vi.fn(async () => stored),
    setAdvancedMode: vi.fn(({ enabled }: { enabled: boolean }) => save({ advancedMode: enabled })),
    setConfirmChanges: vi.fn(({ enabled }: { enabled: boolean }) => save({ confirmChanges: enabled })),
  };
}

function Harness({ port }: { port: ReturnType<typeof fakePort> }): React.JSX.Element {
  const state = useConsoleAdvancedMode(port as unknown as ConsolePort);
  return <><ConsoleAdvancedModeSetting state={state} /><output>{`${state.advancedMode}/${state.confirmChanges}`}</output></>;
}

function renderSetting(port: ReturnType<typeof fakePort>) {
  render(<LanguageProvider><Harness port={port} /></LanguageProvider>);
  return (name: string) => screen.getByRole("radio", { name });
}

describe("console mode settings", () => {
  it("shows the three modes as one group with the current one checked", async () => {
    const port = fakePort({ advancedMode: true, confirmChanges: true });
    const mode = renderSetting(port);
    await waitFor(() => expect(screen.getByText("true/true")).toBeInTheDocument());
    expect(screen.getByRole("radiogroup", { name: "Console mode" })).toBeInTheDocument();
    expect(mode("Read-only")).toHaveAttribute("aria-checked", "false");
    expect(mode("Advanced")).toHaveAttribute("aria-checked", "true");
    expect(mode("Advanced")).toHaveAccessibleDescription("Can also change the project and its remote copy, showing each change and asking before it runs.");
    expect(mode("Root")).toHaveAttribute("aria-checked", "false");
    // One Tab stop: only the chosen card is in the tab order.
    expect(mode("Advanced")).toHaveAttribute("tabindex", "0");
    expect(mode("Root")).toHaveAttribute("tabindex", "-1");
    expect(document.querySelectorAll(".console-mode__check")).toHaveLength(1);
  });

  it("asks before permitting more, and only then saves", async () => {
    const port = fakePort({ advancedMode: false, confirmChanges: true });
    const user = userEvent.setup();
    const mode = renderSetting(port);
    await waitFor(() => expect(port.getSettings).toHaveBeenCalledTimes(1));

    await user.click(mode("Advanced"));
    expect(screen.getByRole("dialog", { name: "Switch to advanced mode?" })).toHaveTextContent("Commands that rewrite saved history or can discard work stay unavailable.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(port.setAdvancedMode).not.toHaveBeenCalled();
    expect(mode("Read-only")).toHaveAttribute("aria-checked", "true");

    // Straight from read-only to root: one dialog, both settings.
    await user.click(mode("Root"));
    const dialog = screen.getByRole("dialog", { name: "Switch to root mode?" });
    expect(dialog).toHaveTextContent("including git push");
    expect(dialog).toHaveTextContent("still prints what each one does");
    await user.click(screen.getByRole("button", { name: "Switch to root" }));
    await waitFor(() => expect(screen.getByText("true/false")).toBeInTheDocument());
    expect(port.setAdvancedMode).toHaveBeenCalledWith({ enabled: true, confirmed: true });
    expect(port.setConfirmChanges).toHaveBeenCalledWith({ enabled: false, confirmed: true });
    expect(mode("Root")).toHaveAttribute("aria-checked", "true");
  });

  it("permits less at once: root to advanced, advanced to read-only", async () => {
    const port = fakePort({ advancedMode: true, confirmChanges: false });
    const user = userEvent.setup();
    const mode = renderSetting(port);
    await waitFor(() => expect(screen.getByText("true/false")).toBeInTheDocument());

    await user.click(mode("Advanced"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(port.setConfirmChanges).toHaveBeenCalledWith({ enabled: true, confirmed: false });
    await waitFor(() => expect(screen.getByText("true/true")).toBeInTheDocument());

    await user.click(mode("Read-only"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(port.setAdvancedMode).toHaveBeenCalledWith({ enabled: false, confirmed: false });
    await waitFor(() => expect(screen.getByText("false/true")).toBeInTheDocument());
  });

  it("from read-only with confirmations off, advanced turns confirmations on first", async () => {
    const port = fakePort({ advancedMode: false, confirmChanges: false });
    const user = userEvent.setup();
    const mode = renderSetting(port);
    await waitFor(() => expect(port.getSettings).toHaveBeenCalled());
    await user.click(mode("Advanced"));
    await user.click(screen.getByRole("button", { name: "Switch to advanced" }));
    await waitFor(() => expect(screen.getByText("true/true")).toBeInTheDocument());
    const order = [...port.setConfirmChanges.mock.invocationCallOrder, ...port.setAdvancedMode.mock.invocationCallOrder];
    expect(order[0]).toBeLessThan(order[1]);
  });

  it("stays as it was and says so when a mode can't be saved", async () => {
    const port = fakePort({ advancedMode: false, confirmChanges: true }, true);
    const user = userEvent.setup();
    const mode = renderSetting(port);
    await waitFor(() => expect(port.getSettings).toHaveBeenCalled());
    await user.click(mode("Advanced"));
    await act(async () => { await user.click(screen.getByRole("button", { name: "Switch to advanced" })); });
    expect(await screen.findByRole("alert")).toHaveTextContent("The setting couldn't be saved.");
    expect(mode("Read-only")).toHaveAttribute("aria-checked", "true");
  });
});
