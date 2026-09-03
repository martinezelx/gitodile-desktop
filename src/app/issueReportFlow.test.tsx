import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { TitlebarMenu } from "./TitlebarMenu";
import { IssueReportErrorDialog } from "./IssueReportErrorDialog";
import { useIssueReport } from "./useIssueReport";
import type { IssueReportPort } from "./issueReportAdapter";

afterEach(() => { cleanup(); localStorage.clear(); });

function ReportHarness({ port }: { port: IssueReportPort }) {
  const report = useIssueReport("2.50.0", port);
  return <>
    <TitlebarMenu onOpenAbout={vi.fn()} onOpenChangelog={vi.fn()} onOpenProject={vi.fn()}
      onCreateProject={vi.fn()} onCloneProject={vi.fn()} onCloseProject={vi.fn()}
      onOpenSettings={vi.fn()} onOpenShortcuts={vi.fn()} hasProject={false}
      isOpeningProject={false} canReloadWindow isReportingIssue={report.isOpening}
      onReportIssue={() => void report.report()} />
    <IssueReportErrorDialog report={report} />
  </>;
}

it("reports a keyboard launch failure, copies the exact URL and retries with restored focus", async () => {
  const user = userEvent.setup();
  const port = { open: vi.fn().mockRejectedValueOnce(new Error("no browser")).mockResolvedValue(undefined), copy: vi.fn().mockResolvedValue(undefined) };
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  const trigger = screen.getByRole("button", { name: "More actions" });
  await user.click(trigger);
  await user.keyboard("{End}{ArrowUp}{ArrowUp}{Enter}");
  expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("Couldn't open the issue report");
  expect(screen.queryByRole("menu")).toBeNull();
  const attemptedUrl = port.open.mock.calls[0][0];
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(port.copy).toHaveBeenCalledWith(attemptedUrl);
  expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(port.open).toHaveBeenNthCalledWith(2, attemptedUrl);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(trigger).toHaveFocus();
});

it("keeps a selectable address when clipboard access fails, and dismisses with Escape", async () => {
  const user = userEvent.setup();
  const port = { open: vi.fn().mockRejectedValue(new Error("denied")), copy: vi.fn().mockRejectedValue(new Error("clipboard denied")) };
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  await user.click(screen.getByRole("button", { name: "More actions" }));
  const item = screen.getByRole("menuitem", { name: "Report an issue" });
  expect(item).not.toHaveAttribute("data-tooltip");
  expect(item).toHaveAccessibleDescription(/GitHub account is required; reports are public/);
  await user.click(item);
  await user.click(await screen.findByRole("button", { name: "Copy link" }));
  expect(screen.getByRole("status")).toHaveTextContent("copy it manually");
  const input = screen.getByRole("textbox", { name: "Report link" }) as HTMLInputElement;
  expect(input).toHaveValue(port.open.mock.calls[0][0]);
  await user.click(input);
  expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("coalesces repeated launches and ignores a late retry failure after dismissal", async () => {
  let rejectOpen!: (reason: Error) => void;
  const port = { open: vi.fn().mockRejectedValueOnce(new Error("no browser")), copy: vi.fn() };
  const { result } = renderHook(() => useIssueReport(null, port), { wrapper: LanguageProvider });
  await act(() => result.current.report());
  port.open.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectOpen = reject; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.retry(); void result.current.retry(); });
  expect(port.open).toHaveBeenCalledTimes(2);
  expect(result.current.isOpening).toBe(true);
  act(() => result.current.dismiss());
  await act(async () => { rejectOpen(new Error("late failure")); await pending; });
  expect(result.current.failedUrl).toBeNull();
  expect(result.current.isOpening).toBe(false);
});

it("does not reintroduce clipboard state after the error was dismissed", async () => {
  let resolveCopy!: () => void;
  const port = {
    open: vi.fn().mockRejectedValue(new Error("no browser")),
    copy: vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; })),
  };
  const { result } = renderHook(() => useIssueReport(null, port), { wrapper: LanguageProvider });
  await act(() => result.current.report());
  let pending!: Promise<void>;
  act(() => { pending = result.current.copyLink(); });
  act(() => result.current.dismiss());
  await act(async () => { resolveCopy(); await pending; });
  await waitFor(() => expect(result.current.copyState).toBe("idle"));
});
