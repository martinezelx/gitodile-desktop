import React, { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import HIGHLIGHT_ICON_NAMES from "../../docs/release/highlights/icons.json";
import {
  APP_CHANGELOG,
  CURRENT_APP_RELEASE,
  HIGHLIGHT_ICONS,
  buildAppChangelog,
  compareAppReleaseVersions,
} from "./appRelease";
import { ChangelogDialog, type AppUpdateStatusLine } from "./ChangelogDialog";

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
      <button type="button" onClick={() => setIsOpen(true)}>{__APP_VERSION__}</button>
      <ChangelogDialog isOpen={isOpen} setOpen={setIsOpen} />
    </LanguageProvider>
  );
}

describe("Changelog dialog", () => {
  it("draws every glyph the release scripts accept, and no other", () => {
    expect([...HIGHLIGHT_ICONS]).toEqual(HIGHLIGHT_ICON_NAMES);
  });

  it("assembles the changelog from the highlights files, newest first, always listing the running build", () => {
    const files = [
      { version: "0.1.0", date: "2026-08-27", highlights: [{ id: "a", icon: "tag" as const, en: "A", es: "A (es)" }] },
      { version: "0.2.10", date: "2026-09-15", highlights: [] },
      { version: "0.2.9", date: "2026-09-14", highlights: [{ id: "b", icon: "bug" as const, en: "B", es: "B (es)" }] },
    ];
    // A pipeline-only release is left out; the running build never is.
    expect(buildAppChangelog(files, "0.2.9").map((entry) => entry.version)).toEqual(["0.2.9", "0.1.0"]);
    expect(buildAppChangelog(files, "0.2.10").map((entry) => entry.version)).toEqual(["0.2.10", "0.2.9", "0.1.0"]);
    // A checkout between releases has no file yet: listed, undated, empty.
    const between = buildAppChangelog(files, "0.2.11");
    expect(between[0]).toEqual({ version: "0.2.11", date: null, highlights: [] });
    // The tag's date wins over the day the branch was cut; a version whose
    // tag the build did not see keeps the file's date.
    const dated = buildAppChangelog(files, "0.2.9", { "0.2.9": "2026-09-16" });
    expect(dated.map((entry) => [entry.version, entry.date])).toEqual([["0.2.9", "2026-09-16"], ["0.1.0", "2026-08-27"]]);
    for (const entry of APP_CHANGELOG) {
      if (entry.version in __APP_RELEASE_DATES__) expect(entry.date).toBe(__APP_RELEASE_DATES__[entry.version]);
    }
    expect(compareAppReleaseVersions("0.2.9", "0.2.10")).toBeLessThan(0);
    expect(compareAppReleaseVersions("0.2.12", "0.3.0")).toBeLessThan(0);
    expect(compareAppReleaseVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
    // The bundled changelog reads the real directory.
    expect(APP_CHANGELOG.map((entry) => entry.version)).toContain("0.1.0");
    expect(CURRENT_APP_RELEASE.version).toBe(__APP_VERSION__);
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
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it("lets the update state decide what the line under the title offers", async () => {
    const onCheckForUpdates = vi.fn();
    const onOpenUpdates = vi.fn();
    const renderWith = (updateStatus: AppUpdateStatusLine) => render(
      <LanguageProvider>
        <ChangelogDialog isOpen setOpen={vi.fn()} onCheckForUpdates={onCheckForUpdates} onOpenUpdates={onOpenUpdates} updateStatus={updateStatus} />
      </LanguageProvider>,
    );

    // Settled: the state, then the way to check.
    renderWith({ tone: "ok", label: "Up to date" });
    const line = screen.getByText("Up to date").closest("p") as HTMLElement;
    expect(within(line).getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
    cleanup();

    // Something to do: the state is the way in, with no second link. It
    // opens the update dialog without a new check, which would drop a
    // download that is ready to install.
    renderWith({ tone: "attention", label: "Ready to install" });
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ready to install" }));
    expect(onOpenUpdates).toHaveBeenCalledOnce();
    expect(onCheckForUpdates).not.toHaveBeenCalled();
    cleanup();

    // Already checking: nothing to ask for.
    renderWith({ tone: "busy", label: "Checking for updates…" });
    expect(screen.getByText("Checking for updates…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
  });

  it("lists every bundled release with its date and notes", async () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "What's new" });
    const current = dialog.querySelector(".changelog-current") as HTMLElement;
    const earlier = [...dialog.querySelectorAll(".changelog-release")] as HTMLElement[];
    expect(earlier).toHaveLength(APP_CHANGELOG.length - 1);

    const rendered = [current, ...earlier];
    const releases = [CURRENT_APP_RELEASE, ...APP_CHANGELOG.filter((release) => release !== CURRENT_APP_RELEASE)];
    for (const [index, release] of releases.entries()) {
      const element = rendered[index]!;
      expect(within(element).getByRole("heading", { name: release.version })).toBeInTheDocument();
      if (release.date === null) {
        expect(element.querySelector("time")).toBeNull();
      } else {
        expect(element.querySelector("time")).toHaveAttribute("dateTime", release.date);
      }
      if (index > 0) {
        await userEvent.click(within(element).getByRole("button"));
      }
      expect(element.querySelectorAll(".changelog-release__notes li")).toHaveLength(release.highlights.length);
      for (const highlight of release.highlights) {
        expect(within(element).getByText(highlight.en)).toBeInTheDocument();
      }
    }
  });

  it("marks the release the user is actually running", () => {
    renderDialog();

    const current = screen.getByText("Your version");
    expect(current).toHaveClass("changelog-release__current");
    expect(current.closest(".changelog-current")).toHaveTextContent(CURRENT_APP_RELEASE.version);
  });

  it("opens the running build's notes and keeps earlier releases to one counted line", async () => {
    renderDialog();
    const currentHeading = screen.getByRole("heading", { name: CURRENT_APP_RELEASE.version });
    // The running build is not a disclosure: its notes are the answer.
    expect(currentHeading.closest("button")).toBeNull();

    const earlier = APP_CHANGELOG.find((release) => release !== CURRENT_APP_RELEASE && release.highlights.length > 1);
    if (earlier === undefined) return;
    const disclosure = screen.getByRole("heading", { name: earlier.version }).closest("button") as HTMLElement;
    expect(disclosure).toHaveTextContent(`${earlier.highlights.length} changes`);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
  });

  it("localizes the heading, the running-version marker, and the notes", async () => {
    localStorage.setItem("gitodile-language", "es");
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Novedades" });
    expect(within(dialog).getByText("Tu versión")).toBeInTheDocument();
    // 0.1.0 always ships highlights; the running build may not (a
    // pipeline-only release), so the Spanish text is checked on the former.
    const first = APP_CHANGELOG.find((entry) => entry.version === "0.1.0")!;
    if (first !== CURRENT_APP_RELEASE) {
      await userEvent.click(within(dialog).getByRole("button", {
        name: (accessibleName) => accessibleName.includes("0.1.0"),
      }));
    }
    expect(within(dialog).getByText(first.highlights[0]!.es)).toBeInTheDocument();
    expect(within(dialog).queryByText(first.highlights[0]!.en)).toBeNull();
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
    const trigger = screen.getByRole("button", { name: __APP_VERSION__ });

    await userEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "What's new" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
