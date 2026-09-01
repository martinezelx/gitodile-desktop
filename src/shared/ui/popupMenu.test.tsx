import React, { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePortalFlyout } from "./popupMenu";

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

type FocusTarget = Parameters<typeof usePortalFlyout>[4];
type Alignment = Parameters<typeof usePortalFlyout>[3];

function Flyout({
  focusTarget,
  alignment = "below",
  children,
}: {
  focusTarget?: FocusTarget;
  alignment?: Alignment;
  children: ReactNode;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { popupRef, style } = usePortalFlyout(
    isOpen,
    triggerRef,
    () => setIsOpen(false),
    alignment,
    focusTarget,
  );

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen((open) => !open)}>
        Open
      </button>
      <button type="button">Elsewhere</button>
      {isOpen &&
        createPortal(
          <div ref={popupRef} style={style} tabIndex={-1} data-testid="popup">
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Records what the popup's visibility *was* each time something inside it is
 * focused.
 *
 * This is the whole point of the file. jsdom happily focuses a
 * `visibility: hidden` element, so asserting `document.activeElement` alone
 * passes whether the bug is present or not — which is exactly how the bug
 * survived: every focus-on-open test in the repository was green while the real
 * browser focused nothing. What jsdom *can* answer faithfully is the computed
 * style at a given moment, so that is what these tests pin.
 */
function recordVisibilityAtFocus(): string[] {
  const seen: string[] = [];
  const original = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    const popup = this.closest('[data-testid="popup"]');
    if (popup instanceof HTMLElement) seen.push(window.getComputedStyle(popup).visibility);
    original.call(this, options);
  });
  return seen;
}

const open = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
};

describe("usePortalFlyout focus", () => {
  it("focuses the first menu item, and only once the popup is visible", () => {
    const seen = recordVisibilityAtFocus();
    render(
      <Flyout>
        <button type="button" role="menuitem">
          First item
        </button>
      </Flyout>,
    );

    open();

    // The popup is rendered hidden until the anchor measurement lands. Focusing
    // during that frame is a no-op in a real browser.
    expect(seen).toEqual(["visible"]);
    expect(screen.getByRole("menuitem", { name: "First item" })).toHaveFocus();
  });

  it("focuses the first control the same way", () => {
    const seen = recordVisibilityAtFocus();
    render(
      <Flyout focusTarget="first-control">
        <input aria-label="Search" />
      </Flyout>,
    );

    open();

    expect(seen).toEqual(["visible"]);
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
  });

  it("focuses the popup itself for a surface that is read rather than operated", () => {
    const seen = recordVisibilityAtFocus();
    render(
      <Flyout focusTarget="container">
        <button type="button">Clear all</button>
      </Flyout>,
    );

    open();

    expect(seen).toEqual(["visible"]);
    // Deliberately not the button: landing on a destructive control because it
    // happens to be first in the DOM is what this target exists to avoid.
    expect(screen.getByTestId("popup")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Clear all" })).not.toHaveFocus();
  });

  it("leaves the caret alone for a popup that opens on hover", () => {
    const seen = recordVisibilityAtFocus();
    render(
      <Flyout focusTarget="none">
        <button type="button" role="menuitem">
          First item
        </button>
      </Flyout>,
    );
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();

    open();

    // The sidebar jump menu opens when the pointer crosses its trigger and
    // closes itself again on mouse-leave. Taking focus would move the caret on
    // a hover and then destroy the element holding it.
    expect(seen).toEqual([]);
    expect(trigger).toHaveFocus();
  });

  it("does not take focus back when the popup is re-measured", () => {
    const seen = recordVisibilityAtFocus();
    const { rerender } = render(
      <Flyout>
        <button type="button" role="menuitem">
          First item
        </button>
      </Flyout>,
    );

    open();
    expect(seen).toHaveLength(1);

    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    // A changed alignment re-runs the measurement and produces a fresh position
    // object. Focusing on every position would yank the caret back out of
    // wherever the reader had moved it.
    rerender(
      <Flyout alignment="side">
        <button type="button" role="menuitem">
          First item
        </button>
      </Flyout>,
    );

    expect(seen).toHaveLength(1);
    expect(elsewhere).toHaveFocus();
  });

  it("focuses again the next time it opens", () => {
    const seen = recordVisibilityAtFocus();
    render(
      <Flyout>
        <button type="button" role="menuitem">
          First item
        </button>
      </Flyout>,
    );

    open();
    open();
    open();

    expect(seen).toEqual(["visible", "visible"]);
  });
});
