# AGENTS

## Instruction Order

- Before editing, read the nearest role `AGENTS.md`, then this file.
- **Implementation default:** read and obey `docs/code-quality-prerequisites.md` before any code change. Quality is the primary job.
- For repeated iterations or follow-up optimization, also follow `docs/iterative-implementation-guidelines.md` to keep context and change scope bounded.
- Read `docs/delivery-workflow.md` and task front matter **only when the user explicitly asks for delivery, task status, multi-role orchestration, or process gates** (`交付`, status updates, blockers, release).
- For product requests from a non-technical owner, use `docs/product-request-template.md`; the owner describes only the requirement and desired user outcome, then `顺序完成` starts the role-separated delivery loop.
- Role instructions may tighten, but never weaken, this contract.
- Preserve unrelated user changes; never discard work to resolve a conflict silently.

## Code-First Contract（默认工作方式）

用户优先要的是**高质量代码**，不是门禁运营。默认遵守：

1. **不管门禁**：不主动推进/解释/纠缠 task 状态机、Blocked、DevTools/真机/浏览器人工验收是否“过门”。用户没点名流程时，这些都不是本轮目标。
2. **落码前必过质量前提**：完成 `docs/code-quality-prerequisites.md` 清单（意图、短基线、职责边界、健壮性、最小 diff），说不清边界不写代码。
3. **质量硬标准**：正确性、可维护性、可扩展性、健壮性、与仓库一致的简洁实现；错误不吞、鉴权在服务端、避免第二套真相源。
4. **用本地可运行验证说话**：模块测试/语法/最近 runner 证明行为；不报告“环境不可用所以假设通过”。
5. **向用户交代工程结果**：改了什么行为、关键设计取舍、如何验证；不默认长篇交付门禁叙事。

当用户明确要求交付闭环时，再叠加下文 Operating Contract / Closed-Loop Delivery；且实现部分仍以本契约与 `docs/code-quality-prerequisites.md` 为准。

## Iteration Contract

- Treat the user's latest explicit intent and the task acceptance criteria as the current source of truth.
- Establish a short current-state baseline before editing; do not repeatedly reload unrelated modules or re-infer already recorded decisions.
- Make the smallest change that produces observable acceptance evidence. Record adjacent improvements as follow-up work instead of silently expanding the current request.
- Separate confirmed requirements from visual or structural preferences that are still being optimized.
- End each implementation round with local verification evidence, a diff-scope check, and (only if useful) one clearly prioritized next engineering action—not a gate checklist unless requested.

## Product Owner Entry Point

- Treat the product owner's latest requirement and desired user outcome as the primary intent.
- Before implementation, Product Agent owns scope and acceptance criteria; Architect owns technical boundaries; Backend and Frontend own implementation; Test owns independent acceptance evidence.
- When the product owner says `顺序完成`, continue through the documented delivery phases without asking for confirmation between reversible repository steps.
- Pause only for product tradeoffs, production release, real user data, secrets, paid external actions, irreversible changes, or unavailable required platform access.
- Keep the final report non-technical and state whether the product is ready to experience.

## Sources of Truth

| Concern | Source |
| --- | --- |
| **Pre-coding quality bar (default)** | `docs/code-quality-prerequisites.md` |
| Idea, assumptions, MVP decision | `ideas/*.md` and `docs/product-discovery.md` |
| Product behavior | `docs/requirements.md` and task acceptance criteria |
| System boundaries | `docs/architecture.md` |
| Client structure and pre-coding check | `docs/client-architecture.md` |
| HTTP contract | `docs/openapi.yaml` |
| Data model | `docs/database.md` |
| Delivery state (only when user asks for delivery) | YAML front matter in `tasks/*.md` and `issues/*.md` |
| Gates and transitions (only when user asks for delivery) | `docs/delivery-workflow.md` |
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

- **Default path:** implement against `docs/code-quality-prerequisites.md`; skip delivery gate ceremony unless the user requested it.
- Client implementation still follows `docs/client-architecture.md` ownership rules (structure for quality), without requiring formal gate paperwork unless delivery is requested.
- When the user **explicitly** runs delivery / status workflows: perform preflight and transitions in `docs/delivery-workflow.md`; update task/issue front matter and handoff rows on transitions.
- Use `P0`, `P1`, `P2`, `P3` priority order only when triaging issues/tasks the user asked to manage; retests outrank new feature work at equal priority.
- An implementation owner may mark an issue `Ready for Retest`, but only Test Agent may mark it `Closed`—and only when status tracking is in scope.
- Do not claim success without local verification. Never invent pass results for checks that did not run; simply report what was verified and ship solid code for the rest.

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
