import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { autoHideScrollbarProps } from "./autoHideScrollbar";

afterEach(cleanup);

describe("autoHideScrollbarProps", () => {
  it("activates for a mouse pointer and clears on exit", () => {
    render(
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="auto-hide-scrollbar"
        data-testid="scroll-area"
      />,
    );
    const area = screen.getByTestId("scroll-area");

    fireEvent.pointerEnter(area, { pointerType: "mouse" });
    expect(area).toHaveClass("auto-hide-scrollbar--pointer-active");

    fireEvent.pointerLeave(area, { pointerType: "mouse" });
    expect(area).not.toHaveClass("auto-hide-scrollbar--pointer-active");
  });

  it("does not activate for touch input", () => {
    render(
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="auto-hide-scrollbar"
        data-testid="scroll-area"
      />,
    );

    fireEvent.pointerEnter(screen.getByTestId("scroll-area"), { pointerType: "touch" });
    expect(screen.getByTestId("scroll-area")).not.toHaveClass(
      "auto-hide-scrollbar--pointer-active",
    );
  });
});
