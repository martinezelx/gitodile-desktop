import fs from "node:fs";
import path from "node:path";
import { createEvidence, verifyEvidenceArtifacts } from "./release-evidence.mjs";
import { REQUIRED_TARGETS } from "./release-candidate.mjs";

const [candidatePath, osRoot, outputRoot, publicIdentity] = process.argv.slice(2);
if (!candidatePath || !osRoot || !outputRoot || !publicIdentity) {
  throw new Error("usage: finalize-signed-evidence.mjs <candidate> <os-root> <output-root> <public-key-id>");
}

const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
for (const target of REQUIRED_TARGETS) {
  const directDirectory = path.resolve(osRoot, target);
  const artifactDirectory = path.resolve(osRoot, `os-signed-${target}`);
  const sourceDirectory = fs.existsSync(directDirectory) ? directDirectory : artifactDirectory;
  const osEvidence = JSON.parse(fs.readFileSync(path.join(sourceDirectory, "evidence.json"), "utf8"));
  verifyEvidenceArtifacts(osEvidence, sourceDirectory);
  const destination = path.resolve(outputRoot, target);
  fs.mkdirSync(destination, { recursive: true });
  const artifacts = [];
  for (const item of osEvidence.artifacts) {
    const source = path.join(sourceDirectory, item.fileName);
    const copied = path.join(destination, item.fileName);
    fs.copyFileSync(source, copied, fs.constants.COPYFILE_EXCL);
    artifacts.push({ role: item.role, file: copied });
    if (item.role === "updater" || item.role === "first-install-and-updater") {
      const signatureSource = `${source}.sig`;
      const signatureDestination = `${copied}.sig`;
      fs.copyFileSync(signatureSource, signatureDestination, fs.constants.COPYFILE_EXCL);
      artifacts.push({ role: "updater-signature", file: signatureDestination });
    }
  }
  const evidence = createEvidence({
    candidate,
    target,
    phase: "signed",
    artifacts,
    trust: {
      updater: { result: "passed", publicIdentity },
      operatingSystem: osEvidence.trust.operatingSystem,
      notarization: osEvidence.trust.notarization,
    },
  });
  fs.writeFileSync(path.join(destination, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
}
