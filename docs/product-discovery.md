# Product Discovery

## Purpose

Turn a raw idea into an explicit product decision before architecture or implementation begins. The output is an evidence-aware Product Brief under `ideas/`, updated product requirements, and one or more testable tasks.

## Input Modes

### Minimal

The user provides only a sentence. Product Agent records the original wording, creates a brief, and continues with labeled assumptions rather than blocking on every unknown.

### Guided

The user also provides target users, problem context, desired outcome, constraints, known evidence, and decision authority. Product Agent preserves these as facts attributed to the user.

### Research-Assisted

Product Agent may gather external evidence when the user requests research and tools are available. Every external claim requires a source and date; unavailable evidence remains an assumption or unknown.

## Discovery Loop

1. Capture the raw idea without changing its meaning.
2. Separate facts, assumptions, and unknowns in the evidence ledger.
3. Define the target user, context, problem, current alternative, and cost of the problem.
4. Describe desired user/business outcomes and a falsifiable value proposition.
5. Define the core journey, including failure and return paths.
6. Select the smallest coherent MVP and explicit non-goals.
7. Define primary, leading, and guardrail metrics.
8. Identify product, privacy, feasibility, cost, accessibility, and operational risks.
9. Resolve only decisions required to choose an MVP; assign owners to the rest.
10. Present a recommendation and move the brief to `Ready for Review`.

## Question Policy

- Ask only questions whose answers materially change the user, problem, MVP, risk, or delivery scope.
- Group questions by decision and explain the consequence of each option.
- When answers are unavailable, use a reversible assumption, label its confidence, and add a validation action.
- Do not invent customer interviews, analytics, market size, competitor behavior, legal conclusions, or technical feasibility evidence.

## Decision Policy

- `decision_owner: User` requires explicit user approval before `Approved`.
- Product Agent may approve only when the user explicitly delegates the product decision for this idea and the delegation is recorded in the decision log.
- Recommend `Parked` when evidence is insufficient but the idea remains plausible.
- Recommend `Rejected` when it conflicts with product strategy, creates unacceptable risk, or fails an agreed evidence threshold.
- Approval confirms an MVP hypothesis, not that every assumption is true.

## Promotion

An `Approved` idea is promoted by:

1. Updating relevant product-level sections in `docs/requirements.md`.
2. Creating one or more `tasks/<feature>.md` files from `tasks/template.md`.
3. Setting each task's `source_idea` to the idea ID.
4. Adding task IDs to the brief's `promoted_tasks`.
5. Translating the brief into observable acceptance criteria rather than copying speculative prose.
6. Marking the idea `Promoted` only when references are bidirectional and validation passes.

The first task remains `Draft` until the Product Gate in `docs/delivery-workflow.md` passes. Promotion does not authorize architecture, implementation, or production release by itself.

## Product Brief Ready Gate

- Raw idea and decision owner are recorded.
- Target user, context, problem, workaround, and desired outcome are specific.
- Facts, assumptions, unknowns, confidence, and validation actions are separated.
- MVP, non-goals, journey, metrics, material risks, and delivery hypotheses are documented.
- Blocking product choices are resolved or presented to the decision owner.
- Product review checklist and decision log are current.
