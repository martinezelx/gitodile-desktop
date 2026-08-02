import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingBar } from "./loadingBar";

describe("LoadingBar", () => {
  it("announces an accessible label without forcing it on screen", () => {
    render(<LoadingBar label="Loading changes" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading changes");
    expect(screen.getByText("Loading changes")).toHaveClass("visually-hidden");
  });

  it("can preserve a previously visible loading message", () => {
    render(<LoadingBar label="Loading version lines" showLabel />);
    expect(screen.getByText("Loading version lines")).toHaveClass("loading-state__message");
  });
});
