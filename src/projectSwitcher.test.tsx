import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "./i18n";
import {
  ProjectSwitcher,
  ProjectSwitcherCompact,
  type ProjectSwitcherEntry,
} from "./projectSwitcher";

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

describe("ProjectSwitcher", () => {
  it("exposes the active project and non-color status text", () => {
    render(
      <LanguageProvider>
        <ProjectSwitcher {...commonProps()} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("button", { name: /alpha.*has unsaved changes/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByLabelText("Has unsaved changes")).toBeInTheDocument();
  });

  it("shows duplicate-name context and exposes every simultaneous status", () => {
    const ambiguousEntries: ProjectSwitcherEntry[] = [
      {
        ...entries[0],
        contextLabel: "client-a",
        hasError: true,
      },
    ];

    render(
      <LanguageProvider>
        <ProjectSwitcher {...commonProps()} entries={ambiguousEntries} />
      </LanguageProvider>,
    );

    expect(screen.getByText("client-a")).toBeInTheDocument();
    expect(screen.getByLabelText("Needs attention")).toBeInTheDocument();
    expect(screen.getByLabelText("Has unsaved changes")).toBeInTheDocument();
  });

  it("offers creating and cloning beside opening another project", async () => {
    const props = commonProps();
    render(
      <LanguageProvider>
        <ProjectSwitcher {...props} />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Create local project" }));
    expect(props.onCreate).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Clone remote project" }));
    expect(props.onClone).toHaveBeenCalledOnce();
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
