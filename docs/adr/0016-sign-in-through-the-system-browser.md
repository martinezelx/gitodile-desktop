# ADR 0016: Sign in to a GitOdile account through the system browser

- Status: proposed
- Date: 2026-09-29

## Context

The rail already reserves an account destination ("Sign in — Coming soon").
[`BUSINESS_MODEL.md`](../BUSINESS_MODEL.md) fixes what an account is for: it is
never required for the free local core, it is introduced only when the user
chooses Pro or a genuinely connected capability, and losing the account service
must never block local Git work. The account service is expected to be built on
Supabase Auth, with GitOdile's own tables holding profiles and entitlements.

Users must be able to sign in with GitHub, with Google, or with a personal email
address that belongs to neither. That raises three questions this record
answers before any code exists:

1. **Where are credentials entered?** GitHub and Google effectively require
   their sign-in to happen in a real browser: Google refuses embedded webviews,
   and RFC 8252 ("OAuth 2.0 for Native Apps") directs native applications to an
   external user agent. An email user has no such constraint, so the question
   is whether GitOdile should collect an email password itself.
2. **How does the browser hand the session back to the desktop app?** The two
   standard mechanisms, a custom URL scheme and a loopback redirect, behave very
   differently across Windows, macOS and Linux.
3. **Where does the session live afterwards?** A long-lived token must be kept
   somewhere that survives restarts without landing on disk in plain text.

[ADR 0006](0006-defer-macos-and-linux-runtime-validation.md) applies: only
Windows 11 is available for runtime validation, and system credential stores
have never been exercised on macOS or Linux.

This is not a decision about Git remote credentials. Signing in to GitOdile with
GitHub identifies the person to GitOdile; it does not authorize fetch or publish,
and it must not configure Git credential helpers.

## Decision

### 1. The desktop app never collects credentials

GitOdile renders no password, email-code or provider sign-in field. Every
sign-in happens in the user's default browser on a GitOdile-hosted sign-in page
(working name `cuenta.gitodile.app`) backed by Supabase Auth.

The page offers three methods:

- **Continue with GitHub** (OAuth, minimal identity scopes only);
- **Continue with Google** (OAuth);
- **Continue with email**: a one-time six-digit code sent to the address,
  expiring after a short window. There is no GitOdile password at launch.

There is no separate sign-up. A first sign-in with an unknown identity creates
the account. Methods that resolve to the same verified email are one account.

### 2. Authorization code with PKCE and a loopback redirect

Sign-in uses the OAuth 2.0 authorization-code flow with PKCE:

1. The user opens the account popover from the rail and chooses "Sign in". The
   popover says the sign-in continues in the browser; there is no intermediate
   "Open browser" screen.
2. Rust generates the PKCE verifier and challenge and a random `state`, binds a
   one-shot HTTP listener to `127.0.0.1` on an ephemeral port, and opens the
   sign-in page through `tauri-plugin-opener` with the challenge, `state` and
   `http://127.0.0.1:<port>/callback` as the redirect.
3. The app shows a waiting dialog with a short request code derived from
   `state`. The web page shows the same code with the client platform, so the
   user can tell that the browser tab belongs to this request. The code is a
   visual aid only; `state` and PKCE are the security controls. The dialog
   offers "Open again" (for a browser that opened behind the window or in
   another profile) and "Cancel".
4. The callback is accepted once, only when `state` matches, and the listener
   closes on success, cancel, or timeout. Rust exchanges the code and verifier
   for a session with Supabase, brings the main window forward, and the page
   tells the user they can return to GitOdile.

The listener binds to the loopback interface only, never `0.0.0.0` or
`localhost` name resolution, and serves nothing but the single callback.

### 3. The session belongs to Rust and the OS credential store

The refresh token is stored through the operating system's credential store
(Windows Credential Manager, macOS Keychain, Linux Secret Service) and never
crosses into the frontend. The frontend receives account state and entitlements
through a narrow typed port; access tokens stay in Rust memory.

Where no credential store is available (typically a Linux session without a
Secret Service provider), GitOdile keeps the session for the running process
only, says why it will ask again next time, and never falls back to a
plain-text file.

Sign-out revokes the session with the service when reachable and always removes
the local credential.

### 4. Account state stays at the entitlement boundary

Account and entitlement checks stay at the product entitlement boundary
described in `BUSINESS_MODEL.md`. Sign-in failures, expired sessions and an
unreachable service degrade to signed-out behavior; they never block, delay or
mutate local repository work, and every account error states that local work is
unaffected.

### 5. User-facing flow

The approved interaction is: rail account icon → account popover → waiting
dialog → browser sign-in page → brief "Signed in" confirmation in the app, with
the rail icon replaced by the person's avatar. Failure states cover no
connection and a browser closed before finishing. Copy follows
[`DESIGN.md`](../../DESIGN.md) content design, and the web page uses the same
tokens and shapes as the app so the hand-off does not feel like another
product.

## Consequences

- One sign-in flow serves every method, and adding methods later (passwords,
  passkeys, enterprise SSO) changes only the web page.
- Password managers, passkeys, existing provider sessions and provider-side 2FA
  work without GitOdile implementing them; a user already signed in to GitHub
  signs in with one click.
- GitOdile stores no passwords, and its database holds profiles and
  entitlements only; Supabase Auth owns identity data.
- The loopback redirect behaves the same on all three platforms, needs no
  install-time registration and works in development builds. It avoids the
  single-instance forwarding required on Windows by a custom URL scheme and the
  "Open GitOdile?" browser prompt.
- Sign-in costs a context switch to the browser, and focus-stealing prevention
  on Windows may flash the taskbar entry instead of raising the window; the
  in-app confirmation covers that case.
- A Rust-owned account service is new surface: an HTTP client for the account
  service, a loopback listener, and credential-store integration, each needing
  tests and input validation per `AGENTS.md`.
- Per ADR 0006, credential-store behavior and browser hand-off on macOS and
  Linux remain unvalidated until release hardening; Windows is the only
  exercised platform for the first implementation.

## Alternatives considered

- **Email and password inside the app.** Technically safe over TLS with
  Supabase hashing the password, but it splits the product into two flows,
  moves registration, verification, reset and 2FA screens into the desktop app,
  weakens password-manager support inside the webview, and asks users to trust
  a password field whose origin they cannot inspect.
- **Provider sign-in in an embedded webview.** Blocked by Google, discouraged by
  RFC 8252, and it lets the app observe credentials.
- **Custom URL scheme (`gitodile://`) redirect.** Viable and common, but it
  needs per-platform registration (Windows registry and single-instance
  forwarding, macOS bundle metadata that does not exist in development, Linux
  `.desktop` handlers that differ between packaging formats) and triggers a
  browser confirmation. Kept as a fallback if the loopback redirect proves
  unworkable.
- **Device authorization grant (RFC 8628), as in `gh auth login`.** Works
  without a redirect at all, but makes every user copy a code. Reserved for
  environments where the loopback listener cannot run.
- **Email magic links instead of codes.** A link opened on a phone completes
  sign-in on the wrong device; a code typed into the same browser tab does not.
- **Delegating identity entirely to GitHub and Google with no GitOdile user
  store.** Excludes users with only a personal email and still leaves
  entitlements needing a home.

## Open questions for implementation

- Confirm that Supabase Auth accepts a loopback redirect with a variable port
  (redirect allow-list wildcards) and a PKCE exchange from a non-browser client.
- Choose the final account domain and the request-code format.
- Fix session lifetime, device limits, and offline grace for entitlements
  together with the entitlement ADR that `BUSINESS_MODEL.md` anticipates.
- Decide the Rust module that owns sign-in and how it relates to the
  `credentials` boundary in [`ARCHITECTURE.md`](../ARCHITECTURE.md).
