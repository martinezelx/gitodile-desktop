// Test-only by directory, which the guard classifies on. Deliberately not
// named `*.test.mjs`: vitest would collect it as a suite and fail on it, and
// `--passWithNoTests` would then be the only thing hiding that.
export const testOnlyValue = "fixture";
