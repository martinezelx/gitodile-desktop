import { describe, expect, it } from "vitest";
import { resolveLanguage, translationNamespaces, translations } from "./index";

describe("resolveLanguage", () => {
  it("resolves any Spanish locale, regardless of region, to Spanish", () => {
    expect(resolveLanguage("es")).toBe("es");
    expect(resolveLanguage("es-ES")).toBe("es");
    expect(resolveLanguage("es-MX")).toBe("es");
    expect(resolveLanguage("es_MX")).toBe("es");
  });

  it("resolves any English locale to English", () => {
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("en-US")).toBe("en");
    expect(resolveLanguage("en-GB")).toBe("en");
  });

  it("falls back to English for unsupported locales", () => {
    expect(resolveLanguage("fr-FR")).toBe("en");
    expect(resolveLanguage("de")).toBe("en");
  });

  it("falls back to English when there's no locale at all", () => {
    expect(resolveLanguage(null)).toBe("en");
    expect(resolveLanguage(undefined)).toBe("en");
    expect(resolveLanguage("")).toBe("en");
  });
});

describe("translation composition", () => {
  it("keeps English and Spanish keys in parity inside every owning namespace", () => {
    for (const [name, dictionary] of Object.entries(translationNamespaces)) {
      expect(Object.keys(dictionary.es).sort(), `${name} Spanish keys`).toEqual(Object.keys(dictionary.en).sort());
    }
  });

  it("assigns every key to exactly one namespace before eager composition", () => {
    const owners = new Map<string, string>();

    for (const [name, dictionary] of Object.entries(translationNamespaces)) {
      for (const key of Object.keys(dictionary.en)) {
        expect(owners.get(key), `${key} is duplicated by ${name}`).toBeUndefined();
        owners.set(key, name);
      }
    }

    expect([...owners.keys()].sort()).toEqual(Object.keys(translations.en).sort());
    expect(Object.keys(translations.es).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it("composes representative shell and feature copy synchronously in both languages", () => {
    expect(translations.en.navOverview).toBe("Overview");
    expect(translations.es.navOverview).toBe("Resumen");
    expect(translations.en.workbenchTabChanges).toBe("Changes");
    expect(translations.es.workbenchTabChanges).toBe("Cambios");
    expect(translations.en.versionLinesTitle).toBe("Lines");
    expect(translations.es.versionLinesTitle).toBe("Líneas");
    expect(translations.en.projectSwitcherRailTrigger("  ")).toBe(
      "Unnamed project — switch project",
    );
    expect(translations.es.projectSwitcherRailTrigger("  ")).toBe(
      "Proyecto sin nombre — cambiar de proyecto",
    );
    expect(translations.en.statusChangesMessage(3)).toBe("3 files have changed since your last saved version.");
    expect(translations.es.statusChangesMessage(3)).toBe("3 archivos han cambiado desde tu última versión guardada.");
  });
});
