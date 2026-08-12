import { describe, expect, it } from "vitest";

import { findArchitectureViolations } from "../scripts/check-frontend-architecture.mjs";
import type { CruiseModule, CruiseResult } from "../scripts/check-frontend-architecture.mjs";

/**
 * The guard's own rules, exercised against `src/`-shaped paths.
 *
 * The seeded `.mjs` fixtures prove each rule fires, but they cruise a directory
 * of JavaScript. These cases pin the half that operates on TypeScript sources,
 * where erased `import type` edges decide whether a cycle or a bundle path is
 * real. Getting that wrong once reported 88 cycles that do not exist.
 */
function graph(modules: CruiseModule[]): CruiseResult {
  return { modules };
}

const TYPE_ONLY = ["local", "type-only", "import"];
const RUNTIME = ["local", "import"];

describe("frontend architecture guard, on src-shaped input", () => {
  it("reports a feature reaching into another feature's internals", () => {
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/status/port.ts",
          dependencies: [
            {
              module: "../overview/internal",
              resolved: "src/features/overview/internal.ts",
              dependencyTypes: RUNTIME,
            },
          ],
        },
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('Feature "status" imports internal module');
  });

  it("does not report a cycle whose path runs through an erased type import", () => {
    // `projectSessions.ts` type-imports a feature barrel. At runtime the cycle
    // does not exist, and reporting it is what buried the real findings.
    // `cycle` starts at the edge's target and ends back at its source, so each
    // edge carries its own rotation of the same loop.
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/projectSessions.ts",
          dependencies: [
            {
              module: "./features/publish",
              resolved: "src/features/publish/index.ts",
              circular: true,
              dependencyTypes: TYPE_ONLY,
              cycle: [
                { name: "src/features/publish/index.ts" },
                { name: "src/features/publish/domain.ts" },
                { name: "src/projectSessions.ts" },
              ],
            },
          ],
        },
        {
          source: "src/features/publish/index.ts",
          dependencies: [
            {
              module: "./domain",
              resolved: "src/features/publish/domain.ts",
              circular: true,
              dependencyTypes: RUNTIME,
              cycle: [
                { name: "src/features/publish/domain.ts" },
                { name: "src/projectSessions.ts" },
                { name: "src/features/publish/index.ts" },
              ],
            },
          ],
        },
      ]),
    );
    expect(violations).toEqual([]);
  });

  it("still reports a cycle whose every hop survives compilation", () => {
    const cycle = [{ name: "src/features/a/two.ts" }, { name: "src/features/a/one.ts" }];
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/a/one.ts",
          dependencies: [
            { module: "./two", resolved: "src/features/a/two.ts", circular: true, cycle, dependencyTypes: RUNTIME },
          ],
        },
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Production cycle");
  });

  it("keeps an edge imported both as a type and as a value at runtime", () => {
    // `modalFocus.ts` imports `useEffect` from react beside `type React`.
    // dependency-cruiser emits one record per statement, so reading either in
    // isolation would erase an edge the bundler still follows.
    const cycle = [{ name: "src/features/a/two.ts" }, { name: "src/features/a/one.ts" }];
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/a/one.ts",
          dependencies: [
            { module: "./two", resolved: "src/features/a/two.ts", circular: true, cycle, dependencyTypes: TYPE_ONLY },
            { module: "./two", resolved: "src/features/a/two.ts", circular: true, cycle, dependencyTypes: RUNTIME },
          ],
        },
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Production cycle");
  });

  it("reports a static entry path to the icon set but ignores a type-only one", () => {
    const modules = (dependencyTypes: string[]) =>
      graph([
        {
          source: "src/bootstrap.tsx",
          dependencies: [{ module: "./main", resolved: "src/main.tsx", dependencyTypes: RUNTIME }],
        },
        {
          source: "src/main.tsx",
          dependencies: [
            { module: "./features/changes", resolved: "src/features/changes/index.ts", dependencyTypes },
          ],
        },
        {
          source: "src/features/changes/index.ts",
          dependencies: [{ module: "../../fileIcons", resolved: "src/fileIcons.ts", dependencyTypes: RUNTIME }],
        },
      ]);

    const runtime = findArchitectureViolations(modules(RUNTIME));
    expect(runtime.some((entry: string) => entry.includes("static path to fileIcons"))).toBe(true);

    const typeOnly = findArchitectureViolations(modules(TYPE_ONLY));
    expect(typeOnly.some((entry: string) => entry.includes("static path to fileIcons"))).toBe(false);
  });
});
