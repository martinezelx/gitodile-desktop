import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { GitLabAccountSection } from "./GitLabAccountSection";
import { EMPTY_GITLAB_AUTH } from "./domain";
import type { GitLabAuthController } from "./useGitLabAuth";
afterEach(() => { cleanup(); localStorage.clear(); });
function controller(overrides: Partial<GitLabAuthController> = {}): GitLabAuthController {
  return { snapshot: EMPTY_GITLAB_AUTH, pending: false, check: vi.fn(async () => {}), connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), cancel: vi.fn(async () => {}), ...overrides };
}
const account = { id: "gitlab:cli.42", provider: "gitlab", host: "gitlab.com", login: "user.with_dot", avatarDataUrl: null, available: true };

it("renders nothing without a session, work in progress or a problem", () => {
  const view = render(<LanguageProvider><GitLabAccountSection controller={controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "signed_out" } })} available /></LanguageProvider>);
  expect(view.container).toBeEmptyDOMElement();
});

it("shows one row without repeating the connected state and signs out only the confirmed stable ID", async () => {
  const api = controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "connected", account } });
  render(<LanguageProvider><GitLabAccountSection controller={api} available /></LanguageProvider>);
  const row = within(screen.getByRole("group", { name: "@user.with_dot" }));
  expect(row.getByText("Connected")).toBeInTheDocument();
  expect(row.getByText("Browser")).toBeInTheDocument();
  expect(screen.getAllByText("Connected")).toHaveLength(1);
  const trigger = screen.getByRole("button", { name: "Sign out" });
  await userEvent.click(trigger);
  expect(api.disconnect).not.toHaveBeenCalled();
  const consent = screen.getByRole("group", { name: "Sign out" });
  expect(within(consent).getByRole("button", { name: "Sign out" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
  await userEvent.click(within(screen.getByRole("group", { name: "Sign out" })).getByRole("button", { name: "Sign out" }));
  expect(api.disconnect).toHaveBeenCalledWith("gitlab:cli.42");
});

it("shows progress with a way to cancel while glab works", async () => {
  const api = controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "awaiting_browser", operationId: "gitlab-auth-1" } });
  render(<LanguageProvider><GitLabAccountSection controller={api} available /></LanguageProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for GitLab authorization");
  await userEvent.click(screen.getByRole("button", { name: "Cancel connection" }));
  expect(api.cancel).toHaveBeenCalledOnce();
});

it("reports a failure, a session that needs checking, and disables sign-out without glab", () => {
  const { rerender } = render(<LanguageProvider><GitLabAccountSection controller={controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "offline", needsCheck: true } })} available /></LanguageProvider>);
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach GitLab");
  expect(screen.getByText(/Check the accounts before trying again/)).toBeInTheDocument();
  rerender(<LanguageProvider><GitLabAccountSection controller={controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "connected", account } })} available={false} /></LanguageProvider>);
  expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
});
