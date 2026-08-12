import { describe, expect, it } from "vitest";

import { findArchitectureViolations } from "../scripts/check-frontend-architecture.mjs";
import type { CruiseModule, CruiseResult } from "../scripts/check-frontend-architecture.mjs";

/**
 * The guard's own rules, exercised against `src/`-shaped paths.
 *
 * The seeded `.mjs` fixtures prove each rule fires, but they cruise a directory
 * of JavaScript. These cases pin the half that operates on TypeScript sources —
 * including the type-only classification, which exists because
 * dependency-cruiser cannot do it on TypeScript 7 and which silently made 88
 * non-existent cycles look real.
 */
function graph(modules: CruiseModule[]): CruiseResult {
  return { modules };
}

const sources = new Map<string, string>();
const readSource = (file: string): string | null => sources.get(file.split("\\").join("/")) ?? null;

describe("frontend architecture guard, on src-shaped input", () => {
  it("reports a feature reaching into another feature's internals", () => {
    sources.set("src/features/status/port.ts", 'import { thing } from "../overview/internal";');
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/status/port.ts",
          dependencies: [{ module: "../overview/internal", resolved: "src/features/overview/internal.ts" }],
        },
      ]),
      readSource,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('Feature "status" imports internal module');
  });

  it("does not report a cycle whose path runs through an erased type import", () => {
    // `projectSessions.ts` type-imports a feature barrel. At runtime the cycle
    // does not exist, and reporting it is what buried the real findings.
    sources.set("src/projectSessions.ts", 'import type { Result } from "./features/publish";');
    sources.set("src/features/publish/index.ts", 'export * from "./domain";');
    sources.set("src/features/publish/domain.ts", 'import { x } from "../../projectSessions";');
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
              cycle: [
                { name: "src/features/publish/domain.ts" },
                { name: "src/projectSessions.ts" },
                { name: "src/features/publish/index.ts" },
              ],
            },
          ],
        },
      ]),
      readSource,
    );
    expect(violations).toEqual([]);
  });

  it("still reports a cycle whose every hop survives compilation", () => {
    sources.set("src/features/a/one.ts", 'import { b } from "./two";');
    sources.set("src/features/a/two.ts", 'import { a } from "./one";');
    const cycle = [{ name: "src/features/a/two.ts" }, { name: "src/features/a/one.ts" }];
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/a/one.ts",
          dependencies: [{ module: "./two", resolved: "src/features/a/two.ts", circular: true, cycle }],
        },
      ]),
      readSource,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Production cycle");
  });

  it("classifies a multi-line type import as erased", () => {
    // House style for long lists. A one-line-only pattern silently treated all
    // 22 of them as runtime edges.
    sources.set(
      "src/features/a/one.ts",
      ['import type {', "  Shape,", "  Size,", '} from "./two";'].join("\n"),
    );
    const cycle = [{ name: "src/features/a/two.ts" }, { name: "src/features/a/one.ts" }];
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/a/one.ts",
          dependencies: [{ module: "./two", resolved: "src/features/a/two.ts", circular: true, cycle }],
        },
      ]),
      readSource,
    );
    expect(violations).toEqual([]);
  });

  it("treats a mixed type-and-value import as a runtime edge", () => {
    sources.set("src/features/a/one.ts", 'import { type Shape, render } from "./two";');
    const cycle = [{ name: "src/features/a/two.ts" }, { name: "src/features/a/one.ts" }];
    const violations = findArchitectureViolations(
      graph([
        {
          source: "src/features/a/one.ts",
          dependencies: [{ module: "./two", resolved: "src/features/a/two.ts", circular: true, cycle }],
        },
      ]),
      readSource,
    );
    expect(violations).toHaveLength(1);
  });

  it("reports a static entry path to the icon set but ignores a type-only one", () => {
    const modules = (importStatement: string) => {
      sources.set("src/bootstrap.tsx", 'import { App } from "./main";');
      sources.set("src/main.tsx", importStatement);
      sources.set("src/features/changes/index.ts", 'export * from "../../fileIcons";');
      return graph([
        { source: "src/bootstrap.tsx", dependencies: [{ module: "./main", resolved: "src/main.tsx" }] },
        {
          source: "src/main.tsx",
          dependencies: [{ module: "./features/changes", resolved: "src/features/changes/index.ts" }],
        },
        {
          source: "src/features/changes/index.ts",
          dependencies: [{ module: "../../fileIcons", resolved: "src/fileIcons.ts" }],
        },
      ]);
    };

    const runtime = findArchitectureViolations(modules('import { C } from "./features/changes";'), readSource);
    expect(runtime.some((entry: string) => entry.includes("static path to fileIcons"))).toBe(true);

    const typeOnly = findArchitectureViolations(
      modules('import type { C } from "./features/changes";'),
      readSource,
    );
    expect(typeOnly.some((entry: string) => entry.includes("static path to fileIcons"))).toBe(false);
  });
});
