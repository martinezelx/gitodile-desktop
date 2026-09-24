import React, { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockedComposerFocus } from "./dockedComposer";

type Props = { canFold?: boolean; busy?: boolean; onFold: (anchored: boolean) => void };

/** A docked box reduced to what the hook reads: a field, words that take no
 * focus, a disabled button, and something else on the page to press. */
function Box({ canFold = true, busy = false, onFold }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const handlers = useDockedComposerFocus({
    containerRef,
    fieldRef,
    expanded,
    busy,
    canFold,
    onOpen: () => setExpanded(true),
    onFold: (anchored) => {
      onFold(anchored);
      setExpanded(false);
    },
  });
  return (
    <>
      <div ref={containerRef} data-expanded={expanded} {...handlers}>
        <input ref={fieldRef} aria-label="field" disabled={busy} />
        <span>option words</span>
        <button type="button" disabled>
          disabled action
        </button>
      </div>
      <button type="button">elsewhere</button>
    </>
  );
}

function expandedState(): string | null {
  return screen.getByLabelText("field").parentElement?.getAttribute("data-expanded") ?? null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useDockedComposerFocus", () => {
  // jsdom's `hasFocus()` is false in the middle of any blur; a browser answers
  // true while the window has focus. Pin the browser's answer.
  beforeEach(() => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  it("opens on focus and folds, anchored, on a keyboard move away", async () => {
    const onFold = vi.fn();
    render(<Box onFold={onFold} />);
    await userEvent.click(screen.getByLabelText("field"));
    expect(expandedState()).toBe("true");

    act(() => screen.getByRole("button", { name: "elsewhere" }).focus());

    expect(onFold).toHaveBeenCalledWith(true);
    expect(expandedState()).toBe("false");
  });

  it("lets a press elsewhere land first, then folds without anchoring", async () => {
    const onFold = vi.fn();
    render(<Box onFold={onFold} />);
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    let foldsWhenClicked = -1;
    elsewhere.addEventListener("click", () => {
      foldsWhenClicked = onFold.mock.calls.length;
    });
    await userEvent.click(screen.getByLabelText("field"));

    await userEvent.click(elsewhere);

    expect(foldsWhenClicked).toBe(0);
    await waitFor(() => expect(onFold).toHaveBeenCalledWith(false));
  });

  it("does not fold for a press inside on something that takes no focus, and gives focus back", async () => {
    const onFold = vi.fn();
    render(<Box onFold={onFold} />);
    const field = screen.getByLabelText("field");
    await userEvent.click(field);

    await userEvent.click(screen.getByText("option words"));
    await userEvent.click(screen.getByRole("button", { name: "disabled action" }));

    await waitFor(() => expect(field).toHaveFocus());
    expect(onFold).not.toHaveBeenCalled();
    expect(expandedState()).toBe("true");
  });

  it("does not fold when the window, not the box, loses focus", async () => {
    const onFold = vi.fn();
    render(<Box onFold={onFold} />);
    const field = screen.getByLabelText("field");
    await userEvent.click(field);

    vi.mocked(document.hasFocus).mockReturnValue(false);
    act(() => field.blur());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onFold).not.toHaveBeenCalled();
  });

  it("does not fold while there is something to lose", async () => {
    const onFold = vi.fn();
    render(<Box canFold={false} onFold={onFold} />);
    await userEvent.click(screen.getByLabelText("field"));

    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onFold).not.toHaveBeenCalled();
  });

  it("forgets a press whose release the window never saw, so a keyboard move folds at once", async () => {
    const onFold = vi.fn();
    render(<Box onFold={onFold} />);
    await userEvent.click(screen.getByLabelText("field"));

    // Pressed, then the window lost focus before the release arrived.
    fireEvent.pointerDown(window);
    fireEvent.blur(window);
    act(() => screen.getByRole("button", { name: "elsewhere" }).focus());

    expect(onFold).toHaveBeenCalledWith(true);
  });

  it("gives focus back to the field when a request ends, unless the reader put it elsewhere", async () => {
    const onFold = vi.fn();
    const { rerender } = render(<Box onFold={onFold} canFold={false} />);
    const field = screen.getByLabelText("field");
    await userEvent.click(field);

    // A request in flight disables the field, which drops focus to the page.
    // (jsdom keeps focus on a disabled field, so the drop is made by hand.)
    act(() => field.blur());
    rerender(<Box onFold={onFold} canFold={false} busy />);
    expect(document.activeElement).toBe(document.body);
    rerender(<Box onFold={onFold} canFold={false} />);
    expect(field).toHaveFocus();

    // Focus the reader moved during the request stays where they put it.
    rerender(<Box onFold={onFold} canFold={false} busy />);
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    act(() => elsewhere.focus());
    rerender(<Box onFold={onFold} canFold={false} />);
    expect(elsewhere).toHaveFocus();
  });
});
