import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { avatarInitials } from "../../shared/ui";
import { ProfileAvatar, profileInitials } from "./ProfileAvatar";

afterEach(cleanup);

describe("GitOdile profile avatar", () => {
  it("uses the same initials as the person's saved versions", () => {
    expect(profileInitials("Luis Muñoz Martínez")).toBe("LM");
    expect(profileInitials("  ana   lópez ")).toBe("AL");
    expect(profileInitials("Ana María López")).toBe(avatarInitials("Ana María López"));
    expect(profileInitials("")).toBe("?");
  });

  it("shows initials and never a picture", () => {
    const { container } = render(<ProfileAvatar name="Luis Martinez" large />);
    const avatar = container.querySelector(".account-avatar--large");
    expect(avatar).toHaveTextContent("LM");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toBeNull();
  });
});
