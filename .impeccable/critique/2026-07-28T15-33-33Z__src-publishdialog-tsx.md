---
target: task 011 Publish changes UI
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-07-28T15-33-33Z
slug: src-publishdialog-tsx
---
# GitOdile task 011 — Publish changes

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading, submitting, success, and failure states exist; network work lacks staged progress. |
| 2 | Match System / Real World | 3 | “Saved versions” is strong, but `origin`, `main`, tracking, and remote branch remain unexplained. |
| 3 | User Control and Freedom | 2 | Preflight cancellation and focus restoration work; execution disables controls without a clear safe-exit model. |
| 4 | Consistency and Standards | 3 | The shared shell is cohesive, but “Everything is saved” conflicts with five unpublished versions. |
| 5 | Error Prevention | 4 | Fresh planning, confirmation, revalidation, no force push, and excluded unsaved files are excellent. |
| 6 | Recognition Rather Than Recall | 2 | Chronology and cumulative checkpoint ancestry must be inferred; the checkpoint action is icon-only. |
| 7 | Flexibility and Efficiency | 2 | Multiple entry points exist, but inspection requires nested disclosures and no publish accelerator is visible. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and coherent, though Overview is accumulating history, files, and nested diffs. |
| 9 | Error Recovery | 3 | Localized errors and technical details are strong; lazy file/diff errors have no inline retry. |
| 10 | Help and Documentation | 2 | Consequence notes help, but cumulative publishing and remote terminology need concise inline education. |
| **Total** | | **27/40** | **Acceptable; strong safety foundation, significant comprehension work remains.** |

## Design Specificity Verdict

**LLM assessment:** Authored interaction model inside a category-interchangeable shell. Saved versions, cumulative checkpoint publishing, excluded unsaved work, and teammate impact feel distinctly GitOdile. Dark rounded cards, disclosure rows, send icons, and a centered modal could belong to many sync tools. The missing product-specific opportunity is a visible local-to-remote model.

**Deterministic scan:** `detect.mjs --json src` scanned 10 JSX/TSX/markup files and returned zero findings. Manual runtime evidence caught two detector-blind concerns: the 26×26px checkpoint target and a nested button inside `<summary>`.

**Visual overlays:** No reliable browser overlay was available because the target is a native Tauri WebView and the Windows-control surface cannot inject scripts. Evidence came from the native app capture, accessibility tree, and source cross-check.

## Overall Impression

The preview is unusually truthful and reassuring for a remote Git mutation. The largest opportunity is to make the local-versus-published state and cumulative checkpoint rule obvious before the confirmation modal.

## What's Working

- The confirmation states the exact number of versions included and remaining.
- Collapsed saved-version rows scan cleanly and reveal files lazily.
- First-publish tracking, teammate visibility, and excluded unsaved files surface backend safety in human language.

## Priority Issues

1. **[P1] The Overview’s dominant status contradicts the actionable state.**
   - **Why it matters:** “Everything is saved” and the lime “Check for changes” action imply completion while five versions are waiting to publish.
   - **Fix:** Describe the compound state and promote Publish changes when the worktree is clean but saved versions are pending.
   - **Suggested command:** `$impeccable clarify`, then `$impeccable layout`.

2. **[P1] “Publish up to here” hides a cumulative-history rule.**
   - **Why it matters:** Users must infer order and that a middle checkpoint includes every older version.
   - **Fix:** Add a persistent newest-first explanation, preview the included range, and use a visible label with a 36–44px target.
   - **Suggested command:** `$impeccable clarify` and `$impeccable harden`.

3. **[P1] The modal presents consequences as prose rather than a scannable plan.**
   - **Why it matters:** Users must synthesize destination, included versions, excluded work, and teammate visibility under pressure.
   - **Fix:** Group the preview under Destination, Will be published, Will stay here, and Who can see it.
   - **Suggested command:** `$impeccable layout` and `$impeccable typeset`.

4. **[P2] Overview is becoming a nested history-and-diff workbench.**
   - **Why it matters:** Nested disclosures and scroll regions undermine the calm overview and duplicate the Changes interaction model.
   - **Fix:** Keep one expansion level in Overview and move full inspection to an inspector or dedicated view.
   - **Suggested command:** `$impeccable distill`.

5. **[P2] Long network work removes control without explaining the stages.**
   - **Why it matters:** Credential helpers, slow networks, or hooks can make “Publishing…” feel indefinite.
   - **Fix:** Show staged status and explain when cancellation is or is not safe.
   - **Suggested command:** `$impeccable harden`.

## Persona Red Flags

- **Jordan, first-time user:** Cannot confidently interpret `origin`, `main`, tracking, list chronology, or what a middle checkpoint includes.
- **Sam, keyboard/low-vision user:** Dialog semantics and focus restoration are strong, but the 26px target, 11px hashes, secondary consequence notes, and nested interactive summary are weak points.
- **Alex, power user:** Multiple entry points help, but repeated nested expansion and prose-heavy confirmation slow scanning.
- **Riley, stress tester:** Long descriptions are ellipsized, large backlogs create nested scrolling, and lazy-load errors lack inline retry.

## Minor Observations

- Show the redacted remote URL/provider in the final confirmation, not only remote selection.
- Hash styling differs between Overview and dialog.
- “Publish changes” becoming “Publish now” weakens vocabulary consistency.
- The first-publish title deserves a one-line explanation of what makes it different.

## Questions to Consider

- What if Overview showed two explicit lanes: “On this computer” and “Visible to teammates”?
- What visual makes “this version and everything below it” obvious without teaching commit ancestry?
- Should “Everything is saved” ever dominate while saved versions remain unpublished?
- Could the modal read like a transfer receipt rather than a legal disclaimer?
