import fs from "node:fs";

const [target, identityPath, outputPath] = process.argv.slice(2);
if (!target || !identityPath || !outputPath) {
  throw new Error("usage: make-os-trust.mjs <target> <identity-json|not-applicable> <output>");
}
const macOS = target.startsWith("darwin-");
const linux = target === "linux-x86_64";
const identity = linux ? null : JSON.parse(fs.readFileSync(identityPath, "utf8"));
const operatingSystem = macOS ? identity?.operatingSystem : identity;
if (!linux && operatingSystem?.result !== "passed") throw new Error("OS identity verification has not passed");
if (macOS && identity?.notarization?.result !== "passed") throw new Error("notarization verification has not passed");
const trust = {
  updater: { result: "not_checked", publicIdentity: null },
  operatingSystem: linux ? { result: "not_applicable" } : { ...operatingSystem, result: "passed" },
  notarization: macOS ? identity.notarization : { result: "not_applicable" },
};
fs.writeFileSync(outputPath, `${JSON.stringify(trust, null, 2)}\n`, { flag: "wx" });
