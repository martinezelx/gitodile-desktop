import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { ConsoleConfirmChangesSetting, useConsoleConfirmChanges } from "./confirmChanges";
import type { ConsoleModes, ConsolePort } from "./port";

afterEach(cleanup);

function fakePort(initial: ConsoleModes, failSaves = false) {
  let stored = { ...initial };
  return {
    getSettings: vi.fn(async () => stored),
    setConfirmChanges: vi.fn(({ enabled }: { enabled: boolean }) => failSaves
      ? Promise.reject(new Error("disk full"))
      : Promise.resolve((stored = { confirmChanges: enabled }))),
  };
}

function Harness({ port }: { port: ReturnType<typeof fakePort> }): React.JSX.Element {
  const state = useConsoleConfirmChanges(port as unknown as ConsolePort);
  return <><ConsoleConfirmChangesSetting state={state} /><output>{`${state.confirmChanges}`}</output></>;
}

function renderSetting(port: ReturnType<typeof fakePort>) {
  render(<LanguageProvider><Harness port={port} /></LanguageProvider>);
  return () => screen.getByRole("switch", { name: "Confirm each change" });
}

describe("console change confirmations setting", () => {
  it("is one switch, on by default", async () => {
    const port = fakePort({ confirmChanges: true });
    const toggle = renderSetting(port);
    await waitFor(() => expect(port.getSettings).toHaveBeenCalledTimes(1));
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/ask before it runs/)).toBeInTheDocument();
  });

  it("asks before turning confirmations off, and only then saves", async () => {
    const port = fakePort({ confirmChanges: true });
    const user = userEvent.setup();
    const toggle = renderSetting(port);
    await waitFor(() => expect(port.getSettings).toHaveBeenCalledTimes(1));

    await user.click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Turn off change confirmations?" });
    expect(dialog).toHaveTextContent("including git push");
    expect(dialog).toHaveTextContent("Commands that rewrite saved history or can discard work stay unavailable.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(port.setConfirmChanges).not.toHaveBeenCalled();
    expect(toggle()).toHaveAttribute("aria-checked", "true");

    await user.click(toggle());
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(screen.getByText("false")).toBeInTheDocument());
    expect(port.setConfirmChanges).toHaveBeenCalledWith({ enabled: false, confirmed: true });
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("turns them back on at once", async () => {
    const port = fakePort({ confirmChanges: false });
    const user = userEvent.setup();
    const toggle = renderSetting(port);
    await waitFor(() => expect(screen.getByText("false")).toBeInTheDocument());

    await user.click(toggle());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(port.setConfirmChanges).toHaveBeenCalledWith({ enabled: true, confirmed: false });
    await waitFor(() => expect(screen.getByText("true")).toBeInTheDocument());
  });

  it("stays as it was and says so when the setting can't be saved", async () => {
    const port = fakePort({ confirmChanges: true }, true);
    const user = userEvent.setup();
    const toggle = renderSetting(port);
    await waitFor(() => expect(port.getSettings).toHaveBeenCalled());
    await user.click(toggle());
    await act(async () => { await user.click(screen.getByRole("button", { name: "Turn off" })); });
    expect(await screen.findByRole("alert")).toHaveTextContent("The setting couldn't be saved.");
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });
});
