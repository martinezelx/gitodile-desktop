import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { RemoteHome } from "./port";
import { RemoteHomeCrumb } from "./RemoteHomeCrumb";
import type { RemoteHomeState } from "./workDetail";

function draw(home: RemoteHomeState, onOpen = vi.fn()) {
  render(
    <LanguageProvider>
      <RemoteHomeCrumb home={home} onOpen={onOpen} />
    </LanguageProvider>,
  );
  return onOpen;
}

const github: RemoteHome = { remote: "origin", provider: "github", label: "acme/app", hasWebPage: true };

afterEach(() => cleanup());

describe("RemoteHomeCrumb", () => {
  it("names the service's path and opens its page by the remote's name", async () => {
    const onOpen = draw({ status: "ready", home: github });

    const link = screen.getByRole("button", { name: "Open acme/app on GitHub" });
    expect(link).toHaveTextContent("acme/app");
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith("origin");
  });

  it("names a remote with no page it can open without offering to open it", () => {
    draw({ status: "ready", home: { remote: "work", provider: "other", label: "team/app", hasWebPage: false } });

    expect(screen.getByText("team/app")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a project with no remote is only on this computer", () => {
    draw({ status: "ready", home: null });

    expect(screen.getByText("Only on this computer")).toBeInTheDocument();
  });

  it("holds its place until it is read, never claiming there is no remote", () => {
    draw({ status: "unknown" });

    expect(screen.getByRole("status", { name: "Reading where this project lives…" })).toBeInTheDocument();
    expect(screen.queryByText("Only on this computer")).toBeNull();
  });
});
