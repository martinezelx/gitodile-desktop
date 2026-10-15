import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mascot } from "./mascot";

describe("Mascot", () => {
  it("is decorative and marks the themed body and both eyes, the front one for the wink", () => {
    const { container } = render(<Mascot />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("gitodile-mascot", "gitodile-mascot--body");
    expect(svg?.querySelector(".gitodile-mascot__fill")).not.toBeNull();
    const eyes = svg?.querySelector(".gitodile-mascot__eyes");
    expect(eyes?.children).toHaveLength(2);
    expect(eyes?.lastElementChild).toHaveClass("gitodile-mascot__wink");
  });

  it("winks or blinks only when asked", () => {
    expect(render(<Mascot motion="wink" />).container.querySelector("svg")).toHaveClass("gitodile-mascot--wink");
    expect(render(<Mascot motion="blink" />).container.querySelector("svg")).toHaveClass("gitodile-mascot--blink");
    const still = render(<Mascot />).container.querySelector("svg");
    expect(still).not.toHaveClass("gitodile-mascot--wink");
    expect(still).not.toHaveClass("gitodile-mascot--blink");
  });

  it("marks the outline for the entrance, drawn last, with every path measuring 1 for the drawing dash", () => {
    const { container } = render(<Mascot entrance />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("gitodile-mascot--enter");
    const paths = [...(svg?.querySelectorAll(".gitodile-mascot__outline path") ?? [])];
    // The silhouette, the belly, four toes and two eyes.
    expect(paths).toHaveLength(8);
    for (const path of paths) expect(path).toHaveAttribute("pathLength", "1");
    expect(svg?.lastElementChild).toHaveClass("gitodile-mascot__outline");
    expect(render(<Mascot />).container.querySelector("svg")).not.toHaveClass("gitodile-mascot--enter");
  });

  it("crops the same body to the head, with its eyes and no entrance outline", () => {
    const body = render(<Mascot />).container.querySelector(".gitodile-mascot__fill");
    const svg = render(<Mascot variant="head" />).container.querySelector("svg");
    expect(svg).toHaveClass("gitodile-mascot--head");
    expect(svg?.getAttribute("viewBox")).not.toBe(render(<Mascot />).container.querySelector("svg")?.getAttribute("viewBox"));
    expect(svg?.querySelector(".gitodile-mascot__fill")?.getAttribute("d")).toBe(body?.getAttribute("d"));
    expect(svg?.querySelector(".gitodile-mascot__fill")).not.toBeNull();
    expect(svg?.querySelectorAll(".gitodile-mascot__eyes path")).toHaveLength(2);
    expect(svg?.querySelector(".gitodile-mascot__outline")).toBeNull();
  });
  it("hops and fills only when asked", () => {
    expect(render(<Mascot motion="hop" />).container.querySelector("svg")).toHaveClass("gitodile-mascot--hop");
    const whole = render(<Mascot />).container.querySelector("svg");
    expect(whole?.querySelector(".gitodile-mascot__level")).toBeNull();
    expect(whole).not.toHaveAttribute("data-progress");
  });

  it("fills the body from the feet up with the progress, clamped to the box", () => {
    const svg = render(<Mascot progress={0.25} />).container.querySelector("svg");
    expect(svg).toHaveAttribute("data-progress", "25");
    expect(svg?.querySelector(".gitodile-mascot__pending .gitodile-mascot__fill")).not.toBeNull();
    expect(svg?.querySelector<SVGRectElement>(".gitodile-mascot__level")?.style.transform).toBe("translateY(742.5px)");
    expect(render(<Mascot progress={4} />).container.querySelector("svg")).toHaveAttribute("data-progress", "100");
    expect(render(<Mascot progress={Number.NaN} />).container.querySelector("svg")).toHaveAttribute("data-progress", "0");
  });
});
