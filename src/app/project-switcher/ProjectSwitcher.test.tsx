import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import {
  ProjectQuickSwitch,
  orderByFavourite,
  type ProjectQuickSwitchProps,
  type ProjectSwitcherEntry,
} from "./ProjectSwitcher";

const entries: ProjectSwitcherEntry[] = [
  {
    id: "/projects/alpha",
    name: "alpha",
    path: "/projects/alpha",
    contextLabel: null,
    branch: "main",
    hasError: false,
    hasOperationInProgress: false,
    hasUnsavedChanges: false,
    isFavourite: false,
  },
  {
    id: "/projects/beta",
    name: "beta",
    path: "/projects/beta",
    contextLabel: null,
    branch: "feature/hero",
    hasError: false,
    hasOperationInProgress: false,
    hasUnsavedChanges: true,
    isFavourite: false,
  },
  {
    id: "/projects/gamma",
    name: "gamma",
    path: "/projects/gamma",
    contextLabel: null,
    branch: "main",
    hasError: false,
    hasOperationInProgress: false,
    hasUnsavedChanges: false,
    isFavourite: true,
  },
];

function props(overrides: Partial<ProjectQuickSwitchProps> = {}): ProjectQuickSwitchProps {
  return {
    entries,
    recent: [{ path: "/projects/old", name: "old-notes" }],
    activeId: entries[0].id,
    canSwitch: true,
    isOpening: false,
    onActivate: vi.fn(),
    onOpenRecent: vi.fn(),
    onClose: vi.fn(),
    onOpenAnother: vi.fn(),
    onCreate: vi.fn(),
    onClone: vi.fn(),
    onToggleFavourite: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onOpenFolder: vi.fn(),
    onOpenHome: vi.fn(),
    ...overrides,
  };
}

function renderSwitch(overrides: Partial<ProjectQuickSwitchProps> = {}): ProjectQuickSwitchProps {
  const all = props(overrides);
  render(
    <LanguageProvider>
      <ProjectQuickSwitch {...all} />
    </LanguageProvider>,
  );
  return all;
}

async function openPopup(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: /alpha — switch project/ }));
  return screen.getByRole("dialog", { name: "Open projects" });
}

afterEach(cleanup);

describe("ProjectQuickSwitch", () => {
  it("leads with the active project and lists the others, favourites first, then the recent ones", async () => {
    renderSwitch();
    const popup = await openPopup();

    const head = popup.querySelector(".project-quick-switch__head");
    expect(head).toHaveTextContent("alpha");
    expect(head).toHaveTextContent("/projects/alpha");
    const open = within(popup).getByRole("region", { name: "Open" });
    const names = Array.from(open.querySelectorAll(".project-quick-switch__name")).map((node) => node.textContent);
    expect(names).toEqual(["gamma", "beta"]);
    // Another project's state rides its row, in shape as well as colour.
    expect(within(open).getByLabelText("Has unsaved changes")).toBeInTheDocument();
    const recent = within(popup).getByRole("region", { name: "Recent" });
    expect(recent).toHaveTextContent("old-notes");
  });

  it("switches to another open project and closes, giving focus back to the trigger", async () => {
    const all = renderSwitch();
    await openPopup();

    await userEvent.click(screen.getByRole("button", { name: "Switch to beta" }));
    expect(all.onActivate).toHaveBeenCalledWith("/projects/beta");
    expect(screen.queryByRole("dialog", { name: "Open projects" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alpha — switch project/ })).toHaveFocus();
  });

  it("acts on the active project from its head: settings, folder, close", async () => {
    const all = renderSwitch();
    await openPopup();
    await userEvent.click(screen.getByRole("button", { name: "Settings for alpha" }));
    expect(all.onOpenProjectSettings).toHaveBeenCalledWith("/projects/alpha");

    await openPopup();
    await userEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(all.onOpenFolder).toHaveBeenCalledWith("/projects/alpha");

    await openPopup();
    await userEvent.click(screen.getByRole("button", { name: "Close alpha" }));
    expect(all.onClose).toHaveBeenCalledWith("/projects/alpha");
  });

  it("shows a project's actions in place of the list, with a way back", async () => {
    const all = renderSwitch();
    const popup = await openPopup();

    await userEvent.click(within(popup).getByRole("button", { name: "Actions for beta" }));
    expect(within(popup).queryByRole("searchbox")).not.toBeInTheDocument();
    const back = within(popup).getByRole("button", { name: "Back to projects" });
    expect(back).toHaveFocus();
    expect(within(popup).getByRole("button", { name: "Close beta" })).toBeInTheDocument();

    await userEvent.click(back);
    expect(within(popup).getByRole("searchbox", { name: "Search projects…" })).toBeInTheDocument();

    await userEvent.click(within(popup).getByRole("button", { name: "Actions for beta" }));
    await userEvent.click(within(popup).getByRole("button", { name: "Go to this project" }));
    expect(all.onActivate).toHaveBeenCalledWith("/projects/beta");
  });

  it("filters by name, takes the first match on Enter, and says when nothing matches", async () => {
    const all = renderSwitch();
    const popup = await openPopup();
    const search = within(popup).getByRole("searchbox", { name: "Search projects…" });

    await userEvent.type(search, "zzz");
    expect(popup).toHaveTextContent("No project by that name");

    await userEvent.clear(search);
    await userEvent.type(search, "old{Enter}");
    expect(all.onOpenRecent).toHaveBeenCalledWith("/projects/old");
  });

  it("docks the three ways to add a project at the foot, and goes Home", async () => {
    const all = renderSwitch();
    const popup = await openPopup();

    await userEvent.click(within(popup).getByRole("button", { name: "Add project" }));
    const add = within(popup).getByRole("group", { name: "Add project" });
    expect(within(add).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Create local project…",
      "Open another project…",
      "Clone remote project…",
    ]);
    await userEvent.click(within(add).getByRole("button", { name: "Clone remote project…" }));
    expect(all.onClone).toHaveBeenCalledOnce();

    await openPopup();
    await userEvent.click(screen.getByRole("button", { name: "All in Home" }));
    expect(all.onOpenHome).toHaveBeenCalledOnce();
  });

  it("disables switching, reopening and closing while a dialog blocks them, and says why", async () => {
    renderSwitch({ canSwitch: false });
    const popup = await openPopup();

    const beta = within(popup).getByRole("button", { name: "Switch to beta" });
    expect(beta).toBeDisabled();
    expect(beta).toHaveAttribute("title", "Close the open dialog before switching projects");
    expect(within(popup).getByRole("button", { name: "Open old-notes again" })).toBeDisabled();
    expect(within(popup).getByRole("button", { name: "Close alpha" })).toBeDisabled();
    // The project the dialog belongs to can still be configured.
    expect(within(popup).getByRole("button", { name: "Settings for alpha" })).toBeEnabled();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderSwitch();
    await openPopup();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Open projects" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alpha — switch project/ })).toHaveFocus();
  });

  it("opens with nothing open, offering the recent projects and the ways to add one", async () => {
    const all = renderSwitch({ entries: [], activeId: null });

    await userEvent.click(screen.getByRole("button", { name: "No project open" }));
    const popup = screen.getByRole("dialog", { name: "Open projects" });
    expect(popup.querySelector(".project-quick-switch__head")).toBeNull();
    await userEvent.click(within(popup).getByRole("button", { name: "Open old-notes again" }));
    expect(all.onOpenRecent).toHaveBeenCalledWith("/projects/old");
  });

  it("toggles a favourite from its row without closing", async () => {
    const all = renderSwitch();
    const popup = await openPopup();

    const star = within(popup).getByRole("button", { name: "Add beta to favorites" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(star);
    expect(all.onToggleFavourite).toHaveBeenCalledWith("/projects/beta");
    expect(screen.getByRole("dialog", { name: "Open projects" })).toBeInTheDocument();
    expect(within(popup).getByRole("button", { name: "Remove gamma from favorites" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("project favourites", () => {
  it("lists favourites first without disturbing the order inside each group", () => {
    const ordered = orderByFavourite([
      { ...entries[0], id: "a", isFavourite: false },
      { ...entries[0], id: "b", isFavourite: true },
      { ...entries[0], id: "c", isFavourite: false },
      { ...entries[0], id: "d", isFavourite: true },
    ]);

    // b before d, and a before c: favouriting promotes a group, it does not
    // reshuffle within one.
    expect(ordered.map((entry) => entry.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("returns the same order when nothing is favourited", () => {
    const ids = ["a", "b", "c"];
    const ordered = orderByFavourite(ids.map((id) => ({ ...entries[0], id, isFavourite: false })));
    expect(ordered.map((entry) => entry.id)).toEqual(ids);
  });
});
