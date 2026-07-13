# AGENTS

## Instruction Order

- Before editing, read the nearest role `AGENTS.md`, then this file.
- Read `docs/delivery-workflow.md` and the target idea/task before work.
- Role instructions may tighten, but never weaken, this contract.
- Preserve unrelated user changes; never discard work to resolve a conflict silently.

## Sources of Truth

| Concern | Source |
| --- | --- |
| Idea, assumptions, MVP decision | `ideas/*.md` and `docs/product-discovery.md` |
| Product behavior | `docs/requirements.md` and task acceptance criteria |
| System boundaries | `docs/architecture.md` |
| HTTP contract | `docs/openapi.yaml` |
| Data model | `docs/database.md` |
| Delivery state | YAML front matter in `tasks/*.md` and `issues/*.md` |
| Gates and transitions | `docs/delivery-workflow.md` |
| Test policy | `docs/testing.md` |

## Role Commands

| Command | Role |
| --- | --- |
| `想法 <idea>` / `idea <idea>` | Product Discovery |
| `产品 <task>` / `product <task>` | Product Agent |
| `架构 <task>` / `architect <task>` | Architect Agent |
| `后端 <task>` / `backend <task>` | Backend Agent |
| `前端 <task>` / `frontend <task>` | Frontend Agent |
| `小程序 <task>` / `miniprogram <task>` | Frontend MiniProgram Agent |
| `Web <task>` / `web <task>` | Frontend Web Agent |
| `移动端 <task>` / `mobile <task>` | Mobile Agent |
| `iOS <task>` / `ios <task>` | iOS Agent |
| `安卓 <task>` / `android <task>` | Android Agent |
| `测试 <task>` / `test <task>` | Test Agent |
| `交付 <task>` / `deliver <task>` | Orchestrator Agent |
| `下一个 <role>` / `next <role>` | Highest-priority eligible issue, then task |

Short task names map to `tasks/<task>.md`. See `COMMANDS.md` for examples.

## Operating Contract

- Perform the preflight, entry gate, work, verification, and exit gate defined in `docs/delivery-workflow.md`.
- Update task/issue front matter and append a handoff row in the same change as each transition.
- Use `P0`, `P1`, `P2`, `P3` priority order; retests outrank new feature work at equal priority.
- An implementation owner may mark an issue `Ready for Retest`, but only Test Agent may mark it `Closed`.
- Do not mark a task `Done` unless the validator and all applicable quality gates pass.
- Record exact commands and results. If a required check cannot run, use `Blocked`; never report an assumed pass.

## Autonomous Delivery

`交付 <task>` runs the full loop: Product -> Architect -> required implementation scopes -> Test -> issue fix/retest -> release gate -> Done.

- If the task is missing, Product may promote a matching `Approved` idea; otherwise stop at the product decision required.
- Continue through reversible repository edits and local verification without asking between phases.
- Use role-separated handoffs and evidence even when one agent performs multiple roles.
- Delegate independent scopes when agent delegation is available; otherwise execute them sequentially.
- Stop only for a documented blocker or approval boundary, record it in the task, and state the exact decision needed.
- Approval is mandatory for production deployment, destructive data changes, secret/credential access, paid external actions, legal/compliance decisions, and unresolved product tradeoffs.

## Root Tooling

- No application package manager is defined at repository root.
- Validate workflow files with `ruby scripts/validate_workflow.rb`.
- Use the closest module's documented file-scoped test, lint, and typecheck commands when implementation tooling exists.

## Commit Attribution

- Commit only when requested.
- AI commits must include `Co-Authored-By: <agent model and attribution byline>`.
