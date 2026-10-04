---
id: 140
title: Build the account sign-in screens against a functional mock
status: active
priority: normal
type: design
areas:
  - frontend
  - account
created: 2026-09-29
completed:
parent:
queue: "27"
---

# Goal

Build every in-app surface of the sign-in flow described in `DESIGN.md`
§ Account and sign-in, wired to a typed account port whose only adapter for now
is a functional mock. The flow can be exercised end to end in development
builds, with every outcome, before any Rust, Supabase or web page exists.

# User outcome

None yet for released builds: the rail's account control keeps saying sign-in
is coming soon. In development builds the team can open the account popover,
start a sign-in, watch the waiting dialog, and reach success, cancellation and
each failure, so the design can be judged in the running app and the real
adapter later drops in behind an unchanged port.

# Context

On 2026-09-29 the user reviewed login mockups and approved the flow recorded in
[ADR 0016](../../docs/adr/0016-sign-in-through-the-system-browser.md) (status
proposed) and in `DESIGN.md` § Account and sign-in: account popover → waiting
dialog → browser sign-in page → confirmation, with the app never rendering a
credential field. The account is optional and never gates local work
([`BUSINESS_MODEL.md`](../../docs/BUSINESS_MODEL.md)).

Today the rail foot renders a disabled `UserRound` button with
`navAccountTitle` ("Sign in — Coming soon") in `src/app/App.tsx`, plus a
disabled row in the compact app menu.

# Scope

- A new `src/features/account/` feature following
  `docs/architecture/frontend-feature-guide.md`:
  - `domain.ts`: the account state machine — `signed-out`, `waiting`
    (request code, started at), `signed-in` (name, email, avatar initials,
    `pro` entitlement), and failures `offline`, `browser-closed`, `expired`,
    `cancelled`. Pure transitions with unit tests.
  - `port.ts`: a typed `AccountPort` shaped for ADR 0016 — start sign-in
    (returns the request code), reopen the browser, cancel, sign out, read the
    current state, subscribe to changes. No token or credential crosses it.
  - `mockAdapter.ts`: a functional mock with realistic timing that resolves a
    started sign-in to a chosen outcome and generates a request code in the
    agreed `XXXX · 0000` shape.
  - `translations.ts`: English and Spanish copy following the wording rules in
    `DESIGN.md` (account, sign in, sign out; "continues in your browser").
- Screens, all eager overlays per `AGENTS.md`:
  - Signed-out account popover anchored to the rail control (and reachable
    from the compact app-menu row), with focus management and Escape.
  - Waiting dialog on the shared `Dialog` shell, size `s`: request code, three
    steps with the current one marked, "Cancel" and "Open again"; the spinner
    respects reduced motion.
  - Signed-in state: the rail control shows the person's avatar; its popover
    shows name, email, a `PRO` capsule when entitled, and rows for plan and
    billing, what the account stores (both inert placeholders here), and sign
    out.
  - Confirmation and failure notices: "Signed in" on success; offline, browser
    closed before finishing, and expired session, each saying local work is
    unaffected.
- A development-only control to pick the mock's next outcome (success with or
  without Pro, offline, browser closed, cancel), reachable only when
  `import.meta.env.DEV` is true and absent from production bundles.
- Release builds keep today's disabled "Coming soon" control; the new flow is
  enabled only in development builds.
- Tests: domain transitions, popover and dialog rendering per state, keyboard
  paths (open, Escape, Cancel, Open again, sign out), and that production
  builds still render the disabled control.

# Out of scope

- The real adapter: Rust account module, loopback listener, PKCE, Supabase
  calls, OS credential storage (ADR 0016 follow-up task).
- The web sign-in page at the account domain.
- Entitlement checks in any feature, Pro upsell dialogs, billing.
- Changing Git remote credentials or anything under `credentials` in Rust.

# Acceptance criteria

- [ ] `src/features/account/` exists with domain, port, mock adapter and
      translations; visual components reach it only through the port.
- [ ] In a development build every state in `DESIGN.md` § Account and sign-in
      is reachable from the rail and the compact app menu, in light and dark.
- [ ] The waiting dialog uses the shared `Dialog` shell at size `s`; nothing in
      it is accent-filled; "Open again" and "Cancel" work with keyboard only.
- [ ] Every failure notice states that projects and saved versions are
      unaffected, and none uses a danger fill.
- [ ] No component renders an input for an email, password or code.
- [ ] Release builds render the disabled "Coming soon" control exactly as
      before, and the dev outcome picker is absent from the production bundle.
- [ ] Unit tests cover the domain transitions and the popover/dialog states.
- [ ] Validated in the running app (Tauri dev) with the flow exercised end to
      end, results recorded below.
- [ ] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md` § Account and sign-in, § Dialogs, rail bullets under Layout concept
- `docs/adr/0016-sign-in-through-the-system-browser.md`
- `docs/BUSINESS_MODEL.md`
- `docs/architecture/frontend-feature-guide.md`
- `src/app/App.tsx` (rail account control and compact menu row)
- `src/app/translations.ts` (`navAccount`, `navAccountTitle`)
- `src/shared/ui/` (`Dialog`, popover and notice primitives)
- `src/features/notifications/` (confirmation notice)

# Dependencies

None. The real adapter depends on this task's port, not the other way round.

# Decisions

- The mock is dev-only rather than behind a user setting, so released builds
  never show a sign-in that cannot complete (`DESIGN.md` § Honest affordances).
- The port is shaped for ADR 0016 now so the real adapter replaces the mock
  without touching components.

# Implementation notes

Complete this section during implementation.

# Validation

Record the exact commands run and their results. Do not claim checks passed
unless they were executed successfully.
