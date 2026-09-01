# Architecture Decision Records

Use this directory for decisions that materially affect GitOdile's architecture, security model, cross-platform behavior, or Git safety guarantees.

## File naming

Use sequential, descriptive names:

```text
0001-use-system-git-first.md
0002-choose-repository-state-model.md
```

## Template

```markdown
# ADR NNNN: Decision title

- Status: proposed | accepted | superseded
- Date: YYYY-MM-DD

## Context

What problem or constraint requires a decision?

## Decision

What are we choosing?

## Consequences

What becomes easier, harder, or constrained?

## Alternatives considered

What else was evaluated and why was it not selected?
```

Do not rewrite accepted ADRs to hide a changed decision. Add a new ADR and mark the old one as superseded.
