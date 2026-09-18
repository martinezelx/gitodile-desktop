import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { NotificationCenter } from "./NotificationCenter";
import { recordNotification, type AppNotification, type NotificationDetails } from "./domain";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.reducedMotion;
});

let nextId = 0;

function entry(details: NotificationDetails, read = false): AppNotification {
  nextId += 1;
  return {
    id: `n${nextId}`,
    createdAt: Date.now(),
    read,
    projectId: "/projects/alpha",
    projectName: "alpha",
    details,
  };
}

function renderCentre(overrides: Partial<React.ComponentProps<typeof NotificationCenter>> = {}) {
  const props = {
    notifications: [] as readonly AppNotification[],
    unreadCount: 0,
    isEnabled: true,
    onOpened: vi.fn(),
    onClear: vi.fn(),
    onDismiss: vi.fn(),
    onToggleEnabled: vi.fn(),
    onReviewTeamChanges: vi.fn(),
    onReviewAppUpdate: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(
      <LanguageProvider>
        <NotificationCenter {...props} />
      </LanguageProvider>,
    ),
  };
}

const teamChanges: NotificationDetails = {
  kind: "teamChangesAvailable",
  behind: 3,
  remoteCommit: "abc123",
};

describe("the titlebar notification centre", () => {
  it("names itself and its unread count for a screen reader", async () => {
    renderCentre({ notifications: [entry(teamChanges)], unreadCount: 1 });

    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("shows the accent dot only while something is unread, and no number", () => {
    const { rerender, props } = renderCentre({ unreadCount: 2 });
    expect(document.querySelector(".notification-center__dot")).not.toBeNull();
    // The count is gone from the glyph; only the accessible name carries it.
    expect(screen.getByRole("button", { name: /2 unread/ }).textContent).toBe("");

    rerender(
      <LanguageProvider>
        <NotificationCenter {...props} unreadCount={0} />
      </LanguageProvider>,
    );
    expect(document.querySelector(".notification-center__dot")).toBeNull();
  });

  it("marks everything read when the panel opens, and keeps showing which rows were unread", async () => {
    const onOpened = vi.fn();
    renderCentre({ notifications: [entry(teamChanges)], unreadCount: 1, onOpened });

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(onOpened).toHaveBeenCalledTimes(1);
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("3 newer project versions are available")).toBeInTheDocument();
    expect(within(panel).getByText("Unread", { exact: false })).toBeInTheDocument();
  });

  it("offers the review action for available project changes and closes on use", async () => {
    const onReviewTeamChanges = vi.fn();
    const notification = entry(teamChanges);
    renderCentre({ notifications: [notification], unreadCount: 1, onReviewTeamChanges });

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await userEvent.click(screen.getByRole("button", { name: "Review and get them" }));

    expect(onReviewTeamChanges).toHaveBeenCalledWith(notification);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers to open the update dialog for a newer app version and closes on use", async () => {
    const onReviewAppUpdate = vi.fn();
    const onReviewTeamChanges = vi.fn();
    renderCentre({
      notifications: [entry({ kind: "appUpdateAvailable", version: "0.3.0" })],
      unreadCount: 1,
      onReviewAppUpdate,
      onReviewTeamChanges,
    });

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("v0.3.0 is available")).toBeInTheDocument();
    expect(within(panel).getByText("Found by the startup check. Nothing has been downloaded.")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "View update" }));

    expect(onReviewAppUpdate).toHaveBeenCalledOnce();
    expect(onReviewTeamChanges).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gives a published notification no action", async () => {
    renderCentre({
      notifications: [
        entry({ kind: "changesPublished", versionCount: 2, destination: "origin/main" }, true),
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Published 2 saved versions")).toBeInTheDocument();
    expect(within(panel).getByText("Sent to origin/main.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Review and get them" })).not.toBeInTheDocument();
  });

  it("prefers the mapped reason over the generic sentence for a failed check", async () => {
    renderCentre({
      notifications: [entry({ kind: "remoteCheckFailed", reason: "Couldn't reach origin." })],
      unreadCount: 1,
    });

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Couldn't reach origin.")).toBeInTheDocument();
    expect(
      within(panel).queryByText("The last automatic check could not reach the remote project."),
    ).not.toBeInTheDocument();
  });

  it("removes a single entry without closing the panel", async () => {
    const onDismiss = vi.fn();
    const notification = entry(teamChanges);
    renderCentre({ notifications: [notification], unreadCount: 1, onDismiss });

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    await userEvent.click(within(panel).getByRole("button", { name: "Delete notification" }));

    expect(onDismiss).toHaveBeenCalledWith(notification);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  it("turns notifications back on from the panel, with the switch Settings uses", async () => {
    const onToggleEnabled = vi.fn();
    renderCentre({ isEnabled: false, onToggleEnabled });

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Notifications are off")).toBeInTheDocument();

    const toggle = within(panel).getByRole("switch", { name: "Enable notifications" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);

    expect(onToggleEnabled).toHaveBeenCalledWith(true);
    // The panel stays open, because turning it on is not a navigation.
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  it("still says it is switched off below a list it has stopped adding to, with the same way back", async () => {
    const onToggleEnabled = vi.fn();
    renderCentre({
      isEnabled: false,
      notifications: [entry(teamChanges, true)],
      onToggleEnabled,
    });

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Notifications are off")).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: "Recent notifications" })).toBeInTheDocument();

    // Telling someone about a setting without a route to it is the bug this
    // covers: the note used to appear here with no control beside it.
    await userEvent.click(within(panel).getByRole("switch", { name: "Enable notifications" }));
    expect(onToggleEnabled).toHaveBeenCalledWith(true);
  });

  it("keeps the settings route in the footer when the list is empty", async () => {
    const onOpenSettings = vi.fn();
    renderCentre({ onOpenSettings });

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Open notification settings" }),
    );

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides the switch, without removing it, once notifications are on", async () => {
    const { rerender, props } = renderCentre({ isEnabled: true });
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));

    // The wrapper holds the switch's place so the empty block does not resize
    // when it flips; `inert` takes the hidden control out of the tab order and
    // the accessibility tree.
    let wrapper = document.querySelector(".notification-center__empty-switch");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("inert");
    expect(wrapper?.className).toContain("notification-center__empty-switch--hidden");

    rerender(
      <LanguageProvider>
        <NotificationCenter {...props} isEnabled={false} />
      </LanguageProvider>,
    );
    wrapper = document.querySelector(".notification-center__empty-switch");
    expect(wrapper).not.toHaveAttribute("inert");
    expect(wrapper?.className).not.toContain("notification-center__empty-switch--hidden");
  });

  it("hands focus to the panel when Clear is pressed", async () => {
    renderCentre({ notifications: [entry(teamChanges, true)] });

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    await userEvent.click(within(panel).getByRole("button", { name: "Clear all" }));

    // In the app that click empties the list and disables the very button focus
    // was on; without the panel taking focus back, it falls to <body> and Tab
    // restarts at the top of the document. The store is a stub here, so what
    // this pins is the handover itself.
    expect(panel).toHaveFocus();
  });

  it("cannot clear an empty list", async () => {
    renderCentre();

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("dismisses on Escape and returns focus to the bell", async () => {
    renderCentre({ notifications: [entry(teamChanges)], unreadCount: 1 });
    const trigger = screen.getByRole("button", { name: /Notifications/ });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders what the store recorded, in the store's order", async () => {
    const list = recordNotification(
      recordNotification([], {
        id: "a",
        createdAt: 1,
        details: { kind: "changesPublished", versionCount: 1, destination: null },
        projectId: "/projects/alpha",
        projectName: "alpha",
      }),
      {
        id: "b",
        createdAt: 2,
        details: teamChanges,
        projectId: "/projects/alpha",
        projectName: "alpha",
      },
    );
    renderCentre({ notifications: list, unreadCount: 1 });

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    const rows = within(screen.getByRole("list", { name: "Recent notifications" })).getAllByRole(
      "listitem",
    );
    expect(rows[0]?.textContent).toContain("3 newer project versions are available");
    expect(rows[1]?.textContent).toContain("Published 1 saved version");
  });

  /** The movement itself is CSS. These assert when the dot is asked to move and
   * when it must not, which is the part with decisions in it. */
  function dotClass(): string {
    return document.querySelector(".notification-center__dot")?.className ?? "";
  }

  it("breathes when the unread count rises", () => {
    const { rerender } = renderCentre({ unreadCount: 0 });
    expect(dotClass()).not.toContain("notification-center__dot--arrive");

    rerender(
      <LanguageProvider>
        <NotificationCenter
          notifications={[]}
          unreadCount={1}
          isEnabled
          onOpened={vi.fn()}
          onClear={vi.fn()}
          onDismiss={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReviewTeamChanges={vi.fn()}
          onReviewAppUpdate={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(dotClass()).toContain("notification-center__dot--arrive");
  });

  it("does not breathe when the unread count only falls", () => {
    const { rerender } = renderCentre({ unreadCount: 3 });

    rerender(
      <LanguageProvider>
        <NotificationCenter
          notifications={[]}
          unreadCount={1}
          isEnabled
          onOpened={vi.fn()}
          onClear={vi.fn()}
          onDismiss={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReviewTeamChanges={vi.fn()}
          onReviewAppUpdate={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </LanguageProvider>,
    );

    // Reading the pile is not news. Only a rise is.
    expect(dotClass()).not.toContain("notification-center__dot--arrive");
  });

  it("stays still when pressed, like every other control in its row", async () => {
    const user = userEvent.setup();
    renderCentre({ unreadCount: 1 });

    await user.click(screen.getByRole("button", { name: /notification/i }));

    // A press gesture was built and removed on purpose: the bell borrows
    // `.titlebar-icon-button` so that it reads as one of the row, and it was
    // the only control there answering a press. This keeps it that way.
    expect(dotClass()).not.toContain("notification-center__dot--arrive");
  });

  /* The arrival class is cleared by `animationend`, and that cannot be asserted
   * here: jsdom never delivers the event to a React handler, even dispatched
   * natively and bubbling — verified with a scratch probe before this comment
   * was written. A test would assert a listener that never fires and pass for
   * the wrong reason, which is the failure mode task 101 was about. The
   * clearing is verified in a running browser instead. What is testable here is
   * the reason the clearing can be trusted to happen: the gesture is only ever
   * started when an animation will actually run. */
  it("does not breathe at all under the operating system's reduced motion", () => {
    // Defined rather than spied: jsdom has no `matchMedia` to spy on.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query }),
    });
    const { rerender } = renderCentre({ unreadCount: 0 });

    rerender(
      <LanguageProvider>
        <NotificationCenter
          notifications={[]}
          unreadCount={1}
          isEnabled
          onOpened={vi.fn()}
          onClear={vi.fn()}
          onDismiss={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReviewTeamChanges={vi.fn()}
          onReviewAppUpdate={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </LanguageProvider>,
    );

    // Suppressing the animation in CSS instead would leave the class with
    // nothing to clear it, stuck for the rest of the session.
    expect(dotClass()).not.toContain("notification-center__dot--arrive");

    Reflect.deleteProperty(window, "matchMedia");
  });

  it("does not breathe when GitOdile's reduced-motion setting is on", () => {
    document.documentElement.dataset.reducedMotion = "true";
    const { rerender } = renderCentre({ unreadCount: 0 });

    rerender(
      <LanguageProvider>
        <NotificationCenter
          notifications={[]}
          unreadCount={1}
          isEnabled
          onOpened={vi.fn()}
          onClear={vi.fn()}
          onDismiss={vi.fn()}
          onToggleEnabled={vi.fn()}
          onReviewTeamChanges={vi.fn()}
          onReviewAppUpdate={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(dotClass()).not.toContain("notification-center__dot--arrive");
  });
});
