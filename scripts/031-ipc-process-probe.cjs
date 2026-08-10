const fs = require("node:fs");
const { chromium } = require("playwright-core");

const [endpoint, projectPath, tracePath] = process.argv.slice(2);
if (!endpoint || !projectPath || !tracePath) {
  throw new Error("usage: node 031-ipc-process-probe.cjs <endpoint> <project-path> <trace-path>");
}

const countGitProcesses = () => {
  if (!fs.existsSync(tracePath)) return 0;
  return fs.readFileSync(tracePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.event === "version").length;
};

(async () => {
  const browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0];
  const invoke = (command, args) => page.evaluate(
    ({ commandName, payload }) => window.__TAURI_INTERNALS__.invoke(commandName, payload),
    { commandName: command, payload: args },
  );
  const deltas = {};
  const measure = async (name, run) => {
    const before = countGitProcesses();
    await run();
    deltas[name] = countGitProcesses() - before;
  };

  let repository;
  await measure("open_repository", async () => {
    repository = await invoke("open_repository", { path: projectPath, sessionEpoch: null });
  });
  const args = { path: repository.path, sessionEpoch: repository.sessionEpoch };
  await measure("read_working_tree_status", () => invoke("read_working_tree_status", args));
  await measure("read_working_tree_diffs", () => invoke("read_working_tree_diffs", args));
  await measure("read_file_diff_tracked", () => invoke("read_file_diff", { ...args, filePath: "tracked-01.txt" }));
  await measure("get_version_lines", () => invoke("get_version_lines", args));
  process.stdout.write(JSON.stringify(deltas, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
