import React, { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import { APP_CHANGELOG, CURRENT_APP_RELEASE, appReleaseChannel } from "./appRelease";
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
      <button type="button" onClick={() => setIsOpen(true)}>v{__APP_VERSION__}</button>
      <ChangelogDialog isOpen={isOpen} setOpen={setIsOpen} />
    </LanguageProvider>
  );
}

describe("Changelog dialog", () => {
  it("derives stable and preview channels from the release version", () => {
    expect(appReleaseChannel("0.1.0")).toBe("stable");
    expect(appReleaseChannel("0.2.0-preview.1")).toBe("preview");
    expect(() => appReleaseChannel("0.2.0-alpha.1")).toThrow(/Unsupported GitOdile release version/);
    expect(() => appReleaseChannel("0.2.0-preview.0")).toThrow(/Unsupported GitOdile release version/);
    expect(() => appReleaseChannel("0.2.0-preview.01")).toThrow(/Unsupported GitOdile release version/);
    expect(() => appReleaseChannel("01.2.0")).toThrow(/Unsupported GitOdile release version/);
    expect(() => appReleaseChannel("0.2.0+build.7")).toThrow(/Unsupported GitOdile release version/);
  });
  it("renders nothing while closed", () => {
    render(
      <LanguageProvider>
        <ChangelogDialog isOpen={false} setOpen={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps bundled notes offline and checks remotely only after the explicit action", async () => {
    const onCheckForUpdates = vi.fn();
    render(<LanguageProvider><ChangelogDialog isOpen setOpen={vi.fn()} onCheckForUpdates={onCheckForUpdates} /></LanguageProvider>);
    expect(onCheckForUpdates).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check for GitOdile updates" }));
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it("lists every bundled release with its channel, date, and notes", async () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "What's new" });
    const releases = [...dialog.querySelectorAll(".changelog-release")];
    expect(releases).toHaveLength(APP_CHANGELOG.length);

    for (const [index, release] of APP_CHANGELOG.entries()) {
      const rendered = releases[index] as HTMLElement;
      expect(within(rendered).getByRole("heading", { name: `v${release.version}` })).toBeInTheDocument();
      expect(rendered).toHaveTextContent(release.channel);
      if (release.date === null) {
        expect(rendered.querySelector("time")).toBeNull();
      } else {
        expect(rendered.querySelector("time")).toHaveAttribute("dateTime", release.date);
      }
      await userEvent.click(within(rendered).getByRole("button"));
      expect(rendered.querySelectorAll(".changelog-release__notes li")).toHaveLength(release.noteIds.length);
    }
  });

  it("marks the release the user is actually running", () => {
    renderDialog();

    const current = screen.getByText("You are running this");
    expect(current).toHaveClass("changelog-release__current");
    expect(current.closest(".changelog-release")).toHaveTextContent(`v${CURRENT_APP_RELEASE.version}`);
  });

  it("keeps each release compact until its notes are requested", async () => {
    renderDialog();
    const currentHeading = screen.getByRole("heading", { name: `v${CURRENT_APP_RELEASE.version}` });
    const disclosure = currentHeading.closest("button");

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(disclosure as HTMLElement);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
  });

  it("localizes the heading, the running-version marker, and the notes", async () => {
    localStorage.setItem("gitodile-language", "es");
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Novedades" });
    expect(within(dialog).getByText("Estás usando esta")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /v0\.2\.0-preview\.1/ }));
    expect(within(dialog).getByText(/GitOdile utiliza ahora/)).toBeInTheDocument();
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
    const trigger = screen.getByRole("button", { name: `v${__APP_VERSION__}` });

    await userEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "What's new" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
