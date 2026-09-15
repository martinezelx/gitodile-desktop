import { checkHighlights, HIGHLIGHTS_DIRECTORY } from "./release/highlights.mjs";
import { ReleaseValidationError } from "./release/release-candidate.mjs";

try {
  const entries = checkHighlights();
  const lines = entries.reduce((sum, entry) => sum + entry.highlights.length, 0);
  process.stdout.write(`Release highlights check passed (${entries.length} versions, ${lines} highlights in ${HIGHLIGHTS_DIRECTORY}).\n`);
} catch (error) {
  const code = error instanceof ReleaseValidationError ? error.code : "internal";
  process.stderr.write(`Release highlights check failed [${code}]: ${error.message}\n`);
  process.exitCode = 1;
}
