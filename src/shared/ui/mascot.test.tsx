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
    // The arm sits inside the glasses group so it moves with the frame.
    const glasses = svg?.querySelector(".gitodile-mascot__glasses");
    expect(glasses?.querySelector("path[d^='M478 432']")).not.toBeNull();
    expect(glasses?.querySelector(".gitodile-mascot__glints")).not.toBeNull();
    expect(svg?.querySelector(".gitodile-mascot__shine")).toBeNull();
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

  it("marks the outline for the entrance, with every path measuring 1 for the drawing dash", () => {
    const { container } = render(<Mascot motion="commits" entrance />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("gitodile-mascot--commits", "gitodile-mascot--enter");
    const paths = [...(svg?.querySelectorAll(".gitodile-mascot__outline path") ?? [])];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path).toHaveAttribute("pathLength", "1");
    expect(svg?.firstElementChild).toHaveClass("gitodile-mascot__outline");
    expect(render(<Mascot motion="commits" />).container.querySelector("svg")).not.toHaveClass("gitodile-mascot--enter");
  });

  it("marks the crest's six commits for the commits motion, without the lens sweep", () => {
    const { container } = render(<Mascot motion="commits" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("gitodile-mascot--commits");
    expect(svg?.querySelectorAll(".gitodile-mascot__commits circle")).toHaveLength(6);
    expect(svg?.querySelector(".gitodile-mascot__shine")).toBeNull();
  });
});
