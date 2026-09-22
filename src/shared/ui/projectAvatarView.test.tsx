import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectAvatar } from "./projectAvatarView";

describe("ProjectAvatar", () => {
  it("renders initials on the palette colour when there is no identity", () => {
    const { container } = render(
      <ProjectAvatar id="/repos/gitodile" name="gitodile" className="av" />,
    );
    const chip = container.querySelector(".av");
    expect(chip?.textContent).toBe("GI");
    expect(chip?.getAttribute("style")).toContain("--avatar-color-");
  });

  it("renders the chosen emoji instead of the technology", () => {
    const { container } = render(
      <ProjectAvatar id="/repos/app" name="app" className="av" iconChoice="🐊" technology="rust" />,
    );
    expect(container.querySelector(".project-avatar__glyph")?.textContent).toBe("🐊");
    expect(container.querySelector(".project-avatar__tray")).toBeNull();
  });

  it("renders a detected technology mark on its tray", () => {
    const { container } = render(
      <ProjectAvatar id="/repos/app" name="app" className="av" technology="rust" />,
    );
    expect(container.querySelector(".project-avatar__tray")).not.toBeNull();
    expect(container.querySelector(".project-avatar__mark")).not.toBeNull();
  });
});
