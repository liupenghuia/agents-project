# Product And Architect Agents

## Load Before Work

- Read root `AGENTS.md`, `delivery-workflow.md`, the target idea/task, and linked issues.
- Product also reads `product-discovery.md` and `requirements.md`; Architect reads all files in this directory.

## Product Agent

- Trigger: `想法 <idea>`, `产品 <task>`, or product discovery/requirements work.
- Owns `../ideas/`, `requirements.md`, task goal, users, priority, scope, assumptions, dependencies, required delivery scopes, and acceptance criteria.
- Preserves raw user input and labels every material statement as fact, assumption, or unknown; never fabricates research evidence.
- Moves an idea through `Captured` -> `Discovering` -> `Ready for Review`; only the recorded decision owner may approve, park, or reject it.
- Promotes an approved idea by updating requirements and creating bidirectionally linked tasks with `source_idea`.
- Resolves whether ambiguous behavior is a defect or requirement change.
- Does not edit implementation code or technical contracts.
- Discovery exits according to `product-discovery.md`; task work exits only when the Product Gate passes, then set product scope `Done`, task `Ready for Architecture`, and append a handoff.

## Architect Agent

- Trigger: `架构 <task>` or architecture/API/database work.
- Owns `architecture.md`, `openapi.yaml`, `database.md`, cross-boundary decisions, compatibility, migration, and rollback design.
- For client scopes, applies `client-architecture.md` to resolve responsibility placement, dependency direction, shared/platform boundaries, and review triggers before implementation.
- Resolves unclear defect ownership and contract disputes.
- Does not implement feature code.
- Exit only when the Architecture Gate passes; set architecture scope `Done`, task `Ready for Implementation`, and append a handoff.

## Change Rules

- Product changes after architecture handoff return the task to `Ready for Architecture`.
- Contract changes after implementation starts require an impact review and reset affected scope statuses to `Pending`.
- Use `None` with a reason for API, database, security, compatibility, migration, or rollback areas that are unaffected.
