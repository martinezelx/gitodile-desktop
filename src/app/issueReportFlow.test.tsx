import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { TitlebarMenu } from "./TitlebarMenu";
import { IssueReportDialog } from "./IssueReportDialog";
import { useIssueReport } from "./useIssueReport";
import type { IssueReportPort } from "./issueReportAdapter";

afterEach(() => { cleanup(); localStorage.clear(); });

const REPORT = "Environment\n-----------\nGitOdile test\nSystem: Windows 11 (x86_64)\n\nSession activity\n----------------\nStarted: 2026-09-04T14:23:05Z\nDuration: under 1 sec\nEvents: 1 retained of 2 (1 older events omitted)\n\n+00:00.012  command  read-only  open_repository  ok";

function makePort(overrides: Partial<IssueReportPort> = {}): IssueReportPort {
  return {
    render: vi.fn().mockResolvedValue(REPORT),
    open: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function ReportHarness({ port }: { port: IssueReportPort }) {
  const report = useIssueReport("2.50.0", port);
  return <>
    <TitlebarMenu onOpenAbout={vi.fn()} onOpenChangelog={vi.fn()} onOpenProject={vi.fn()}
      onCreateProject={vi.fn()} onCloneProject={vi.fn()} onCloseProject={vi.fn()}
      onOpenSettings={vi.fn()} onOpenShortcuts={vi.fn()} hasProject={false}
      isOpeningProject={false} canReloadWindow isReportingIssue={report.isOpening}
      onReportIssue={() => void report.report()} />
    <IssueReportDialog report={report} />
  </>;
}

async function openReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Report an issue" }));
  await screen.findByRole("dialog", { name: "Review issue report" });
}

it("reviews the exact report before copying, saving or opening GitHub", async () => {
  const user = userEvent.setup();
  const port = makePort();
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);

  await openReview(user);
  expect(port.open).not.toHaveBeenCalled();
  // The reviewer sees the published bytes themselves, not a rendering of them.
  const contents = screen.getByRole("region", { name: "Report contents" });
  expect(contents.tagName).toBe("PRE");
  expect(contents.textContent).toBe(REPORT);
  expect(contents.querySelector("textarea")).toBeNull();
  expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
  expect(screen.getByText(/attach it to the issue yourself/i)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(port.copy).toHaveBeenCalledWith(REPORT);
  expect(screen.getByRole("status")).toHaveTextContent("Report copied.");

  await user.click(screen.getByRole("button", { name: "Save report…" }));
  expect(port.save).toHaveBeenCalledWith(REPORT);
  expect(screen.getByRole("status")).toHaveTextContent("Report saved.");

  await user.click(screen.getByRole("button", { name: "Open issue" }));
  const opened = new URL(vi.mocked(port.open).mock.calls[0][0]);
  // The address seeds the required field with the versions; the activity the
  // user just reviewed reaches the issue by paste or attachment.
  expect(opened.searchParams.get("diagnostics"))
    .toBe("GitOdile test\nSystem: Windows 11 (x86_64)");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps browser failure, retry and manual-link recovery in the same dialog", async () => {
  const user = userEvent.setup();
  const port = makePort({
    open: vi.fn().mockRejectedValueOnce(new Error("no browser")).mockResolvedValue(undefined),
  });
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  const trigger = screen.getByRole("button", { name: "More actions" });
  await openReview(user);
  await user.click(screen.getByRole("button", { name: "Open issue" }));

  expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("Couldn't open the issue report");
  const attemptedUrl = vi.mocked(port.open).mock.calls[0][0];
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(port.copy).toHaveBeenCalledWith(attemptedUrl);
  expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
  const input = screen.getByRole("textbox", { name: "Report link" }) as HTMLInputElement;
  await user.click(input);
  expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(port.open).toHaveBeenNthCalledWith(2, attemptedUrl);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(trigger).toHaveFocus();
});

it("falls back to a reviewable environment report when session rendering is unavailable", async () => {
  const user = userEvent.setup();
  const port = makePort({ render: vi.fn().mockRejectedValue(new Error("no native bridge")) });
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  await openReview(user);
  expect(screen.getByRole("region", { name: "Report contents" }))
    .toHaveTextContent("Session activity was unavailable.");
  expect(port.open).not.toHaveBeenCalled();
});

it("coalesces repeated preparation and ignores a late result after dismissal", async () => {
  let resolveRender!: (report: string) => void;
  const port = makePort({ render: vi.fn(() => new Promise<string>((resolve) => { resolveRender = resolve; })) });
  const { result } = renderHook(() => useIssueReport(null, port), { wrapper: LanguageProvider });
  let pending!: Promise<void>;
  act(() => { pending = result.current.report(); void result.current.report(); });
  expect(port.render).toHaveBeenCalledTimes(1);
  act(() => result.current.dismiss());
  await act(async () => { resolveRender(REPORT); await pending; });
  expect(result.current.phase).toBe("closed");
  expect(result.current.reportText).toBeNull();
});

it("does not reintroduce clipboard state after dismissal", async () => {
  let resolveCopy!: () => void;
  const port = makePort({ copy: vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; })) });
  const { result } = renderHook(() => useIssueReport(null, port), { wrapper: LanguageProvider });
  await act(() => result.current.report());
  let pending!: Promise<void>;
  act(() => { pending = result.current.copyReport(); });
  act(() => result.current.dismiss());
  await act(async () => { resolveCopy(); await pending; });
  await waitFor(() => expect(result.current.copyReportState).toBe("idle"));
});
