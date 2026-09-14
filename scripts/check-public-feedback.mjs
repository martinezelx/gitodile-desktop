import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import feedbackContract from "../src/app/issueReportContract.json" with { type: "json" };
import { GUIDANCE_END, GUIDANCE_START, updateFeedbackReadme } from "./release/public-release.mjs";

export { feedbackContract };

/** Validate the actual YAML, including duplicate keys, rather than grepping IDs. */
export function validateFeedbackForms(files, contract = feedbackContract) {
  const read = (name) => {
    assert.equal(typeof files[name], "string", `Missing public form: ${name}`);
    return load(files[name]);
  };
  for (const [templates, label] of [[contract.bugTemplates, "bug"], [contract.featureTemplates, "enhancement"]]) {
    for (const name of Object.values(templates)) {
      const form = read(name);
      assert.ok(form.name && form.description, `${name}: missing form name or description`);
      assert.ok(form.labels?.includes(label), `${name}: expected label ${label}`);
      assert.ok(Array.isArray(form.body), `${name}: missing form body`);
      const ids = form.body.filter((field) => field.type !== "markdown").map((field) => field.id);
      assert.ok(ids.every((id) => typeof id === "string" && id.length > 0), `${name}: missing field id`);
      assert.equal(new Set(ids).size, ids.length, `${name}: duplicate field id`);
      if (label === "bug") {
        const field = form.body.find((item) => item.id === contract.diagnosticsField);
        assert.equal(field?.type, "textarea", `${name}: missing diagnostics textarea (${contract.diagnosticsField})`);
        assert.equal(field.attributes?.render, "text", `${name}: diagnostics must render as text`);
        assert.equal(field.validations?.required, true, `${name}: diagnostics must be required`);
      }
    }
  }
  const config = read("config.yml");
  assert.equal(config.blank_issues_enabled, false, "Blank issues must be disabled");
  assert.ok(config.contact_links?.some((link) => link.url === `https://github.com/${contract.repository}/security/advisories/new`), "Missing private security contact");
}

export function validateFeedbackSettings(repository, reporting, labels) {
  assert.equal(repository.full_name, feedbackContract.repository, "Unexpected feedback repository");
  assert.equal(repository.visibility, "public", "Feedback repository is not public");
  assert.equal(repository.archived, false, "Feedback repository is archived");
  assert.equal(repository.has_issues, true, "Feedback issues are disabled");
  assert.equal(reporting.enabled, true, "Private vulnerability reporting is disabled");
  for (const name of ["bug", "enhancement"]) {
    assert.ok(labels.some((label) => label.name === name), `Missing issue label: ${name}`);
  }
}

export function validatePublicationReadme(readme) {
  assert.equal((readme.match(new RegExp(GUIDANCE_START, "g")) ?? []).length, 1, "Missing or duplicate download guidance start marker");
  assert.equal((readme.match(new RegExp(GUIDANCE_END, "g")) ?? []).length, 1, "Missing or duplicate download guidance end marker");
  assert.match(readme, /Tauri updater-signed Windows x86-64 NSIS installers, Linux x86-64 AppImages and their application-update files/);
  assert.match(readme, /Windows packages through 1\.0\.0 intentionally lack Authenticode/);
  assert.match(readme, /Los instaladores NSIS de Windows x86-64 firmados para el actualizador de Tauri/);
  assert.match(readme, /Los paquetes de Windows hasta 1\.0\.0 carecen intencionadamente de Authenticode/);
  assert.match(readme, /macOS is not yet qualified and no macOS package is published/);
  assert.match(readme, /macOS todavía no está cualificado y no se publica ningún paquete para macOS/);
  assert.match(readme, /https:\/\/github\.com\/martinezelx\/gitodile-desktop/);
  assert.doesNotMatch(readme, /project-gitodile/);
}

async function check() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--local") || (args.length === 1 && args[0] === "--publication-plan"), "Usage: check-public-feedback.mjs [--local <feedback checkout> | --publication-plan]");
  const names = [...Object.values(feedbackContract.bugTemplates), ...Object.values(feedbackContract.featureTemplates), "config.yml"];
  let files;
  let readme = null;
  if (args[0] === "--local") {
    files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(path.join(args[1], ".github/ISSUE_TEMPLATE", name), "utf8")])));
  } else {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "GitOdile-feedback-contract" };
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const api = async (endpoint) => {
      const response = await fetch(`https://api.github.com/repos/${feedbackContract.repository}${endpoint}`, {
        headers, signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      assert.ok(response.ok, `GitHub ${endpoint}: HTTP ${response.status}`);
      return response.json();
    };
    const [repository, reporting, labels] = await Promise.all([
      api(""), api("/private-vulnerability-reporting"), api("/labels?per_page=100"),
    ]);
    validateFeedbackSettings(repository, reporting, labels);
    // Read a single commit so edits during this check cannot mix form versions.
    const commit = await api(`/commits/${encodeURIComponent(repository.default_branch)}`);
    files = Object.fromEntries(await Promise.all(names.map(async (name) => {
      const file = await api(`/contents/.github/ISSUE_TEMPLATE/${name}?ref=${commit.sha}`);
      assert.equal(file.encoding, "base64", `${name}: unexpected content encoding`);
      return [name, Buffer.from(file.content, "base64").toString("utf8")];
    })));
    if (args[0] === "--publication-plan") {
      const file = await api(`/contents/README.md?ref=${commit.sha}`);
      assert.equal(file.encoding, "base64", "README.md: unexpected content encoding");
      readme = Buffer.from(file.content, "base64").toString("utf8");
    }
    console.log(`Public feedback settings verified at ${commit.sha}.`);
  }
  validateFeedbackForms(files);
  if (readme !== null) validatePublicationReadme(updateFeedbackReadme(readme));
  console.log("Feedback forms match the app contract in English and Spanish.");
  if (readme !== null) console.log("Planned public download guidance is valid and idempotent.");
}

if (import.meta.url.startsWith("file:") && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
