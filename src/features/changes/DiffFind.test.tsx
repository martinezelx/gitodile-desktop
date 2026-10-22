import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { translations } from "../../i18n";
import { DiffFind } from "./DiffFind";

const t = translations.en;

afterEach(cleanup);

function Host(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <DiffFind
      isOpen={isOpen}
      query={query}
      onQueryChange={setQuery}
      onOpen={() => setIsOpen(true)}
      onClose={() => {
        setIsOpen(false);
        setQuery("");
      }}
      t={t}
    />
  );
}

const magnifier = (): HTMLElement =>
  screen.getByRole("button", { name: t.changesSearchDiffAriaLabel });

describe("the diff find", () => {
  it("drops a portalled field below the magnifier and takes the caret", () => {
    render(<Host />);
    expect(screen.queryByRole("search")).toBeNull();

    fireEvent.click(magnifier());

    // Portalled to the body rather than grown inside the strip: the row keeps
    // its width, so the arrows and the reading picker never move.
    const box = screen.getByRole("search", { name: t.changesSearchDiffAriaLabel });
    expect(box.parentElement).toBe(document.body);
    expect(screen.getByRole("searchbox", { name: t.changesSearchDiffAriaLabel })).toHaveFocus();
    expect(magnifier()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape and gives the caret back to the magnifier", () => {
    render(<Host />);
    fireEvent.click(magnifier());

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("search")).toBeNull();
    expect(magnifier()).toHaveFocus();
  });

  it("toggles closed when its own magnifier is pressed again", () => {
    render(<Host />);
    fireEvent.click(magnifier());
    fireEvent.click(magnifier());

    expect(screen.queryByRole("search")).toBeNull();
  });

  it("holds the query while the diff is scrolled", () => {
    render(<Host />);
    fireEvent.click(magnifier());
    const input = screen.getByRole("searchbox", { name: t.changesSearchDiffAriaLabel });
    fireEvent.change(input, { target: { value: "palette" } });

    fireEvent.scroll(window);

    expect(input).toHaveValue("palette");
    expect(screen.getByRole("search", { name: t.changesSearchDiffAriaLabel })).toBeInTheDocument();
  });

  it("plays an exit animation before the field unmounts", () => {
    render(<Host />);
    fireEvent.click(magnifier());

    fireEvent.keyDown(document, { key: "Escape" });

    // Out of the accessibility tree at once, but still mounted so the pop can
    // reverse instead of blinking out.
    expect(screen.queryByRole("search")).toBeNull();
    expect(document.querySelector(".changes-diff-find")).toHaveAttribute("data-state", "closed");
  });

  it("keeps the query across a resize, re-anchored rather than closed", () => {
    render(<Host />);
    fireEvent.click(magnifier());
    const input = screen.getByRole("searchbox", { name: t.changesSearchDiffAriaLabel });
    fireEvent.change(input, { target: { value: "palette" } });

    fireEvent(window, new Event("resize"));

    expect(input).toHaveValue("palette");
    expect(screen.getByRole("search", { name: t.changesSearchDiffAriaLabel })).toBeInTheDocument();
  });

  it("dismisses on an outside press without stealing focus", () => {
    render(<Host />);
    fireEvent.click(magnifier());

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("search")).toBeNull();
    expect(magnifier()).not.toHaveFocus();
  });
});
