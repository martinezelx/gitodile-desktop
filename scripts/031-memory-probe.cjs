const { chromium } = require("playwright-core");
const { execSync } = require("node:child_process");

const [endpoint, projectPath, mode, treeScript] = process.argv.slice(2);

/** Only this app's own process tree. A machine-wide `msedgewebview2` query
 * also captures every other WebView2 host that happens to be running. */
const sampleTree = () => {
  const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${treeScript}"`, { encoding: "utf8" }).trim();
  if (!raw) return { workingSetMiB: 0, privateMiB: 0, processes: [] };
  const rows = JSON.parse(raw.startsWith("[") ? raw : `[${raw}]`);
  return {
    workingSetMiB: rows.reduce((total, row) => total + row.ws, 0) / 1048576,
    privateMiB: rows.reduce((total, row) => total + row.pv, 0) / 1048576,
    processes: rows.map((row) => ({ pid: row.pid, name: row.name, wsMiB: +(row.ws / 1048576).toFixed(1) })),
  };
};

(async () => {
  const browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0];
  await page.evaluate((path) => {
    localStorage.setItem("gitodile-projects", JSON.stringify({ version: 1, order: [path], activeId: path }));
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-language", "en");
  }, projectPath);
  await page.reload();
  await page.waitForFunction((path) => document.body.textContent?.includes(path), projectPath, { timeout: 30000 });

  const click = (label) => page.evaluate((text) => {
    const target = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
    if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing: ${text}`);
    target.click();
  }, label);

  if (mode === "all-screens") {
    await click("Changes");
    await page.waitForTimeout(4000);
    await click("Version lines");
    await page.waitForTimeout(3000);
    await click("Overview");
  }

  await page.waitForTimeout(10000);
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    samples.push(sampleTree());
    await page.waitForTimeout(1000);
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  process.stdout.write(JSON.stringify({
    mode,
    processCount: samples[samples.length - 1].processes.length,
    medianWorkingSetMiB: +median(samples.map((s) => s.workingSetMiB)).toFixed(1),
    medianPrivateMiB: +median(samples.map((s) => s.privateMiB)).toFixed(1),
    samplesWorkingSetMiB: samples.map((s) => +s.workingSetMiB.toFixed(1)),
    processes: samples[samples.length - 1].processes,
  }, null, 2));
  // Deliberately no browser.close(): closing the CDP session terminates the app.
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
