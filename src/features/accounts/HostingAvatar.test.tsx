import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { AccountPicker } from "./AccountPicker";
import { AccountRow } from "./AccountRow";
import { isPictureDataUrl, type AccountCatalog } from "./domain";
import { HostingAvatar } from "./HostingAvatar";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
afterEach(cleanup);

describe("hosting account pictures", () => {
  it("accepts only the bounded raster data URLs the native side produces", () => {
    for (const value of [PNG, "data:image/jpeg;base64,/9j/", "data:image/gif;base64,R0lGODlh", "data:image/webp;base64,UklGRg=="]) {
      expect(isPictureDataUrl(value)).toBe(true);
    }
    for (const value of [null, undefined, "", "https://avatars.githubusercontent.com/u/1",
      "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,<script>", `data:image/png;base64,${"A".repeat(350_000)}`]) {
      expect(isPictureDataUrl(value)).toBe(false);
    }
  });

  it("shows the picture with the provider badge, and the person glyph when it fails", () => {
    const { container } = render(<HostingAvatar picture={PNG} provider="gitlab" />);
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", PNG);
    expect(container.querySelector(".hosting-avatar__badge svg")).not.toBeNull();
    expect(container.querySelector(".hosting-avatar")).toHaveAttribute("aria-hidden", "true");
    fireEvent.error(image!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".hosting-avatar__face svg")).not.toBeNull();
  });

  it("never renders a remote or unsafe source, and can drop the badge", () => {
    const { container } = render(<HostingAvatar picture="https://evil.example/a.svg" provider="github" badge={false} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".hosting-avatar__badge")).toBeNull();
  });

  it("gives every account row its provider's picture", () => {
    const { container } = render(<LanguageProvider>
      <AccountRow login="studio" provider="bitbucket" picture={PNG} method="token"
        state={{ label: "Connected", tone: "success" }} actions={null} />
    </LanguageProvider>);
    expect(screen.getByRole("group", { name: "@studio" })).toBeInTheDocument();
    expect(container.querySelector(".hosting-avatar img")).toHaveAttribute("src", PNG);
  });

  it("shows an account's picture in the picker and the provider mark otherwise", async () => {
    const catalog: AccountCatalog = {
      providers: [{ id: "github", host: "github.com", kind: "github", builtIn: true }], busy: false,
      accounts: [
        { id: "github:personal", provider: "github", host: "github.com", login: "personal", avatarDataUrl: PNG, available: true },
        { id: "github:work", provider: "github", host: "github.com", login: "work", avatarDataUrl: null, available: true },
      ],
    };
    render(<LanguageProvider><AccountPicker catalog={catalog} provider="github" value="github:personal"
      onChange={vi.fn()} onCheck={vi.fn()} /></LanguageProvider>);
    const trigger = screen.getByRole("combobox");
    expect(trigger.querySelector(".hosting-account-picker__glyph img")).toHaveAttribute("src", PNG);
    await userEvent.click(trigger);
    const personal = screen.getByRole("option", { name: /@personal/ });
    const work = screen.getByRole("option", { name: /@work/ });
    expect(personal.querySelector("img")).toHaveAttribute("src", PNG);
    expect(personal.querySelector(".hosting-avatar__badge")).toBeNull();
    expect(work.querySelector("img")).toBeNull();
    expect(work.querySelector(".hosting-account-picker__glyph svg")).not.toBeNull();
  });
});
