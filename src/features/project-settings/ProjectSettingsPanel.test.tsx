import React, { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createProjectSettingsCache, type ProjectSettingsCache } from "./cache";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel";
import type { ProjectSettingsPort } from "./port";
import type {
  IgnoreFile,
  ProjectIdentity,
  ProjectRemotes,
  ProjectSettingsSection,
} from "./domain";

afterEach(cleanup);

const PROJECT = { path: "/projects/alpha", sessionEpoch: "epoch-1" };

const REMOTES: ProjectRemotes = {
  remotes: [
    {
      name: "origin",
      url: "https://example.test/repo.git",
      pushUrl: null,
      hasHiddenCredentials: false,
    },
  ],
  upstreamRemote: "origin",
};

const IDENTITY: ProjectIdentity = {
  localName: null,
  localEmail: null,
  inheritedName: "Global Person",
  inheritedEmail: "global@example.test",
  effectiveName: "Global Person",
  effectiveEmail: "global@example.test",
  source: "inherited",
};

const IGNORE_FILE: IgnoreFile = {
  scope: "project",
  relativePath: ".gitignore",
  exists: true,
  contents: "build/\n",
  stateToken: "token-1",
  byteLength: 7,
  unavailable: null,
};

function createPort(overrides: Partial<ProjectSettingsPort> = {}): ProjectSettingsPort {
  return {
    readRemotes: vi.fn(async () => REMOTES),
    setRemoteUrl: vi.fn(async (_project, name, url) => ({
      remotes: [{ name, url, pushUrl: null, hasHiddenCredentials: false }],
      upstreamRemote: name,
    })),
    planConnectRemote: vi.fn(async (_project, remoteName) => ({
      stateToken: "plan-token",
      remoteName,
      fetchUrlDisplay: "https://example.test/new.git",
      credentialExpectation: "git-credential-helper" as const,
      futureNetworkAccess: true,
    })),
    connectRemote: vi.fn(async () => undefined),
    readIdentity: vi.fn(async () => IDENTITY),
    setIdentity: vi.fn(async (_project, draft) => ({
      ...IDENTITY,
      localName: draft.name,
      localEmail: draft.email,
      effectiveName: draft.name,
      effectiveEmail: draft.email,
      source: "project" as const,
    })),
    clearIdentity: vi.fn(async () => IDENTITY),
    readIgnoreFile: vi.fn(async (_project, scope) => ({
      ...IGNORE_FILE,
      scope,
      relativePath: scope === "project" ? ".gitignore" : ".git/info/exclude",
    })),
    writeIgnoreFile: vi.fn(async (_project, scope, contents) => ({
      ...IGNORE_FILE,
      scope,
      relativePath: scope === "project" ? ".gitignore" : ".git/info/exclude",
      contents,
      stateToken: "token-2",
    })),
    ...overrides,
  };
}

function Harness({
  port,
  initialSection = "remote",
  cache = null,
  onClose,
  onRegisterCloseGuard,
}: {
  port: ProjectSettingsPort;
  initialSection?: ProjectSettingsSection;
  cache?: ProjectSettingsCache | null;
  onClose?: () => void;
  onRegisterCloseGuard?: (guard: (() => boolean) | null) => void;
}): React.JSX.Element {
  const [section, setSection] = useState<ProjectSettingsSection>(initialSection);
  return (
    <LanguageProvider>
      <ProjectSettingsPanel
        project={PROJECT}
        projectName="alpha"
        activeSection={section}
        onSectionChange={setSection}
        port={port}
        cache={cache}
        onClose={onClose}
        onRegisterCloseGuard={onRegisterCloseGuard}
      />
    </LanguageProvider>
  );
}

describe("the remote section", () => {
  it("shows the configured remote, marks the one that publishes, and confirms before writing", async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<Harness port={port} />);

    const field = await screen.findByLabelText("Address for origin");
    expect(field).toHaveValue("https://example.test/repo.git");
    expect(screen.getByText("Publishes here")).toBeInTheDocument();

    // The shown address is the redacted one, so it is not a change to save.
    const change = screen.getByRole("button", { name: "Change address" });
    expect(change).toBeDisabled();

    await user.clear(field);
    await user.type(field, "https://example.test/moved.git");
    expect(change).toBeEnabled();

    await user.click(change);
    expect(port.setRemoteUrl).not.toHaveBeenCalled();
    expect(screen.getByText("Change where this project points?")).toBeInTheDocument();
    expect(screen.getByText("Now: https://example.test/repo.git")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change it" }));
    await waitFor(() =>
      expect(port.setRemoteUrl).toHaveBeenCalledWith(
        PROJECT,
        "origin",
        "https://example.test/moved.git",
      ),
    );
    expect(await screen.findByText("origin now points at the new address.")).toBeInTheDocument();
  });

  it("says when the stored address hides sign-in details the field cannot show", async () => {
    const port = createPort({
      readRemotes: vi.fn(async () => ({
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            pushUrl: "https://mirror.test/repo.git",
            hasHiddenCredentials: true,
          },
        ],
        upstreamRemote: null,
      })),
    });
    render(<Harness port={port} />);

    expect(
      await screen.findByText(
        "The saved address includes sign-in details GitOdrile doesn't show. Saving a new address replaces them.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Publishing uses a separate address (https://mirror.test/repo.git), which this field does not change.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Publishes here")).not.toBeInTheDocument();
  });

  it("offers to connect the first remote through the plan it confirms", async () => {
    const user = userEvent.setup();
    const port = createPort({
      readRemotes: vi.fn(async () => ({ remotes: [], upstreamRemote: null })),
    });
    render(<Harness port={port} />);

    expect(await screen.findByText("No remote connected")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Address"), "https://example.test/new.git");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(port.planConnectRemote).toHaveBeenCalledWith(
        PROJECT,
        "origin",
        "https://example.test/new.git",
      ),
    );
    expect(port.connectRemote).not.toHaveBeenCalled();
    expect(screen.getByText("Connect this remote?")).toBeInTheDocument();
    expect(
      screen.getByText("Publishing will ask your Git credential helper to sign in."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect it" }));
    await waitFor(() =>
      expect(port.connectRemote).toHaveBeenCalledWith(
        PROJECT,
        "origin",
        "https://example.test/new.git",
        "plan-token",
      ),
    );
  });

  it("withdraws a confirmation once the field behind it changes", async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<Harness port={port} />);

    const field = await screen.findByLabelText("Address for origin");
    await user.clear(field);
    await user.type(field, "https://example.test/moved.git");
    await user.click(screen.getByRole("button", { name: "Change address" }));
    expect(screen.getByText("Change where this project points?")).toBeInTheDocument();

    // Correcting the address after asking means the question on screen is about
    // an address the field no longer holds.
    await user.type(field, "x");
    expect(screen.queryByText("Change where this project points?")).not.toBeInTheDocument();
    expect(port.setRemoteUrl).not.toHaveBeenCalled();
  });

  it("withdraws a connect plan once the remote name changes", async () => {
    const user = userEvent.setup();
    const port = createPort({
      readRemotes: vi.fn(async () => ({ remotes: [], upstreamRemote: null })),
    });
    render(<Harness port={port} />);

    await user.type(await screen.findByLabelText("Address"), "https://example.test/new.git");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("Connect this remote?")).toBeInTheDocument();

    // The plan is bound to the name it was made for, so a new name has to be
    // planned again rather than confirmed under the old one.
    await user.type(screen.getByLabelText("Name"), "-2");
    expect(screen.queryByText("Connect this remote?")).not.toBeInTheDocument();
    expect(port.connectRemote).not.toHaveBeenCalled();
  });

  it("reports a failed write instead of claiming the address changed", async () => {
    const user = userEvent.setup();
    const port = createPort({
      setRemoteUrl: vi.fn(async () => {
        throw { code: "invalid_remote_url", message: "no", remediation: null };
      }),
    });
    render(<Harness port={port} />);

    const field = await screen.findByLabelText("Address for origin");
    await user.clear(field);
    await user.type(field, "nonsense");
    await user.click(screen.getByRole("button", { name: "Change address" }));
    await user.click(screen.getByRole("button", { name: "Change it" }));

    expect(
      await screen.findByText(
        "Enter a complete HTTPS, SSH, Git, file, or SCP-like SSH remote URL.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("origin now points at the new address.")).not.toBeInTheDocument();
  });
});

describe("the ignored-files section", () => {
  it("edits the shared list and the personal one as separate files", async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<Harness port={port} initialSection="ignored" />);

    const editor = await screen.findByLabelText("Rules in .gitignore");
    expect(editor).toHaveValue("build/\n");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(editor, "node_modules/");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(port.writeIgnoreFile).toHaveBeenCalledWith(
        PROJECT,
        "project",
        "build/\nnode_modules/",
        "token-1",
      ),
    );
    expect(await screen.findByText(".gitignore saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Only me" }));
    expect(await screen.findByLabelText("Rules in .git/info/exclude")).toBeInTheDocument();
    expect(port.readIgnoreFile).toHaveBeenLastCalledWith(PROJECT, "personal");
    expect(
      screen.getByText(
        "Kept in this copy of the project only. Nobody else sees these rules, and they are never published.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses to edit a file it could not read whole", async () => {
    const port = createPort({
      readIgnoreFile: vi.fn(async () => ({
        ...IGNORE_FILE,
        contents: null,
        stateToken: null,
        byteLength: 900_000,
        unavailable: "too_large" as const,
      })),
    });
    render(<Harness port={port} initialSection="ignored" />);

    expect(
      await screen.findByText(
        "This file is too large to edit here. Open it in a text editor instead.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reports an edit made outside GitOdrile rather than overwriting it", async () => {
    const user = userEvent.setup();
    const port = createPort({
      writeIgnoreFile: vi.fn(async () => {
        throw { code: "stale_ignore_file", message: "changed", remediation: null };
      }),
    });
    render(<Harness port={port} initialSection="ignored" />);

    await user.type(await screen.findByLabelText("Rules in .gitignore"), "dist/");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "This ignore file changed outside GitOdrile. Reopen it to see the current rules before saving.",
      ),
    ).toBeInTheDocument();
  });
});

describe("reopening the panel", () => {
  it("paints the remembered answer on the first frame and revalidates behind it", async () => {
    const cache = createProjectSettingsCache();
    const port = createPort();
    const first = render(<Harness port={port} cache={cache} />);
    await screen.findByLabelText("Address for origin");
    expect(port.readRemotes).toHaveBeenCalledTimes(1);
    first.unmount();

    // Reopening: the field is there synchronously, with no loading state to
    // replace, and Git is asked again in the background.
    render(<Harness port={port} cache={cache} />);
    expect(screen.getByLabelText("Address for origin")).toHaveValue(
      "https://example.test/repo.git",
    );
    expect(screen.queryByText("Reading this project\u2026")).not.toBeInTheDocument();
    await waitFor(() => expect(port.readRemotes).toHaveBeenCalledTimes(2));
  });

  it("never remembers the ignore file, whose contents are the thing being edited", async () => {
    const cache = createProjectSettingsCache();
    const port = createPort();
    const first = render(<Harness port={port} cache={cache} initialSection="ignored" />);
    await screen.findByLabelText("Rules in .gitignore");
    first.unmount();

    render(<Harness port={port} cache={cache} initialSection="ignored" />);
    // Read afresh rather than served from memory: a remembered copy would be
    // swapped out from under an edit when the real one landed.
    expect(screen.queryByLabelText("Rules in .gitignore")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Rules in .gitignore")).toHaveValue("build/\n");
  });

  it("leaves what is being typed alone when a revalidation lands", async () => {
    const user = userEvent.setup();
    const cache = createProjectSettingsCache();
    const revalidation: { finish: (() => void) | null } = { finish: null };
    const readRemotes = vi
      .fn<ProjectSettingsPort["readRemotes"]>()
      .mockResolvedValueOnce(REMOTES)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            revalidation.finish = () => resolve(REMOTES);
          }),
      );
    const port = createPort({ readRemotes });

    const first = render(<Harness port={port} cache={cache} />);
    await screen.findByLabelText("Address for origin");
    first.unmount();

    // Reopened from the cache, with a read still in flight behind it.
    render(<Harness port={port} cache={cache} />);
    const field = screen.getByLabelText("Address for origin");
    await user.clear(field);
    await user.type(field, "https://example.test/moved.git");

    // The read answers with the address Git still has. It must not put that
    // back into a field the user is in the middle of editing.
    revalidation.finish?.();
    await waitFor(() => expect(readRemotes).toHaveBeenCalledTimes(2));
    expect(field).toHaveValue("https://example.test/moved.git");
    expect(screen.getByRole("button", { name: "Change address" })).toBeEnabled();
  });

  it("drops a remembered answer when a read of it failed", async () => {
    const cache = createProjectSettingsCache();
    const readRemotes = vi
      .fn<ProjectSettingsPort["readRemotes"]>()
      .mockResolvedValueOnce(REMOTES)
      .mockRejectedValueOnce({ code: "git_command_failed", message: "no", remediation: null })
      .mockResolvedValue(REMOTES);
    const port = createPort({ readRemotes });
    const first = render(<Harness port={port} cache={cache} />);
    await screen.findByLabelText("Address for origin");
    first.unmount();

    // The remembered value paints, revalidation fails, and the failure replaces
    // it rather than leaving a value nobody can vouch for.
    render(<Harness port={port} cache={cache} />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("the identity section", () => {
  it("names the inherited identity in the option that means it, and only asks for fields when needed", async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<Harness port={port} initialSection="identity" />);

    // The option card carries the identity itself, so choosing does not mean
    // going somewhere else to find out what it would use.
    const inheritedOption = await screen.findByRole("radio", { name: /Your Git identity/ });
    expect(inheritedOption).toHaveAttribute("aria-checked", "true");
    expect(inheritedOption).toHaveTextContent(
      "The one your other projects use: Global Person <global@example.test>.",
    );
    expect(
      screen.getByText("Versions saved here will be signed Global Person <global@example.test>."),
    ).toBeInTheDocument();
    // No fields at all while the identity is inherited.
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /A different one, only here/ }));
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("Global Person");
    await user.clear(name);
    await user.type(name, "Work Person");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(port.setIdentity).toHaveBeenCalledWith(PROJECT, {
        name: "Work Person",
        email: "global@example.test",
      }),
    );
    expect(
      await screen.findByText("This project now saves under its own identity."),
    ).toBeInTheDocument();
  });

  it("removes the local override when the project goes back to the Git identity", async () => {
    const user = userEvent.setup();
    const port = createPort({
      readIdentity: vi.fn(async () => ({
        ...IDENTITY,
        localName: "Work Person",
        localEmail: "work@example.test",
        effectiveName: "Work Person",
        effectiveEmail: "work@example.test",
        source: "project" as const,
      })),
    });
    render(<Harness port={port} initialSection="identity" />);

    const project = await screen.findByRole("radio", { name: /A different one, only here/ });
    await waitFor(() => expect(project).toHaveAttribute("aria-checked", "true"));
    await user.click(screen.getByRole("radio", { name: /Your Git identity/ }));

    await waitFor(() => expect(port.clearIdentity).toHaveBeenCalledWith(PROJECT));
    expect(
      await screen.findByText("This project is back to your Git identity."),
    ).toBeInTheDocument();
    // Back to inheriting: the fields go with the option they belonged to.
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(
      screen.getByText("Versions saved here will be signed Global Person <global@example.test>."),
    ).toBeInTheDocument();
  });

  it("will not save half an identity", async () => {
    const user = userEvent.setup();
    render(<Harness port={createPort()} initialSection="identity" />);

    await user.click(
      await screen.findByRole("radio", { name: /A different one, only here/ }),
    );
    await user.clear(screen.getByLabelText("Email"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Enter a name and an email address.")).toBeInTheDocument();
  });
});

describe("the panel itself", () => {
  it("reads a section only once it is opened", async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<Harness port={port} />);

    await waitFor(() => expect(port.readRemotes).toHaveBeenCalled());
    expect(port.readIdentity).not.toHaveBeenCalled();
    expect(port.readIgnoreFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await waitFor(() => expect(port.readIdentity).toHaveBeenCalledWith(PROJECT));
    expect(port.readIgnoreFile).not.toHaveBeenCalled();
  });

  it("keeps an unsaved edit when the other ignore list is looked at", async () => {
    const user = userEvent.setup();
    const port = createPort({
      // Both lists are absent, so both carry the same state token - the case
      // where keying the draft on the token alone leaked one into the other.
      readIgnoreFile: vi.fn(async (_project, scope) => ({
        ...IGNORE_FILE,
        scope,
        relativePath: scope === "project" ? ".gitignore" : ".git/info/exclude",
        exists: false,
        contents: "",
        stateToken: "absent",
      })),
    });
    render(<Harness port={port} initialSection="ignored" />);

    await user.type(await screen.findByLabelText("Rules in .gitignore"), "shared-rule");
    await user.click(screen.getByRole("radio", { name: "Only me" }));

    const personal = await screen.findByLabelText("Rules in .git/info/exclude");
    expect(personal).toHaveValue("");
    await user.type(personal, "mine-only");

    // Back to the shared list: what was typed there is still there.
    await user.click(screen.getByRole("radio", { name: "Everyone" }));
    expect(await screen.findByLabelText("Rules in .gitignore")).toHaveValue("shared-rule");
  });

  it("asks about an unsaved edit in the list it is not showing", async () => {
    const user = userEvent.setup();
    const guardRef: { current: (() => boolean) | null } = { current: null };
    render(
      <Harness
        port={createPort()}
        initialSection="ignored"
        onRegisterCloseGuard={(next) => {
          guardRef.current = next;
        }}
      />,
    );

    await user.type(await screen.findByLabelText("Rules in .gitignore"), "dist/");
    await user.click(screen.getByRole("radio", { name: "Only me" }));
    await screen.findByLabelText("Rules in .git/info/exclude");

    // The edit is in the list the user switched away from; the guard still
    // knows about it and shows it rather than losing it quietly.
    expect(guardRef.current?.()).toBe(true);
    expect(await screen.findByLabelText("Rules in .gitignore")).toHaveValue("build/\ndist/");
    expect(screen.getByText("You have changes that aren't saved")).toBeInTheDocument();
  });

  it("keeps every radio group to one tab stop, with arrows inside it", async () => {
    const user = userEvent.setup();
    render(<Harness port={createPort()} initialSection="identity" />);

    const options = await screen.findAllByRole("radio");
    expect(options.filter((option) => option.getAttribute("tabindex") === "0")).toHaveLength(1);
    options[0].focus();
    await user.keyboard("{ArrowRight}");
    // Focus moves; the choice does not follow it, because choosing one of
    // these writes to a Git configuration.
    const other = screen.getByRole("radio", { name: /A different one, only here/ });
    expect(other).toHaveFocus();
    expect(other).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the rail to one tab stop, with arrows to move inside it", async () => {
    const user = userEvent.setup();
    render(<Harness port={createPort()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    tabs[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Ignored files" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("asks before closing over an unsaved edit, and never saves it silently", async () => {
    const user = userEvent.setup();
    const port = createPort();
    const onClose = vi.fn();
    const guardRef: { current: (() => boolean) | null } = { current: null };
    render(
      <Harness
        port={port}
        initialSection="ignored"
        onClose={onClose}
        onRegisterCloseGuard={(next) => {
          guardRef.current = next;
        }}
      />,
    );

    await screen.findByLabelText("Rules in .gitignore");
    expect(guardRef.current?.()).toBe(false);

    await user.type(screen.getByLabelText("Rules in .gitignore"), "dist/");
    expect(guardRef.current?.()).toBe(true);
    expect(port.writeIgnoreFile).not.toHaveBeenCalled();

    expect(await screen.findByText("You have changes that aren't saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard and close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("names the project it is scoped to", async () => {
    render(<Harness port={createPort()} />);
    expect(
      await screen.findByText("These settings apply to alpha only."),
    ).toBeInTheDocument();
  });
});

describe("a failed read", () => {
  it("reports it and offers to try again", async () => {
    const user = userEvent.setup();
    const readRemotes = vi
      .fn<ProjectSettingsPort["readRemotes"]>()
      .mockRejectedValueOnce({ code: "git_command_failed", message: "no", remediation: null })
      .mockResolvedValue(REMOTES);
    render(<Harness port={createPort({ readRemotes })} />);

    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    const field = await screen.findByLabelText("Address for origin");
    expect(field).toHaveValue("https://example.test/repo.git");
  });
});

describe("within one section", () => {
  it("keeps the remote list and its fields in step after a write", async () => {
    const user = userEvent.setup();
    const port = createPort();
    render(<Harness port={port} />);

    const field = await screen.findByLabelText("Address for origin");
    await user.clear(field);
    await user.type(field, "https://example.test/moved.git");
    await user.click(screen.getByRole("button", { name: "Change address" }));
    await user.click(
      screen.getByRole("button", { name: "Change it" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Address for origin")).toHaveValue(
        "https://example.test/moved.git",
      ),
    );
    // Reseeded from what Git reported, so the button falls back to disabled
    // rather than offering to write the same address again.
    const group = screen.getByLabelText("Address for origin").closest(".project-settings-remote");
    expect(within(group as HTMLElement).getByRole("button", { name: "Change address" })).toBeDisabled();
  });
});
