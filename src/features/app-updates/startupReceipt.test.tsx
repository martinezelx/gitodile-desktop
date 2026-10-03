import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import type { StartupUpdateConfirmation } from "./domain";
import { useStartupUpdateReceipt } from "./startupReceipt";

function Receipt(props: {
  confirmation: StartupUpdateConfirmation;
  onOpenWhatsNew?: () => void;
  onOpenDialog: () => void;
}) {
  useStartupUpdateReceipt(props);
  return null;
}

function renderReceipt(props: Parameters<typeof Receipt>[0]) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <Receipt {...props} />
      </ToastProvider>
    </LanguageProvider>,
  );
}

afterEach(cleanup);

describe("startup update receipt", () => {
  it("confirms a finished update with a toast that leads to What's new, not with the update dialog", async () => {
    const user = userEvent.setup();
    const onOpenWhatsNew = vi.fn();
    const onOpenDialog = vi.fn();
    renderReceipt({ confirmation: { kind: "confirmed", version: "0.3.1" }, onOpenWhatsNew, onOpenDialog });
    expect(screen.getByText("Updated to 0.3.1")).toBeInTheDocument();
    expect(onOpenDialog).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "See what's new" }));
    expect(onOpenWhatsNew).toHaveBeenCalledOnce();
  });

  it("offers nothing to open when the version has no highlights", () => {
    renderReceipt({ confirmation: { kind: "confirmed", version: "0.3.1" }, onOpenDialog: vi.fn() });
    expect(screen.getByText("Updated to 0.3.1")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens the update dialog, once, when the restart was not confirmed", () => {
    const onOpenDialog = vi.fn();
    const error = { code: "post_install_unconfirmed" as const, stage: "startup" as const, retryable: false };
    const confirmation: StartupUpdateConfirmation = { kind: "unconfirmed", expectedVersion: "0.3.1", error };
    const { rerender } = renderReceipt({ confirmation, onOpenDialog });
    rerender(
      <LanguageProvider>
        <ToastProvider>
          <Receipt confirmation={{ ...confirmation }} onOpenDialog={onOpenDialog} />
        </ToastProvider>
      </LanguageProvider>,
    );
    expect(onOpenDialog).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Updated to/)).toBeNull();
  });

  it("says nothing on an ordinary launch", () => {
    const onOpenDialog = vi.fn();
    renderReceipt({ confirmation: { kind: "none" }, onOpenDialog });
    expect(onOpenDialog).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
