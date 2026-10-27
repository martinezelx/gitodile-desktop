import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";

// Each test file runs in its own process, so the directories one file creates
// are removed when its tests finish and repeated runs do not fill the system
// temp directory.
const created = [];

after(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

export function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}
