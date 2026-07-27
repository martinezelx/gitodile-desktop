# ADR 0002: Heuristic-first commit message and branch naming, with local model as a later option

- Status: proposed
- Date: 2026-07-26

## Context

GitOdrile aims to make everyday Git workflows approachable, including naming
commits and branches well. Tools like GitButler solve this with AI: the user
configures an OpenAI/Anthropic/Ollama key, or routes requests through
GitButler's own backend, which forwards them to a third-party LLM on the
user's behalf.

That model has trade-offs that do not fit GitOdrile's current stage:

- It requires either a user-supplied API key, a network dependency, or
  GitOdrile operating (and paying for) a backend proxy.
- `docs/ARCHITECTURE.md` already requires "explicit consent before sending
  source or diffs to an AI service," which adds UX friction for a feature that
  should feel instant and low-stakes.
- "AI provider architecture" is listed in `docs/ARCHITECTURE.md` as a future
  decision, not a settled one, and no such architecture exists yet.

Naming a commit or branch from a diff is a narrow, structured task: it mostly
needs the changed file paths, the change kind (added/modified/deleted/renamed),
and simple content signals (e.g. changes under a `test`/`docs` path). Much of
this can be produced deterministically from the diff GitOdrile already parses
for the working-tree status view, without any model, network call, or consent
prompt.

## Decision

Implement commit message and branch name suggestions in two layers, and only
build the second when the first is demonstrated to be insufficient:

1. **Deterministic heuristic generator (this ADR's scope).**
   A pure Rust function, `git::naming` (or similar), that takes the already
   computed status/diff structure and returns a suggested Conventional-Commits-style
   message and a kebab-case branch name. Rules include:
   - Infer a `type` (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`) from
     path patterns (`docs/`, `*test*`, config files, etc.) and the mix of
     added/deleted/modified files, defaulting to `chore` when no signal is
     strong enough.
   - Infer a `scope` from the shared top-level directory of changed files when
     one exists.
   - Summarize file counts and the dominant change kind for the message body
     (e.g. "update 3 files in src/git", "add status parser").
   - Derive a branch name by slugifying the inferred type/scope/summary.
   - Never inspect file contents beyond what the status/diff parser already
     extracts; never call out to a network service.
   - Always present the result as an editable suggestion, never auto-apply it.
   This keeps the feature fully local, instant, and consent-free, and it
   reuses parsing logic already covered by the tests described in
   `docs/ARCHITECTURE.md`'s testing strategy.

2. **Optional local model (future, separate ADR before implementation).**
   If the heuristic proves too generic in practice (e.g. it cannot produce a
   meaningful summary for large or mixed changesets), evaluate a small,
   embedded, local-only language model as an enhancement:
   - Candidate approach: `llama.cpp` Rust bindings running a quantized
     instruction-tuned model in the ~0.3–2B parameter range (for example a
     GGUF build of Qwen2.5-0.5B/1.5B-Instruct or SmolLM2), invoked from a Rust
     service and never from the frontend directly.
   - Runs fully offline, ships as an optional downloadable asset rather than a
     bundled binary, and requires no API key, consent-to-send-data prompt, or
     ongoing cost, because nothing leaves the machine.
   - Scope stays limited to short-output tasks (commit message, branch name);
     it is not a general chat/AI-assistant feature.
   - This layer must not replace the heuristic; it should only refine or
     rephrase the heuristic's structured summary, keeping the model's job
     small and its failure modes easy to fall back from.
   - Do not start this layer until the heuristic ships and its real-world
     limitations are documented; a follow-up ADR must cover model packaging,
     download/versioning, resource limits, and platform availability
     (including low-spec machines and CI).

## Consequences

### Positive

- Commit/branch naming ships without any AI provider architecture, API key
  management, network dependency, or consent flow.
- The feature is fast, works offline, and has fully deterministic, testable
  behavior.
- It gives a concrete baseline to evaluate whether a local model is actually
  needed, instead of assuming AI is required from the start.
- If pursued later, the local-model path avoids the cost, privacy, and
  external-dependency concerns of a hosted LLM proxy like GitButler's.

### Negative

- Heuristic summaries will be less fluent and less context-aware than an LLM,
  especially for large or semantically mixed changesets.
- Maintaining and tuning heuristic rules over time has its own ongoing cost,
  and may need a matching fixture-driven test suite (per
  `docs/ARCHITECTURE.md`'s testing strategy) to avoid regressions as rules
  grow.
- Introducing a local model later still adds binary/download size, a new
  runtime dependency, and cross-platform packaging work that must be justified
  by real user feedback, not novelty.

### Constraints

- Naming suggestions must always be editable before use; never commit or
  create a branch using a generated name without user confirmation.
- The heuristic layer must not perform any network I/O.
- Any future local-model layer must remain optional, off by default until
  proven reliable, and must not send diffs or source off the user's machine.

## Alternatives considered

### Integrate a hosted LLM provider now (GitButler-style)

Rejected for now. It requires API-key management or a GitOdrile-operated proxy,
triggers the existing AI-consent requirement in `docs/ARCHITECTURE.md`, and
adds cost and a network dependency for a task that a local heuristic can
mostly solve today.

### Go straight to a local embedded model, skipping the heuristic

Rejected as the first step. It adds a runtime dependency, download size, and
packaging work before establishing whether deterministic rules are actually
insufficient. The heuristic is also needed regardless, as an offline fallback
if a local model is unavailable, disabled, or still downloading.

### No automated naming assistance

Rejected. Naming commits and branches well is a real point of friction for the
target beginner-friendly audience, and a deterministic heuristic is cheap
enough to justify building.

## Prior art

Referenced for inspiration, not for direct reuse; verify current behavior
against the upstream project before relying on any detail below.

- **`auto-commit-msg`** (VS Code extension) — the closest match to the
  heuristic layer in this ADR: it analyzes the diff with rule-based logic
  (no AI, no network calls) and suggests a Conventional-Commits-style message
  from the changed files, worth reviewing for its file-classification rules.
- **`cocogitto`** — a Rust CLI implementing Conventional Commits, changelog
  generation, and semver bumping. It does not generate messages from a diff
  (it validates/formats commits the user already wrote), but its Rust
  structure and conventional-commit parsing/validation approach are a useful
  reference for how to shape the `git::naming` module in this codebase.
- **Conventional Commits ecosystem** (`commitizen`/`cz-cli`, `commitlint`) —
  not diff-based generators, but the source of the `type`/`scope` vocabulary
  (`feat`, `fix`, `docs`, `chore`, ...) this ADR's heuristic already follows.

No known prior art was found specifically for heuristic, non-AI branch-name
generation from a diff; that part likely needs original design, derived from
the same inferred type/scope as the commit message.
