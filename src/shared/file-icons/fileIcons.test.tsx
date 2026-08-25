import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getFileTypeIcon } from "./index";

describe("file type icons", () => {
  it("isolates repeated SVG resources inside image documents", () => {
    const RustIcon = getFileTypeIcon("src-tauri/src/application.rs");
    const { container } = render(
      <>
        <div hidden>
          <RustIcon className="hidden-rust" />
        </div>
        <RustIcon className="visible-rust" />
      </>,
    );

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(images[0]).toHaveAttribute("src", images[1].getAttribute("src"));
    expect(images[0].getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    const decodedSource = decodeURIComponent(images[0].getAttribute("src") ?? "");
    expect(decodedSource).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(decodedSource).toContain("<radialGradient");
  });

  it("returns stable components and keeps icons decorative", () => {
    const first = getFileTypeIcon("src/main.rs");
    const second = getFileTypeIcon("src/lib.RS");
    expect(first).toBe(second);

    const RustIcon = first;
    const { container } = render(<RustIcon data-testid="rust-icon" />);
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("draggable", "false");
  });
});
