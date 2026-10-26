import React, { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, useLanguage } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import { AccountControl } from "./AccountControl";
import { AccountOverlays } from "./AccountOverlays";
import { createAccountController } from "./controller";
import { createMockAccountPort } from "./mockAdapter";
import { SIGNED_OUT, transitionAccount } from "./domain";

beforeEach(() => { vi.useFakeTimers(); localStorage.setItem("gitodile-language", "en"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("account attempts", () => {
  it("ignores late results after cancellation and supersession", () => {
    const request = { id: 1, code: "GTDL · 4821", startedAt: 0 };
    const first = transitionAccount(SIGNED_OUT, { kind: "start", request });
    const replacement = transitionAccount(first, { kind: "start", request: { ...request, id: 2 } });
    const complete = { kind: "complete", requestId: 1, outcome: "pro", identity: { name: "Demo", email: "demo@example.com", initials: "D", pro: true } } as const;
    expect(transitionAccount(replacement, complete)).toBe(replacement);
    expect(transitionAccount(transitionAccount(first, { kind: "clear" }), complete)).toBe(SIGNED_OUT);
  });

  it.each(["success", "pro", "offline", "unfinished", "expired", "cancelled"] as const)("resolves %s without I/O", (outcome) => {
    const port = createMockAccountPort(100);
    port.setScenario(outcome);
    const original = port.start();
    port.reopen(); port.reopen();
    expect(port.getSnapshot()).toMatchObject({ kind: "waiting", request: original, reopened: 2 });
    vi.advanceTimersByTime(100);
    if (outcome === "success" || outcome === "pro") expect(port.getSnapshot()).toMatchObject({ kind: "signed-in", identity: { pro: outcome === "pro" } });
    else if (outcome === "cancelled") expect(port.getSnapshot()).toEqual(SIGNED_OUT);
    else expect(port.getSnapshot()).toEqual({ kind: "failed", reason: outcome });
    port.dispose();
  });

  it("reopening does not reschedule; retry replaces a pending timer; disposal clears it", () => {
    const port = createMockAccountPort(100);
    const listener = vi.fn();
    const unsubscribe = port.subscribe(listener);
    const first = port.start();
    vi.advanceTimersByTime(70); port.reopen();
    vi.advanceTimersByTime(30);
    expect(port.getSnapshot().kind).toBe("signed-in");
    port.signOut(); expect(port.getSnapshot()).toEqual(SIGNED_OUT);
    port.start(); vi.advanceTimersByTime(50);
    const retry = port.start();
    expect(retry.id).toBeGreaterThan(first.id);
    expect(retry.code).not.toBe(first.code);
    vi.advanceTimersByTime(50); expect(port.getSnapshot().kind).toBe("waiting");
    port.cancel(); vi.advanceTimersByTime(100); expect(port.getSnapshot()).toEqual(SIGNED_OUT);
    port.start(); port.dispose(); expect(vi.getTimerCount()).toBe(0);
    unsubscribe(); listener.mockClear(); port.start(); expect(listener).not.toHaveBeenCalled(); port.dispose();
  });

  it("holds waiting indefinitely and cleans up the last controller subscription", () => {
    const port = createMockAccountPort(100);
    const controller = createAccountController(port, port.setScenario);
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    controller.setScenario("waiting"); controller.start();
    vi.advanceTimersByTime(60_000); expect(controller.getSnapshot().account.kind).toBe("waiting");
    controller.cancel(); controller.setScenario("success"); controller.start();
    unsubscribe(); expect(vi.getTimerCount()).toBe(0);
    const reconnected = controller.subscribe(listener);
    controller.start(); vi.advanceTimersByTime(100);
    expect(controller.getSnapshot().account.kind).toBe("signed-in"); reconnected();
  });

  it("reset cancels the attempt and restores Free for the next sign-in", () => {
    const port = createMockAccountPort(100);
    const controller = createAccountController(port, port.setScenario);
    const stop = controller.subscribe(() => undefined);
    controller.setScenario("pro"); controller.start();
    controller.reset();
    vi.advanceTimersByTime(100);
    expect(controller.getSnapshot()).toMatchObject({ account: SIGNED_OUT, scenario: "success" });
    controller.start(); vi.advanceTimersByTime(100);
    expect(controller.getSnapshot().account).toMatchObject({ kind: "signed-in", identity: { pro: false } });
    stop();
  });

  it("clears the timer when a subscriber immediately cancels or retries", () => {
    const port = createMockAccountPort(100);
    const stop = port.subscribe(() => {
      if (port.getSnapshot().kind === "waiting") port.cancel();
    });
    port.start();
    expect(port.getSnapshot()).toEqual(SIGNED_OUT);
    expect(vi.getTimerCount()).toBe(0);
    stop();
    const retry = port.subscribe(() => {
      const state = port.getSnapshot();
      if (state.kind === "waiting" && state.request.id === 2) port.start();
    });
    port.start();
    expect(port.getSnapshot()).toMatchObject({ kind: "waiting", request: { id: 3 } });
    expect(vi.getTimerCount()).toBe(1);
    port.cancel();
    expect(vi.getTimerCount()).toBe(0);
    retry();
  });

  it("reconciles state on first subscription and notifies each subscriber once", () => {
    const port = createMockAccountPort(100);
    const controller = createAccountController(port, port.setScenario);
    port.start(); vi.advanceTimersByTime(100);
    const listener = vi.fn();
    const stop = controller.subscribe(listener);
    expect(controller.getSnapshot().account.kind).toBe("signed-in");
    stop();

    let notifications = 0;
    let unsubscribe = (): void => undefined;
    const resubscribe = (): void => {
      notifications += 1;
      // Replacing a listener during an emission must not visit it repeatedly.
      if (notifications < 3) { unsubscribe(); unsubscribe = port.subscribe(resubscribe); }
    };
    unsubscribe = port.subscribe(resubscribe);
    port.reopen();
    port.start();
    expect(notifications).toBe(1);
    unsubscribe(); port.dispose();
  });
});

function LanguageSwitch(): React.JSX.Element {
  const { setLanguagePreference } = useLanguage();
  return <button type="button" onClick={() => setLanguagePreference("es")}>Change language</button>;
}

function setup(compact = false, extra?: React.ReactNode) {
  const port = createMockAccountPort(1000);
  const controller = createAccountController(port, port.setScenario);
  const result = render(<StrictMode><LanguageProvider><ToastProvider dismissLabel="Close">
    <AccountControl controller={controller} compact={compact} />
    {extra}
    <AccountOverlays controller={controller} />
  </ToastProvider></LanguageProvider></StrictMode>);
  const trigger = screen.getByRole(compact ? "menuitem" : "button", { name: "Sign in · Account demo" });
  fireEvent.click(trigger);
  return { controller, trigger, ...result };
}

describe("account surfaces", () => {
  it("operates the popover and waiting dialog with the keyboard", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.selectOptions(screen.getByLabelText("Demo result"), "waiting");
    await user.tab();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Waiting for the browser…" });
    await user.tab();
    expect(within(dialog).getAllByRole("button", { name: "Cancel" })[0]).toHaveFocus();
    await user.tab(); await user.tab();
    expect(within(dialog).getByRole("button", { name: "Open again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(dialog).getByRole("status")).toHaveTextContent("The request code is unchanged");
    await user.tab();
    expect(within(dialog).getAllByRole("button", { name: "Cancel" })[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });

  it("renders Spanish copy synchronously", () => {
    localStorage.setItem("gitodile-language", "es");
    const port = createMockAccountPort();
    const controller = createAccountController(port, port.setScenario);
    render(<LanguageProvider><AccountControl controller={controller} /><AccountOverlays controller={controller} /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión · Demo de cuenta" }));
    expect(screen.getByText("Opcional. Todo lo local funciona igual sin ella.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Resultado de la demo"), { target: { value: "expired" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(screen.getByRole("dialog", { name: "Esperando al navegador…" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.getByText("Tus proyectos y tus versiones guardadas siguen igual.")).toBeInTheDocument();
  });

  it.each([false, true])("completes from the rail/compact entry (%s) and signs out", (compact) => {
    setup(compact);
    expect(screen.getByText("Optional. All local work works the same without it.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Demo result"), { target: { value: "pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog", { name: "Waiting for the browser…" })).toHaveClass("app-dialog--s");
    expect(document.querySelector("input")).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Signed in\. Hello, Luis Martinez/)).toHaveLength(1);
    const signedInControl = screen.getByRole(compact ? "menuitem" : "button", { name: "Luis Martinez · Account demo" });
    expect(signedInControl).toHaveAccessibleDescription("Signed in");
    expect(within(signedInControl).getByText("LM")).toBeInTheDocument();
    fireEvent.click(signedInControl);
    expect(screen.getByText("PRO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plan and billing/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole(compact ? "menuitem" : "button", { name: "Sign in · Account demo" })).toBeInTheDocument();
  });

  it.each(["escape", "cancel", "close", "backdrop"])("cancels through %s and prevents late success", (path) => {
    const { trigger } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    act(() => vi.advanceTimersByTime(30));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Open again" }));
    expect(screen.getByText("GTDL · 4821")).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("The request code is unchanged");
    if (path === "escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (path === "backdrop") fireEvent.mouseDown(dialog.parentElement!);
    else fireEvent.click(within(dialog).getAllByRole("button", { name: "Cancel" })[path === "close" ? 0 : 1]);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus(); expect(screen.queryByText(/Signed in\./)).not.toBeInTheDocument();
  });

  it.each(["offline", "unfinished", "expired"])("offers retry for %s, keeping local work safe", (scenario) => {
    const { controller } = setup();
    fireEvent.change(screen.getByLabelText("Demo result"), { target: { value: scenario } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" })); act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Your projects and saved versions are unaffected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Demo result"), { target: { value: "waiting" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("GTDL · 4822")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000)); expect(controller.getSnapshot().account.kind).toBe("waiting");
  });

  it("dismisses the popover with Escape and restores focus", () => {
    const { trigger } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });

  it("closes when keyboard focus leaves, and does not steal it on language changes", () => {
    const { controller, trigger } = setup(false, <LanguageSwitch />);
    const elsewhere = screen.getByRole("button", { name: "Change language" });
    act(() => {
      screen.getByRole("button", { name: "Sign in" }).focus();
      elsewhere.focus();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
    // Re-rendering translated overlays used to focus the old account anchor.
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => elsewhere.focus());
    fireEvent.click(elsewhere);
    expect(screen.getByRole("button", { name: "Iniciar sesión · Demo de cuenta" })).toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
    act(() => controller.closePopover(true));
    expect(elsewhere).toHaveFocus();
  });

  it("keeps expanded state and dismissal focus on the initiating control", () => {
    const port = createMockAccountPort();
    const controller = createAccountController(port, port.setScenario);
    render(<LanguageProvider><AccountControl controller={controller} /><AccountControl controller={controller} compact /><AccountOverlays controller={controller} /></LanguageProvider>);
    const rail = screen.getByRole("button", { name: "Sign in · Account demo" });
    const menu = screen.getByRole("menuitem", { name: "Sign in · Account demo" });
    expect(menu).toHaveAttribute("tabindex", "-1");
    fireEvent.click(rail);
    expect(rail).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(rail).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).toHaveFocus();
  });
});
