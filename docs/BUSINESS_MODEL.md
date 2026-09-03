# GitOdile Business Model

## Purpose and status

This document is the durable source for GitOdile's commercial strategy: product
tiers, account boundaries, working pricing, monetization principles, unit
economics, and commercial rollout.

It is a **working business strategy**, not a public pricing commitment. Prices,
processor choices, tax treatment, included paid capabilities, and revenue
assumptions may change before launch. Product positioning remains owned by
[`PRODUCT_STRATEGY.md`](PRODUCT_STRATEGY.md); implementation order remains owned
by [`ROADMAP.md`](ROADMAP.md).

## Business thesis

GitOdile should use a freemium model with an unusually strong free product and a
low-friction paid upgrade:

- **Free** is useful, local-first, and does not require an account.
- **Pro** unlocks advanced individual workflows and optional connected value at
  a deliberately low price.
- **Teams** monetizes organization, administration, shared policy, and support
  rather than merely charging more because somebody uses GitOdile at work.
- **Business / Enterprise** is added only after real customer demand justifies
  the product and support surface.

The commercial model should preserve the product advantage created by the
local-first architecture. Ordinary repository work should not incur a server
cost proportional to Git activity, and a cloud or billing outage must not turn
local version control into an unavailable service.

## Commercial principles

### Free means useful

GitOdile Free must not be a crippled trial. A user should be able to learn and
complete the ordinary local Git lifecycle without registration or payment.

The exact release cut evolves with the product, but the free core is expected
to include ordinary project acquisition and creation, Changes and readable
diffs, saving versions, History, version-line basics, fetch/get/publish,
integration, guided conflict resolution, the basic set-aside workflow, and the
recovery required by those operations.

### No account for the local free core

Opening GitOdile and using local repositories must not require account creation.
An account is introduced when the user chooses a paid or genuinely connected
capability.

The intended progression is:

```text
Install GitOdile
      ↓
GitOdile Free
(no account)
      ↓
Choose Pro
      ↓
Sign in + subscribe
      ↓
Pro entitlements unlocked
```

Future organization membership may add team entitlements to the same account,
but account state must not become the authority for the user's local repository.

### Monetize power and convenience, not fear

GitOdile must never manufacture paid value by weakening safety in Free.

Do not paywall:

- recovery needed because of an operation GitOdile performed;
- ordinary guided conflict resolution needed to finish supported work;
- protection against silent data loss;
- access to the user's own local repository or history;
- the ability to leave GitOdile with an ordinary interoperable Git repository;
- truthful consequences, confirmations, or essential diagnostics whose absence
  would make a Free operation unsafe.

Pro should sell advanced workflows, convenience, connected integrations, and
higher-productivity capabilities. A user must never encounter a state equivalent
to "pay to recover the work this app just put at risk."

### Charge organizations for organizational value

An individual Pro license may be used for professional or commercial work.
GitOdile should not force a higher tier merely because an employer is involved.

Teams and Enterprise earn their higher price through capabilities such as
central administration, seats, organization policy, billing, managed deployment,
provider administration, and support.

### Local-first remains a cost and trust advantage

Repository contents stay local unless the user explicitly invokes a remote or
optional cloud feature. Account, entitlement, and billing services should know
only what they need to provide those services.

Optional AI or agent features must follow the product's existing consent and
transmitted-data rules. Paid status is not consent to upload repository content.

## Product tiers

The capabilities below are commercial hypotheses. A feature belongs in a tier
only after its product scope is approved; this document does not promote backlog
ideas into implementation work.

### GitOdile Free

**Price:** free.

**Account:** not required.

**Purpose:** make GitOdile a complete and trustworthy entry point to ordinary
version control, not a demo for Pro.

Expected value includes the supported local core:

- open, clone, create, and initialize projects;
- understand current changes and readable diffs;
- save all or selected files as a version;
- inspect saved history;
- ordinary version-line creation, switching, integration, publication, and
  deletion as those workflows ship;
- check for, get, and publish project changes;
- guided resolution for supported overlapping changes;
- basic set-aside and restore workflow;
- recovery and Undo required by supported Free operations;
- core settings, diagnostics, languages, themes, and supported desktop
  platforms.

### GitOdile Pro

**Target:** individuals who want more precision, advanced workflows, and optional
connected capabilities without moving to a traditional expert-first Git client.

**Account:** required to activate and maintain the paid entitlement.

**Working EU consumer pricing hypothesis:**

- **EUR 1.59/month** where that is an appropriate localized final price;
- **EUR 14.99/year**, intended as the preferred/default offer;
- regional pricing may use different local currency points rather than a literal
  exchange-rate conversion.

Where consumer law requires tax-inclusive advertising, GitOdile should display
the final tax-inclusive price rather than advertise a lower number and add
processor or card fees at checkout. Payment-processing costs are a business
cost to incorporate into pricing, not a surprise line item whose purpose is to
recover GitOdile's processor fee from the buyer.

Possible Pro value includes:

- hunk- and line-level save/discard workflows;
- richer compare workflows and advanced history navigation;
- file history and blame;
- amend and selected advanced history operations such as cherry-pick, rebase,
  squash, or reorder once each has a safe GitOdile interaction model;
- linked worktrees presented through the product's parallel-work language;
- advanced repository-health guidance;
- provider/account integrations;
- higher-productivity command and workflow features;
- optional AI or coding-agent assistance, with its own privacy and cost model.

These examples are not a promise that every advanced Git command belongs in Pro
or that matching competitors' feature counts is the monetization strategy.

### GitOdile Teams

**Target:** small teams and companies that want GitOdile's individual experience
plus lightweight organization management.

**Working pricing hypothesis:** approximately **EUR 2.99/user/month**, preferably
billed annually. Minimum seat counts and volume breaks remain open questions.

Possible Teams value includes:

- everything in Pro for assigned seats;
- organization and member management;
- seat assignment and removal;
- centralized billing and invoices;
- shared configuration where it solves a validated team problem;
- team safety policies and onboarding defaults;
- organization-level provider connections or configuration;
- priority support appropriate to the price and team size.

The first Teams release should be deliberately small. It should not grow an
enterprise administration platform before real teams are using the product.

### GitOdile Business / Enterprise

**Target:** organizations that need deployment, identity, governance, compliance,
or contractual support beyond Teams.

**Pricing:** not committed. A future public per-seat tier or contact-sales model
should be selected from real demand and support cost rather than invented in
advance.

Potential Enterprise value includes:

- SSO/SAML and lifecycle provisioning such as SCIM;
- centralized license and entitlement management;
- managed MSI/PKG or equivalent deployment workflows;
- organization-enforced GitOdile policies;
- enterprise GitHub, GitLab, Azure DevOps, or self-managed provider support;
- audit and compliance controls that do not collect repository contents by
  default;
- managed update channels or offline entitlement options where required;
- purchase orders, invoicing, SLA, and enterprise support.

Enterprise administration is not a `1.0.0` requirement and should not be built
speculatively.

## Account and entitlement direction

Use one desktop application for all tiers. Do not ship separate Free and Pro
executables.

The future account service should expose explicit entitlements rather than
scatter pricing-plan checks through feature code. A conceptual account may
resolve to values such as:

```text
account: signed-in
entitlements:
  pro: true
  organization: optional
```

The exact schema, authentication provider, cache, device policy, and offline
grace period require implementation-time design and ADRs.

Important invariants:

- signed-out users can always use the supported Free local core;
- losing connectivity to the account/billing service must not block Free local
  Git work;
- temporary entitlement-service failures should degrade predictably rather than
  corrupt or mutate repository state;
- paid capability checks belong at a product entitlement boundary, not inside
  low-level Git safety code;
- cancelling Pro removes future paid access but never ownership of repository
  data or the ability to recover from previously supported local operations.

## Pricing strategy

### Keep the individual upgrade almost frictionless

Pro's intended competitive advantage is not premium positioning. It should feel
cheap enough that a satisfied Free user can upgrade for advanced value without
having to justify the cost of another professional developer subscription.

The working monthly and annual prices are therefore intentionally much lower
than traditional commercial Git clients.

### Prefer annual billing economically

Fixed payment-processing fees make very small monthly transactions relatively
expensive. The annual offer should normally be the commercial default because
it reduces transaction overhead, churn opportunities, and billing noise while
preserving the mental model of a very low monthly cost.

Do not hard-code current processor fee schedules into product copy or business
logic. Recalculate unit economics against the actual payment provider, tax
setup, currencies, refunds, chargebacks, and billing product before commercial
launch.

### Regional pricing is allowed

GitOdile does not need to convert one USD price mechanically into every market.
Use localized price points where they preserve the intended affordability and
sustainable economics.

Pricing presentation must be reviewed for the applicable consumer, tax, and
payment rules in each market before launch.

## Unit economics

The working individual target is approximately **EUR 1 of monthly contribution
per active Pro subscriber** after indirect tax and payment-processing cost,
but before general business overhead and the owner's personal/corporate income
tax.

That is a planning shorthand, not an accounting guarantee. The real value will
vary by country, billing cadence, processor, currency, refunds, and tax status.

At that shorthand:

| Paying Pro users | Approx. monthly contribution | Approx. annual contribution |
| ---: | ---: | ---: |
| 500 | EUR 500 | EUR 6,000 |
| 1,000 | EUR 1,000 | EUR 12,000 |
| 2,000 | EUR 2,000 | EUR 24,000 |
| 3,000 | EUR 3,000 | EUR 36,000 |
| 5,000 | EUR 5,000 | EUR 60,000 |
| 10,000 | EUR 10,000 | EUR 120,000 |

These numbers are useful for scale intuition only. Teams and Enterprise revenue
can materially reduce the number of individual Pro subscribers required to
reach the same business outcome.

## Conversion planning

Do not use an optimistic Free-to-Pro conversion as a release assumption.

A **3-5% active-user conversion band** is a reasonable internal scenario range
to test the shape of the business, not a forecast. For example:

| Active users | 3% Pro | 5% Pro |
| ---: | ---: | ---: |
| 10,000 | 300 | 500 |
| 25,000 | 750 | 1,250 |
| 50,000 | 1,500 | 2,500 |
| 100,000 | 3,000 | 5,000 |

Track active use, paid conversion, retention, annual-vs-monthly mix, support
load, and organization seats separately. Download counts alone are not a useful
business health metric.

## Revenue milestones

These are planning landmarks, not promises or deadlines:

- **EUR 1k MRR:** proof that paid individual/team value exists beyond isolated
  early supporters.
- **EUR 3k MRR:** meaningful side-business revenue and a point to reassess time
  allocation, support load, and growth.
- **EUR 5k MRR:** working sustainable-indie target; evaluate only after several
  months of stable retention and costs rather than from one strong month.
- **EUR 10k MRR:** strong independent software business territory with room for
  reinvestment, contractor help, or a larger personal margin.

MRR must use normalized recurring revenue rather than cash collected in a month
with many annual renewals.

## Commercial rollout

### Phase 1 — Prove the product

Ship and validate the trustworthy local product. Do not delay the core GitOdile
experience to build subscription infrastructure before users want the product.

### Phase 2 — Free + Pro

Add the minimum account, entitlement, billing, cancellation, and customer
support surface needed for one paid individual tier. Preserve accountless Free.

### Phase 3 — Teams

Add organizations and seats after there is evidence that multiple people from
the same companies use GitOdile or explicitly ask for centralized management.
Start with billing, membership, and the smallest validated shared controls.

### Phase 4 — Enterprise

Add enterprise identity, deployment, policy, procurement, and support only when
specific customers justify their ongoing complexity.

## Architecture handoff

This document owns the commercial intent, not the technical implementation.
Before paid access ships, architecture decisions should record at least:

- authentication and account identity;
- entitlement representation and feature-boundary enforcement;
- billing provider and webhook/event handling;
- offline entitlement cache and grace behavior;
- cancellation, refund, failed-payment, and account-deletion behavior;
- organization, seat, and role ownership for Teams;
- repository-data boundaries between the desktop app and any service;
- privacy/security implications of optional AI or provider integrations.

Use ADRs for those durable implementation choices. Do not silently turn the
pricing tier names in this document into architectural coupling.

## Open questions

- Which payment/billing stack best fits GitOdile at launch?
- Is a merchant-of-record model ever worth its higher fee for tax/compliance
  simplification, or should GitOdile remain merchant of record?
- What are the final localized monthly and annual prices by launch market?
- How many devices should one individual entitlement cover?
- What offline grace period gives paid users predictable desktop behavior
  without making entitlements meaningless?
- Does Teams need a minimum seat count?
- Which shared team settings solve a real problem rather than add admin work?
- Which provider integrations belong in Pro versus Teams?
- Should optional AI use bring-your-own-key, included usage, metered credits,
  or a separate add-on?
- At what demand and support threshold should Business / Enterprise become a
  real product rather than a pricing-page placeholder?
