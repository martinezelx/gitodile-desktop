// Seeded violation: production code reaching into a test-only module.
import { testOnlyValue } from "./test-fixtures/probe.mjs";

export const forbiddenTestValue = testOnlyValue;
