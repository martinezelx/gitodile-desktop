import fs from "node:fs";

const [target, identityPath, outputPath] = process.argv.slice(2);
if (!target || !identityPath || !outputPath) {
  throw new Error("usage: make-os-trust.mjs <target> <identity-json|authenticode-deferred|not-applicable> <output>");
}
const macOS = target.startsWith("darwin-");
const windows = target === "windows-x86_64";
const linux = target === "linux-x86_64";
const authenticodeDeferred = windows && identityPath === "authenticode-deferred";
const identity = linux || authenticodeDeferred ? null : JSON.parse(fs.readFileSync(identityPath, "utf8"));
const operatingSystem = macOS ? identity?.operatingSystem : identity;
if (!linux && !authenticodeDeferred && operatingSystem?.result !== "passed") {
  throw new Error("OS identity verification has not passed");
}
if (windows && !authenticodeDeferred && (
  operatingSystem?.selfSigned !== false || operatingSystem?.codeSigningEku !== "passed" ||
  operatingSystem?.certificateChain !== "passed" || typeof operatingSystem?.subject !== "string" ||
  typeof operatingSystem?.issuer !== "string" || operatingSystem.subject === operatingSystem.issuer ||
  !/^[0-9a-f]{64}$/.test(operatingSystem?.sha256Thumbprint ?? "") ||
  typeof operatingSystem?.timestampSubject !== "string" || operatingSystem.timestampSubject.length === 0
)) throw new Error("Windows Authenticode identity is not publicly trusted");
if (macOS && identity?.notarization?.result !== "passed") throw new Error("notarization verification has not passed");
const trust = {
  updater: { result: "not_checked", publicIdentity: null },
  operatingSystem: linux
    ? { result: "not_applicable" }
    : authenticodeDeferred
      ? { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null }
      : { ...operatingSystem, result: "passed" },
  notarization: macOS ? identity.notarization : { result: "not_applicable" },
};
fs.writeFileSync(outputPath, `${JSON.stringify(trust, null, 2)}\n`, { flag: "wx" });
