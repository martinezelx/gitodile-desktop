import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { ConsoleScreen } from "./ConsoleScreen";
import { consolePort } from "./tauriAdapter";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

function renderConsole(epoch = "epoch-1") {
  const lifecycle = createScreenLifecycleController("active");
  const result = render(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
    <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch={epoch} gitVersion="2.47.1"
      projectStatus={{ changes: 3, linesAdded: 12, linesRemoved: 4, unpublished: 2, incoming: 0 }} />
  </ScreenLifecycleProvider></LanguageProvider>);
  return { lifecycle, ...result };
}

describe("ConsoleScreen", () => {
  it("does not run on arrival, rejects shell-like text, and shows a bounded result", async () => {
    const run = vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "status", command: "git status", stdout: "On branch main\n", stderr: "", exitCode: 0, success: true, truncated: false });
    const user = userEvent.setup();
    renderConsole();
    expect(run).not.toHaveBeenCalled();
    const input = screen.getByRole("combobox", { name: "Console shortcut" });
    await user.type(input, "git status{Enter}");
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a shortcut/, { selector: "pre" })).toBeInTheDocument();
    await user.type(input, "look{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", operationId: "status" });
    expect(await screen.findByText("main", { selector: ".console-tone--current" })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ ms$|^\d+\.\d s$/)).toBeInTheDocument();
    expect(screen.getByText("git status", { selector: "code" })).toBeInTheDocument();
    await user.type(input, "{ArrowUp}");
    expect(input).toHaveValue("look");
  });

  it("has help, editing, reset, empty and error states", async () => {
    const run = vi.spyOn(consolePort, "run").mockRejectedValue({ code: "git_command_failed", message: "Stopped" });
    const user = userEvent.setup();
    renderConsole();
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "Console shortcut" });
    await user.type(input, "help{Enter}");
    expect(screen.getByRole("table", { name: "Available shortcuts (read-only)" })).toHaveTextContent("lookProject status");
    await user.click(screen.getByRole("button", { name: "Shortcuts" }));
    await user.type(screen.getByRole("textbox", { name: "Shortcut name" }), "peek");
    await user.click(screen.getByRole("button", { name: "Add shortcut" }));
    expect(within(screen.getByRole("region", { name: "Console shortcuts" })).getByText("peek")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(screen.queryByText("peek")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close shortcuts" }));
    await user.type(input, "look{Enter}");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't|could not|stopped/i);
    await user.type(input, "clear{Enter}");
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
  });

  it("disables input while running and drops a late result after a project session switch", async () => {
    let finish!: (value: Awaited<ReturnType<typeof consolePort.run>>) => void;
    const run = vi.spyOn(consolePort, "run").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const lifecycle = createScreenLifecycleController("active");
    const view = (epoch: string) => <LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen key={epoch} projectPath={epoch === "one" ? "/first" : "/second"} projectName={epoch} branch="main" sessionEpoch={epoch} />
    </ScreenLifecycleProvider></LanguageProvider>;
    const rendered = render(view("one"));
    await user.type(screen.getByRole("combobox", { name: "Console shortcut" }), "look{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/first", sessionEpoch: "one", operationId: "status" });
    expect(screen.getByRole("combobox", { name: "Console shortcut" })).toBeDisabled();
    rendered.rerender(view("two"));
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
    await act(async () => finish({ operationId: "status", command: "git status", stdout: "old project", stderr: "", exitCode: 0, success: true, truncated: false }));
    expect(screen.queryByText("old project")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Console shortcut" })).toBeEnabled();
  });

  it("completes with Tab, runs from the menu, and colours a diff as inert text", async () => {
    const run = vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "diff", command: "git diff --no-color", stdout: "diff --git a/x b/x\n-old <b>\n+new\n", stderr: "", exitCode: 0, success: true, truncated: false });
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console shortcut" });
    await user.type(input, "lo");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: /look/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Tab}");
    expect(input).toHaveValue("look");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    await user.type(input, "d");
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", operationId: "diff" });
    expect(await screen.findByText("+new", { selector: ".console-tone--added" })).toBeInTheDocument();
    expect(screen.getByText(/-old <b>/, { selector: ".console-tone--removed" })).toBeInTheDocument();
    expect(document.querySelector(".console-block b")).toBeNull();
  });

  it("welcomes with the mark and where queries run, repeats a block, and clears with Ctrl+L", async () => {
    const run = vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "log", command: "git log --oneline", stdout: "abc1234 First\n", stderr: "", exitCode: 0, success: true, truncated: true });
    const user = userEvent.setup();
    renderConsole();
    const welcome = document.querySelector(".console-welcome");
    expect(welcome?.querySelector(".console-art")).toHaveAttribute("aria-hidden", "true");
    expect(welcome).toHaveTextContent(/projectDemo/);
    expect(welcome).toHaveTextContent(/linemain/);
    expect(welcome).toHaveTextContent(/git2\.47\.1/);
    expect(welcome).toHaveTextContent(/moderead-only/);
    expect(welcome).not.toHaveTextContent(/look · diff/);
    expect(screen.getByRole("combobox", { name: "Console shortcut" })).toHaveFocus();
    await user.type(screen.getByRole("combobox", { name: "Console shortcut" }), "log{Enter}");
    expect(await screen.findByText("abc1234", { selector: ".console-tone--hash" })).toBeInTheDocument();
    expect(screen.getByText("Shortened")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run again: log" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    await user.keyboard("{Control>}l{/Control}");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
  });

  it("carries the project facts in its status line, as the app status bar does elsewhere", () => {
    renderConsole();
    const status = screen.getByRole("contentinfo", { name: "Console status" });
    expect(status).toHaveTextContent("read-only");
    expect(status).not.toHaveTextContent("main");
    expect(status).toHaveTextContent("3 unsaved +12 −4");
    expect(status).toHaveTextContent("↑2 to publish");
    expect(status).not.toHaveTextContent("new");
    expect(status).toHaveTextContent("git 2.47.1");
  });

  it("opens the shortcut pane from the prompt and gives focus back to it on Escape", async () => {
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console shortcut" });
    await user.type(input, "shortcuts{Enter}");
    const pane = screen.getByRole("region", { name: "Console shortcuts" });
    expect(within(pane).getByRole("textbox", { name: "Shortcut name" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Console shortcuts" })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("follows the console settings: no suggestions, no welcome, steady larger text", async () => {
    const user = userEvent.setup();
    const lifecycle = createScreenLifecycleController("active");
    render(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="e"
        preferences={{ autocomplete: false, welcome: false, cursorBlink: false, textSize: "large" }} />
    </ScreenLifecycleProvider></LanguageProvider>);
    expect(document.querySelector(".console-art")).toBeNull();
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
    expect(document.querySelector(".console-panel")).toHaveClass("console-panel--text-large", "console-panel--steady-cursor");
    const input = screen.getByRole("combobox", { name: "Console shortcut" });
    await user.type(input, "lo");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("chooses a shortcut's query with a terminal-style picker", async () => {
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console shortcut" }), "shortcuts{Enter}");
    const picker = screen.getByRole("spinbutton", { name: "Git query" });
    expect(picker).toHaveAttribute("aria-valuetext", "Project status");
    picker.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(picker).toHaveAttribute("aria-valuetext", "Changes ready to save");
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(picker).toHaveAttribute("aria-valuetext", "Authors");
    await user.click(screen.getByRole("textbox", { name: "Shortcut name" }));
    await user.keyboard("who");
    picker.focus();
    await user.keyboard("{Enter}");
    const pane = screen.getByRole("region", { name: "Console shortcuts" });
    expect(within(pane).getByText("who").closest("li")).toHaveTextContent("Authors");
  });

  it("spends colouring newest first and shows older output that no longer fits as plain text", async () => {
    const lines = Array.from({ length: 150 }, (_, index) => `${(0x1000000 + index).toString(16)} change ${index}`).join("\n");
    vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "log", command: "git log", stdout: lines, stderr: "", exitCode: 0, success: true, truncated: false });
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console shortcut" });
    for (let run = 1; run <= 3; run += 1) {
      await user.type(input, "log{Enter}");
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(run));
    }
    // 150 coloured hashes each: two fit the 400-run budget, the oldest does not.
    const [oldest, middle, newest] = screen.getAllByRole("article");
    expect(newest.querySelectorAll(".console-tone")).toHaveLength(150);
    expect(middle.querySelectorAll(".console-tone")).toHaveLength(150);
    expect(oldest.querySelectorAll(".console-tone")).toHaveLength(0);
    expect(oldest).toHaveTextContent("1000000 change 0");
  });
});
