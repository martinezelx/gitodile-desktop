import React, { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import { APP_CHANGELOG, CURRENT_APP_RELEASE } from "./appRelease";
import { ChangelogDialog } from "./ChangelogDialog";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderDialog(setOpen = vi.fn()): void {
  render(
    <LanguageProvider>
      <ChangelogDialog isOpen setOpen={setOpen} />
    </LanguageProvider>,
  );
}

/** The real shape the dialog lives in: something focusable opens it, and
 * closing has to hand focus back to that thing rather than to the document. */
function TriggerAndDialog(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <LanguageProvider>
      <button type="button" onClick={() => setIsOpen(true)}>v0.1.0</button>
      <ChangelogDialog isOpen={isOpen} setOpen={setIsOpen} />
    </LanguageProvider>
  );
}

describe("Changelog dialog", () => {
  it("renders nothing while closed", () => {
    render(
      <LanguageProvider>
        <ChangelogDialog isOpen={false} setOpen={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists every bundled release with its channel, date, and notes", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "What's new" });
    const releases = [...dialog.querySelectorAll(".changelog-release")];
    expect(releases).toHaveLength(APP_CHANGELOG.length);

    for (const [index, release] of APP_CHANGELOG.entries()) {
      const rendered = releases[index] as HTMLElement;
      expect(within(rendered).getByRole("heading", { name: `v${release.version}` })).toBeInTheDocument();
      expect(rendered).toHaveTextContent(release.channel);
      expect(rendered.querySelector("time")).toHaveAttribute("dateTime", release.date);
      expect(rendered.querySelectorAll(".changelog-release__notes li")).toHaveLength(release.noteIds.length);
    }
  });

  it("marks the release the user is actually running", () => {
    renderDialog();

    const current = screen.getByText("You are running this");
    expect(current).toHaveClass("changelog-release__current");
    expect(current.closest(".changelog-release")).toHaveTextContent(`v${CURRENT_APP_RELEASE.version}`);
  });

  it("localizes the heading, the running-version marker, and the notes", () => {
    localStorage.setItem("gitodrile-language", "es");
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Novedades" });
    expect(within(dialog).getByText("Estás usando esta")).toBeInTheDocument();
    expect(within(dialog).getByText(/Consulta la línea de versión actual/)).toBeInTheDocument();
  });

  it("closes from the close button, Escape, and the backdrop", async () => {
    const setOpen = vi.fn();
    renderDialog(setOpen);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(setOpen).toHaveBeenCalledWith(false);

    setOpen.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(setOpen).toHaveBeenCalledWith(false);

    setOpen.mockClear();
    // The backdrop closes on mousedown; the dialog surface stops it there, so
    // a drag that starts inside and ends outside never dismisses the notes.
    await userEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(setOpen).toHaveBeenCalledWith(false);

    setOpen.mockClear();
    await userEvent.click(screen.getByRole("heading", { name: "What's new" }));
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("returns focus to whatever opened it", async () => {
    render(<TriggerAndDialog />);
    const trigger = screen.getByRole("button", { name: "v0.1.0" });

    await userEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "What's new" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
