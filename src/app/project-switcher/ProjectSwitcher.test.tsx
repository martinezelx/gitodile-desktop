import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import {
  ProjectSwitcherCompact,
  ProjectSwitcherRail,
  orderByFavourite,
  type ProjectSwitcherEntry,
} from "./ProjectSwitcher";

const entries: ProjectSwitcherEntry[] = [
  {
    id: "/projects/alpha",
    name: "alpha",
    contextLabel: null,
    hasError: false,
    hasOperationInProgress: false,
    hasUnsavedChanges: true,
    isFavourite: false,
  },
  {
    id: "/projects/beta",
    name: "beta",
    contextLabel: null,
    hasError: false,
    hasOperationInProgress: false,
    hasUnsavedChanges: false,
    isFavourite: false,
  },
];

function commonProps() {
  return {
    entries,
    activeId: entries[0].id,
    canSwitch: true,
    isOpening: false,
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onOpenAnother: vi.fn(),
    onCreate: vi.fn(),
    onClone: vi.fn(),
    onToggleFavourite: vi.fn(),
  };
}

afterEach(cleanup);

describe("ProjectSwitcherRail", () => {
  it("exposes the active project and non-color status text", async () => {
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...commonProps()} />
      </LanguageProvider>,
    );

    // The rail itself shows one square; the status rides along on its badge.
    const trigger = screen.getByRole("button", { name: "alpha — switch project" });
    expect(trigger).toHaveAttribute("data-tooltip", "alpha — switch project");
    expect(screen.getByLabelText("Has unsaved changes")).toBeInTheDocument();

    await userEvent.click(trigger);
    const popover = screen.getByRole("dialog", { name: "Open projects" });
    expect(within(popover).getByRole("button", { name: /alpha.*has unsaved changes/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("keeps a long non-ASCII project name intact in the rail tooltip", () => {
    const longName = "Diseño_日本語_del proyecto con un nombre especialmente largo";
    render(
      <LanguageProvider>
        <ProjectSwitcherRail
          {...commonProps()}
          entries={[{ ...entries[0], name: longName }]}
          activeId={entries[0].id}
        />
      </LanguageProvider>,
    );

    expect(
      screen.getByRole("button", { name: `${longName} — switch project` }),
    ).toHaveAttribute("data-tooltip", `${longName} — switch project`);
  });

  it("shows duplicate-name context and exposes every simultaneous status", async () => {
    const ambiguousEntries: ProjectSwitcherEntry[] = [
      {
        ...entries[0],
        contextLabel: "client-a",
        hasError: true,
      },
    ];

    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...commonProps()} entries={ambiguousEntries} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "alpha — switch project" }));
    const popover = screen.getByRole("dialog", { name: "Open projects" });
    expect(within(popover).getByText("client-a")).toBeInTheDocument();
    expect(within(popover).getByLabelText("Needs attention")).toBeInTheDocument();
    expect(within(popover).getByLabelText("Has unsaved changes")).toBeInTheDocument();
  });

  it("filters the popover by name and says so when nothing matches", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...props} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "alpha — switch project" }));
    const search = screen.getByRole("textbox", { name: "Search a project…" });
    await waitFor(() => expect(search).toHaveFocus());

    await userEvent.type(search, "bet");
    const popover = screen.getByRole("dialog", { name: "Open projects" });
    expect(within(popover).getByRole("button", { name: "beta" })).toBeInTheDocument();
    expect(within(popover).queryByRole("button", { name: /^alpha/ })).not.toBeInTheDocument();

    await userEvent.type(search, "zzz");
    expect(screen.getByText("No project by that name")).toBeInTheDocument();
  });

  it("switches project from the popover and closes it", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...props} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "alpha — switch project" }));
    await userEvent.click(screen.getByRole("button", { name: "beta" }));

    expect(props.onActivate).toHaveBeenCalledWith(entries[1].id);
    expect(screen.queryByRole("dialog", { name: "Open projects" })).not.toBeInTheDocument();
  });

  it("keeps blocked rail controls explainable without allowing activation", async () => {
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...commonProps()} canSwitch={false} />
      </LanguageProvider>,
    );

    const project = screen.getByRole("button", { name: "alpha — switch project" });
    const add = screen.getByRole("button", { name: "Add project" });
    expect(project).toHaveAttribute("aria-disabled", "true");
    expect(project).toHaveAttribute("data-tooltip", "alpha — switch project");
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).toHaveAttribute("data-tooltip", "Add project");

    await userEvent.click(project);
    await userEvent.click(add);
    expect(screen.queryByRole("dialog", { name: "Open projects" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Add project" })).not.toBeInTheDocument();
  });

  it("filters the list to favourites and says so when there are none", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherRail
          {...props}
          entries={[entries[0], { ...entries[1], isFavourite: true }]}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "alpha — switch project" }));
    // Anchored to the start: inside the popover "alpha" also appears in the
    // row's star ("Add alpha to favourites") and its close button.
    const popover = screen.getByRole("dialog", { name: "Open projects" });
    expect(within(popover).getByRole("button", { name: /^alpha/i })).toBeInTheDocument();
    expect(within(popover).getByRole("button", { name: "beta" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show favourites only" }));
    expect(within(popover).getByRole("button", { name: "beta" })).toBeInTheDocument();
    expect(within(popover).queryByRole("button", { name: /^alpha/i })).not.toBeInTheDocument();
  });

  it("explains an empty favourites filter instead of showing the search empty text", async () => {
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...commonProps()} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "alpha — switch project" }));
    await userEvent.click(screen.getByRole("button", { name: "Show favourites only" }));

    // "No projects match that search" would be a lie: nothing was searched.
    expect(
      screen.getByText("No favourites yet. Star a project to keep it here."),
    ).toBeInTheDocument();
  });

  it("folds creating, opening and cloning into one add-project menu", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...props} />
      </LanguageProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Add project" });
    expect(trigger).toHaveAttribute("data-tooltip", "Add project");
    expect(screen.queryByRole("menuitem", { name: "Create local project" })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Add project" });
    // Plain menu furniture, sized by its three items. It used to borrow the
    // project switcher's panel class, which carries a flat `height: 180px` —
    // three options stretched across a panel built for a scrolling list.
    expect(menu).toHaveClass("app-menu", "project-switcher-add-menu__popup");
    expect(menu).not.toHaveClass("sidebar-project-flyout");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "Create local project" })).toHaveFocus(),
    );

    await userEvent.click(within(menu).getByRole("menuitem", { name: "Clone remote project" }));
    expect(props.onClone).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu", { name: "Add project" })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Create local project" }));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it("dismisses the add-project menu on Escape and restores the trigger", async () => {
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...commonProps()} />
      </LanguageProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Add project" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Add project" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Add project" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps the compact popover open while its portaled add-project menu is used", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherCompact {...props} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Switch project" }));
    await userEvent.click(screen.getByRole("button", { name: "Add project" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open another project" }));

    expect(props.onOpenAnother).toHaveBeenCalledOnce();
  });

  it("lets Escape close the add-project menu without also closing the compact popover", async () => {
    render(
      <LanguageProvider>
        <ProjectSwitcherCompact {...commonProps()} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Switch project" }));
    await userEvent.click(screen.getByRole("button", { name: "Add project" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu", { name: "Add project" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Open projects" })).toBeInTheDocument();
  });

  it("uses dialog semantics in compact mode and restores focus after closing a project", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherCompact {...props} />
      </LanguageProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Open projects" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Close beta" }));
    expect(props.onClose).toHaveBeenCalledWith(entries[1].id);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "Open projects" })).not.toBeInTheDocument();
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

  it("marks a favourite row so it reads without hovering, and toggles back", async () => {
    const onToggleFavourite = vi.fn();
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherCompact
          {...props}
          entries={[{ ...entries[0], isFavourite: true }, entries[1]]}
          onToggleFavourite={onToggleFavourite}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /switch project|alpha/i }));

    // The marked one offers removal and reports itself pressed; the unmarked
    // one offers the opposite. That pair is what a screen reader has to
    // distinguish, since the difference is otherwise only colour and fill.
    const marked = await screen.findByRole("button", { name: "Remove alpha from favourites" });
    expect(marked).toHaveAttribute("aria-pressed", "true");
    const unmarked = screen.getByRole("button", { name: "Add beta to favourites" });
    expect(unmarked).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(marked);
    expect(onToggleFavourite).toHaveBeenCalledWith("/projects/alpha");
  });
});
