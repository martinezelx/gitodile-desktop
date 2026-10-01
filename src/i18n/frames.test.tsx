import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider, useLanguage, type Language } from "./index";

function FirstFrameCopy(): React.JSX.Element {
  const { language, t } = useLanguage();
  return (
    <output data-testid="first-frame">
      {language}|{t.navOverview}|{t.workbenchTabChanges}|{t.versionLinesTitle}
    </output>
  );
}

function renderFirstFrame(language: Language): string {
  localStorage.setItem("gitodile-language", language);
  const { container } = render(
    <LanguageProvider>
      <FirstFrameCopy />
    </LanguageProvider>,
  );
  return container.querySelector('[data-testid="first-frame"]')?.textContent ?? "";
}

describe("eager first-frame translations", () => {
  beforeEach(() => localStorage.clear());

  it("renders core and first feature copy in English without a key or fallback frame", () => {
    expect(renderFirstFrame("en")).toBe("en|Overview|Changes|Lines");
  });

  it("renders core and first feature copy in Spanish without a key or fallback frame", () => {
    expect(renderFirstFrame("es")).toBe("es|Resumen|Cambios|Líneas");
  });
});
