# AGENTS

## Instruction Order

- Before editing, read the nearest role `AGENTS.md`, then this file.
- Read `docs/delivery-workflow.md` and the target idea/task before work.
- For repeated iterations or follow-up optimization, also follow `docs/iterative-implementation-guidelines.md` to keep context and change scope bounded.
- For product requests from a non-technical owner, use `docs/product-request-template.md`; the owner describes only the requirement and desired user outcome, then `顺序完成` starts the role-separated delivery loop.
- Role instructions may tighten, but never weaken, this contract.
- Preserve unrelated user changes; never discard work to resolve a conflict silently.

## Iteration Contract

- Treat the user's latest explicit intent and the task acceptance criteria as the current source of truth.
- Establish a short current-state baseline before editing; do not repeatedly reload unrelated modules or re-infer already recorded decisions.
- Make the smallest change that produces observable acceptance evidence. Record adjacent improvements as follow-up work instead of silently expanding the current request.
- Separate confirmed requirements from visual or structural preferences that are still being optimized.
- End each implementation round with exact verification evidence, a diff-scope check, and one clearly prioritized next action.

## Product Owner Entry Point

- Treat the product owner's latest requirement and desired user outcome as the primary intent.
- Before implementation, Product Agent owns scope and acceptance criteria; Architect owns technical boundaries; Backend and Frontend own implementation; Test owns independent acceptance evidence.
- When the product owner says `顺序完成`, continue through the documented delivery phases without asking for confirmation between reversible repository steps.
- Pause only for product tradeoffs, production release, real user data, secrets, paid external actions, irreversible changes, or unavailable required platform access.
- Keep the final report non-technical and state whether the product is ready to experience.

## Sources of Truth

| Concern | Source |
| --- | --- |
| Idea, assumptions, MVP decision | `ideas/*.md` and `docs/product-discovery.md` |
| Product behavior | `docs/requirements.md` and task acceptance criteria |
| System boundaries | `docs/architecture.md` |
| Client structure and pre-coding check | `docs/client-architecture.md` |
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
- Client implementation roles must complete and record `docs/client-architecture.md` before editing code.
- Update task/issue front matter and append a handoff row in the same change as each transition.
- Use `P0`, `P1`, `P2`, `P3` priority order; retests outrank new feature work at equal priority.
- An implementation owner may mark an issue `Ready for Retest`, but only Test Agent may mark it `Closed`.
- Do not mark a task `Done` unless the validator and all applicable quality gates pass.
- Record exact commands and results. If a required check cannot run, use `Blocked`; never report an assumed pass.

## Closed-Loop Delivery Rules

- `交付 <task>` / `deliver <task>` must use `ruby scripts/deliver.rb <task>` as the local execution entry point after implementation and after every fix round.
- The delivery runner must execute all required backend, frontend target, service health, and applicable integration checks selected by task front matter.
- A failed runner check is actionable failure evidence. Route it to the owning scope, create or update the linked issue, and run the repair/retest loop; do not manually mark the check as passed.
- The repair/retest loop is bounded by the runner's configured maximum rounds. When no repair command, tool, credential, or platform environment is available, record the exact blocker and stop at `Blocked` or the appropriate failed gate.
- A runner pass is necessary evidence, but it does not by itself close issues or mark a task `Done`; Test Agent still owns acceptance-criterion evidence, independent retest, and final test status.
- Preserve runner reports and log paths in the task verification evidence or handoff. The default evidence root is `/tmp/ppfiles-learn-delivery/<task-id>/`.
- Never bypass production deployment approval, secret access, destructive changes, real WeChat authorization, or unavailable platform-specific checks through the runner.

## Autonomous Delivery

`交付 <task>` runs the full loop: Product -> Architect -> required implementation scopes -> Test -> issue fix/retest -> release gate -> Done.

The executable local loop is `ruby scripts/deliver.rb <task>`. The command is an orchestrator aid, not a replacement for role ownership or Test Agent closure.

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
