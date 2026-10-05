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
it("missing glab disables browser actions and describes the single session", () => {
  const api = controller();
  render(<LanguageProvider><GitLabAccountSection controller={api} available={false} /></LanguageProvider>);
  expect(screen.getByRole("button", { name: "Connect GitLab" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Check connection" })).toBeDisabled();
  expect(screen.getByText(/glab connects one GitLab.com account/)).toBeVisible();
  expect(document.body.textContent).not.toContain("GitHub");
  expect(api.connect).not.toHaveBeenCalled();
});
it("requires a checked empty session and explicit browser consent", async () => {
  const api = controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "signed_out" } });
  render(<LanguageProvider><GitLabAccountSection controller={api} available /></LanguageProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Connect GitLab" }));
  expect(api.connect).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Continue in browser" })).toHaveFocus();
  expect(screen.getByText(/plaintext configuration file/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Continue in browser" }));
  expect(api.connect).toHaveBeenCalledOnce();
});
it("signs out only the confirmed stable connection ID", async () => {
  const account = { id: "gitlab:cli.42", provider: "gitlab", host: "gitlab.com", login: "user.with_dot", avatarDataUrl: null, available: true };
  const api = controller({ snapshot: { ...EMPTY_GITLAB_AUTH, state: "connected", account } });
  render(<LanguageProvider><GitLabAccountSection controller={api} available /></LanguageProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(api.disconnect).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole("group", { name: "Sign out" })).getByRole("button", { name: "Sign out" }));
  expect(api.disconnect).toHaveBeenCalledWith("gitlab:cli.42");
});
