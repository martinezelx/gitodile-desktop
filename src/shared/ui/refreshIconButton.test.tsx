import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RefreshIconButton } from "./refreshIconButton";

describe("RefreshIconButton", () => {
  it("uses the same animated icon and busy label for every screen", () => {
    render(
      <RefreshIconButton
        label="Refresh"
        busyLabel="Refreshing…"
        busy
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Refreshing…" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent("Refreshing");
    expect(button.querySelector("svg")).toHaveClass("icon--spinning");
  });
});
