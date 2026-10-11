import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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
    expect(area).toHaveAttribute("data-pointer-active");

    fireEvent.pointerLeave(area, { pointerType: "mouse" });
    expect(area).not.toHaveAttribute("data-pointer-active");
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
    expect(screen.getByTestId("scroll-area")).not.toHaveAttribute("data-pointer-active");
  });

  it("stays active when a re-render changes the caller's className", () => {
    let setView: (view: string) => void = () => {};
    function Area() {
      const [view, update] = useState("overview");
      setView = update;
      return (
        <div
          {...autoHideScrollbarProps<HTMLDivElement>()}
          className={`workspace workspace--${view} auto-hide-scrollbar`}
          data-testid="scroll-area"
        />
      );
    }
    render(<Area />);
    const area = screen.getByTestId("scroll-area");

    fireEvent.pointerEnter(area, { pointerType: "mouse" });
    act(() => setView("history"));

    expect(area).toHaveClass("workspace--history");
    expect(area).toHaveAttribute("data-pointer-active");

    fireEvent.pointerLeave(area, { pointerType: "mouse" });
    expect(area).not.toHaveAttribute("data-pointer-active");
  });
});
