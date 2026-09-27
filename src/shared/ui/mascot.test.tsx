import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mascot } from "./mascot";

describe("Mascot", () => {
  it("is decorative and marks the themed fill and the glasses as their own groups", () => {
    const { container } = render(<Mascot />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("gitodile-mascot", "gitodile-mascot--body");
    expect(svg?.querySelector(".gitodile-mascot__fill")).not.toBeNull();
    // The strap sits inside the glasses group so it moves with the frame.
    const glasses = svg?.querySelector(".gitodile-mascot__glasses");
    expect(glasses?.querySelector("path[d^='M655 378']")).not.toBeNull();
    expect(glasses?.querySelector(".gitodile-mascot__glints")).not.toBeNull();
    expect(svg?.querySelector(".gitodile-mascot__shine, .gitodile-mascot__star")).toBeNull();
  });

  it("gives each sweep its own clip path, so two mascots on screen never share one", () => {
    const { container } = render(
      <>
        <Mascot motion="sweep" />
        <Mascot motion="sweep" />
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((clip) => clip.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const [index, group] of [...container.querySelectorAll("g[clip-path]")].entries()) {
      expect(group.getAttribute("clip-path")).toBe(`url(#${ids[index]})`);
    }
  });

  it("draws the star only for the greet motion", () => {
    const { container } = render(<Mascot motion="greet" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("gitodile-mascot--greet");
    expect(svg?.querySelector(".gitodile-mascot__star")).not.toBeNull();
    expect(svg?.querySelector(".gitodile-mascot__shine")).toBeNull();
  });
});
