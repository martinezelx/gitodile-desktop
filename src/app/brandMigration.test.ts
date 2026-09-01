import { beforeEach, describe, expect, it } from "vitest";

import { migrateLegacyBrandStorage } from "./brandMigration";

describe("migrateLegacyBrandStorage", () => {
  beforeEach(() => localStorage.clear());

  it("copies every legacy-prefixed value and retains the rollback copy", () => {
    localStorage.setItem("gitodrile-language", "es");
    localStorage.setItem("gitodrile-theme", "dark");
    localStorage.setItem("another-app", "untouched");

    migrateLegacyBrandStorage();

    expect(localStorage.getItem("gitodile-language")).toBe("es");
    expect(localStorage.getItem("gitodile-theme")).toBe("dark");
    expect(localStorage.getItem("gitodrile-language")).toBe("es");
    expect(localStorage.getItem("another-app")).toBe("untouched");
  });

  it("does not overwrite a value already written under the new name", () => {
    localStorage.setItem("gitodrile-language", "es");
    localStorage.setItem("gitodile-language", "en");

    migrateLegacyBrandStorage();

    expect(localStorage.getItem("gitodile-language")).toBe("en");
  });

  it("does not block startup when storage is unavailable", () => {
    const unavailable = {
      get length(): number {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    } as Storage;

    expect(() => migrateLegacyBrandStorage(unavailable)).not.toThrow();
  });
});
