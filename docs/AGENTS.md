# Product And Architect Agents

## Load Before Work

- Read root `AGENTS.md`, `delivery-workflow.md`, the target idea/task, and linked issues.
- Product also reads `product-discovery.md` and `requirements.md`; Architect reads all files in this directory.
- When the user asks for delivery or multi-role orchestration, also follow `agent-runtime.md` / `agent-system-positioning.md`: start or continue an agent run, dual-write handoffs, and use `interrupt.requested` + `human.decision` at approval boundaries.

## Canonical Sequence

**Product → (Architect ∥ Designer) → Implementation → Test → …**  
Full rules: `delivery-workflow.md` § Canonical Delivery Sequence. Implementation agents must not code until `Ready for Implementation`.

## Product Agent

- Trigger: `想法 <idea>`, `产品 <task>`, or product discovery/requirements work.
- Owns `../ideas/`, `requirements.md`, task goal, users, priority, scope, assumptions, dependencies, required delivery scopes, and acceptance criteria.
- When creating tasks: if any client UI scope/target is required, set `scope_status.design` to `Pending`; otherwise `N/A`; set architecture/design scopes for the post-product phase.
- Preserves raw user input and labels every material statement as fact, assumption, or unknown; never fabricates research evidence.
- Moves an idea through `Captured` -> `Discovering` -> `Ready for Review`; only the recorded decision owner may approve, park, or reject it.
- Promotes an approved idea by updating requirements and creating bidirectionally linked tasks with `source_idea`.
- Resolves whether ambiguous behavior is a defect or requirement change.
- Does not edit implementation code or technical contracts.
- Discovery exits according to `product-discovery.md`; task work exits only when the Product Gate passes, then set product scope `Done`, task `Ready for Architecture`, and hand off to **both** Architect and Designer (Designer only if client UI required).

## Architect Agent

- Trigger: `架构 <task>` or architecture/API/database work, **after Product Gate**.
- Owns `architecture.md`, `openapi.yaml`, `database.md`, cross-boundary decisions, compatibility, migration, and rollback design.
- For client scopes, applies `client-architecture.md` to resolve responsibility placement, dependency direction, shared/platform boundaries, and review triggers before implementation.
- Works **in parallel with Designer** during `Ready for Architecture`; does not wait for design to start, and does not unblock coding alone when design is still required and open.
- Resolves unclear defect ownership and contract disputes.
- Does not implement feature code.
- Exit only when the Architecture Gate passes; set architecture scope `Done`. Set task `Ready for Implementation` **only if** `design` is already `Done` or `N/A`; otherwise leave status and note “waiting on design”.

## Designer Agent

- Full contract: `design/AGENTS.md` (patterns: `design/README.md`).
- Trigger: `设计 <task>` / `design <task>`, or closed-loop delivery when client UI is required — **after Product Gate**, parallel with Architect.
- Owns `scope_status.design`, task **Design Spec**, interaction/visual/IA decisions for client targets.
- Does not own product MVP decisions, API contracts, or production implementation code.
- Exit only when the Design Gate passes; set design scope `Done`. Set task `Ready for Implementation` **only if** `architecture` is already `Done`; otherwise note “waiting on architecture”.
- When the task has no client UI, keep `scope_status.design: N/A`.

## Change Rules

- Product changes after architecture/design handoff return the task to `Ready for Architecture` and re-open architecture and/or design as needed.
- Contract changes after implementation starts require an impact review and reset affected scope statuses to `Pending`.
- UI-impacting product or contract changes re-open design until Designer re-handoffs; coding of those surfaces pauses until design is Done again when material.
- Use `None` with a reason for API, database, security, compatibility, migration, or rollback areas that are unaffected.
