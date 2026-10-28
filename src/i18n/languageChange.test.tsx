import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, useLanguage, type LanguagePreference } from "./index";

function Switcher({ to }: { to: LanguagePreference | LanguagePreference[] }): React.JSX.Element {
  const { language, setLanguagePreference } = useLanguage();
  const picks = Array.isArray(to) ? to : [to];
  return (
    <button type="button" onClick={() => picks.forEach(setLanguagePreference)}>
      {language}
    </button>
  );
}

describe("language changes", () => {
  beforeEach(() => localStorage.setItem("gitodile-language", "en"));
  afterEach(cleanup);

  it("commits a change of words inside the animation, once the dictionary is ready", async () => {
    const animate = vi.fn((apply: () => void) => apply());
    const { getByRole, findByRole } = render(
      <LanguageProvider animateLanguageChange={animate}>
        <Switcher to="es" />
      </LanguageProvider>,
    );

    act(() => getByRole("button").click());

    expect(await findByRole("button", { name: "es" })).toBeTruthy();
    expect(animate).toHaveBeenCalledOnce();
  });

  // The Spanish pick waits for its dictionary while the English one, which
  // keeps the words, commits at once; the late answer must not undo it.
  it("keeps the latest pick when an earlier one finishes loading after it", async () => {
    const animate = vi.fn((apply: () => void) => apply());
    const { getByRole } = render(
      <LanguageProvider animateLanguageChange={animate}>
        <Switcher to={["es", "en"]} />
      </LanguageProvider>,
    );

    await act(async () => getByRole("button").click());

    expect(getByRole("button").textContent).toBe("en");
    expect(localStorage.getItem("gitodile-language")).toBe("en");
  });

  // jsdom's navigator reports English, so "system" keeps every word in place.
  it("commits a change that keeps the words without animating it", () => {
    const animate = vi.fn((apply: () => void) => apply());
    const { getByRole } = render(
      <LanguageProvider animateLanguageChange={animate}>
        <Switcher to="system" />
      </LanguageProvider>,
    );

    act(() => getByRole("button").click());

    expect(localStorage.getItem("gitodile-language")).toBe("system");
    expect(animate).not.toHaveBeenCalled();
  });
});
