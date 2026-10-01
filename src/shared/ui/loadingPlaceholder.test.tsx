import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingPlaceholder, TextPlaceholder } from "./loadingPlaceholder";

afterEach(cleanup);

describe("LoadingPlaceholder", () => {
  it("announces what is being read once, and nothing of the shape", () => {
    render(
      <LoadingPlaceholder label="Reading saved versions" className="history-list">
        <TextPlaceholder width="60%" />
        <TextPlaceholder className="text-placeholder--glyph" />
      </LoadingPlaceholder>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveClass("loading-placeholder", "history-list");
    expect(status).toHaveTextContent(/^Reading saved versions$/);
    expect(screen.getByText("Reading saved versions")).toHaveClass("visually-hidden");
  });

  it("stays silent as the second half of a shape another placeholder announces", () => {
    const { container } = render(
      <LoadingPlaceholder>
        <TextPlaceholder />
      </LoadingPlaceholder>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });
});

describe("TextPlaceholder", () => {
  it("takes the caller's width and classes", () => {
    const { container } = render(<TextPlaceholder width="42%" className="text-placeholder--chip" />);
    const placeholder = container.firstElementChild;
    expect(placeholder).toHaveClass("text-placeholder", "text-placeholder--chip");
    expect(placeholder).toHaveStyle({ width: "42%" });
    expect(placeholder).toBeEmptyDOMElement();
  });
});
