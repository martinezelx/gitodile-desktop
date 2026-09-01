const { chromium } = require("playwright-core");

const fs = require("node:fs");
const [endpoint, projectPath, tracePath] = process.argv.slice(2);
if (!endpoint || !projectPath) {
  throw new Error("usage: node 031-cdp-probe.cjs <endpoint> <project-path>");
}

const percentile = (values, percent) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)];
};

let browser;
(async () => {
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0];
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.evaluate((path) => {
    localStorage.setItem("gitodile-projects", JSON.stringify({ version: 1, order: [path], activeId: path }));
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-language", "en");
  }, projectPath);
  await page.reload();
  await page.waitForFunction((path) => document.body.textContent?.includes(path), projectPath, { timeout: 30000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("We couldn’t check for changes"), null, { timeout: 30000 });

  const clickAndPaint = (label) => page.evaluate(async (text) => {
    const target = [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === text);
    if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing navigation button: ${text}`);
    const started = performance.now();
    target.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - started;
  }, label);

  const coldChangesStarted = Date.now();
  await clickAndPaint("Changes");
  await page.waitForSelector(".changes-view", { timeout: 10000 });
  await page.waitForFunction(() => {
    const text = document.querySelector(".changes-diff")?.textContent ?? "";
    return !text.includes("Reading the difference") && !text.includes("Loading");
  }, null, { timeout: 30000 });
  const firstChangesReadyMs = Date.now() - coldChangesStarted;
  await clickAndPaint("Version lines");
  await page.waitForSelector(".version-lines-view", { timeout: 10000 });
  await clickAndPaint("Overview");
  await page.waitForTimeout(2500);

  const countGitProcesses = () => {
    if (!tracePath || !fs.existsSync(tracePath)) return null;
    return fs.readFileSync(tracePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event.event === "version").length;
  };
  const gitProcessesBeforeWarmNavigation = countGitProcesses();

  const transitions = [];
  for (let cycle = 0; cycle < 20; cycle += 1) {
    transitions.push({ from: "overview", to: "changes", ms: await clickAndPaint("Changes") });
    transitions.push({ from: "changes", to: "version-lines", ms: await clickAndPaint("Version lines") });
    transitions.push({ from: "version-lines", to: "overview", ms: await clickAndPaint("Overview") });
  }

  const byTransition = Object.fromEntries(
    ["overview->changes", "changes->version-lines", "version-lines->overview"].map((key) => {
      const values = transitions.filter((entry) => `${entry.from}->${entry.to}` === key).map((entry) => entry.ms);
      return [key, { p50: percentile(values, 50), p95: percentile(values, 95), max: Math.max(...values) }];
    }),
  );
  const all = transitions.map((entry) => entry.ms);
  const gitProcessesAfterWarmNavigation = countGitProcesses();
  const screenMetrics = {};
  for (const label of ["Overview", "Changes", "Version lines"]) {
    await clickAndPaint(label);
    screenMetrics[label] = await page.evaluate(() => ({
      descendants: document.querySelectorAll(".screen-slot:not([hidden]) *").length,
      fileRows: document.querySelectorAll(".screen-slot:not([hidden]) .changes-file-row").length,
      diffLines: document.querySelectorAll(".screen-slot:not([hidden]) .diff-line").length,
      mountedSlots: document.querySelectorAll(".screen-slot").length,
      hiddenSlots: document.querySelectorAll(".screen-slot[hidden]").length,
    }));
  }

  process.stdout.write(JSON.stringify({
    firstChangesReadyMs,
    warmNavigationGitProcesses:
      gitProcessesBeforeWarmNavigation === null || gitProcessesAfterWarmNavigation === null
        ? null
        : gitProcessesAfterWarmNavigation - gitProcessesBeforeWarmNavigation,
    switches: { p50: percentile(all, 50), p95: percentile(all, 95), max: Math.max(...all), byTransition },
    screens: screenMetrics,
    consoleErrors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  void browser?.close();
  process.exitCode = 1;
});
