import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import {
  ProjectSwitcherCompact,
  ProjectSwitcherRail,
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
  },
  {
    id: "/projects/beta",
    name: "beta",
    contextLabel: null,
    hasError: false,
    hasOperationInProgress: false,
    hasUnsavedChanges: false,
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
    expect(screen.getByLabelText("Has unsaved changes")).toBeInTheDocument();

    await userEvent.click(trigger);
    const popover = screen.getByRole("dialog", { name: "Open projects" });
    expect(within(popover).getByRole("button", { name: /alpha.*has unsaved changes/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
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

  it("blocks switching while a dialog owns the active project", () => {
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...commonProps()} canSwitch={false} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("button", { name: "alpha — switch project" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add project" })).toBeDisabled();
  });

  it("folds creating, opening and cloning into one add-project menu", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcherRail {...props} />
      </LanguageProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Add project" });
    expect(trigger).not.toHaveAttribute("data-tooltip");
    expect(screen.queryByRole("menuitem", { name: "Create local project" })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Add project" });
    expect(menu).toHaveClass("sidebar-project-flyout", "auto-hide-scrollbar");
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
