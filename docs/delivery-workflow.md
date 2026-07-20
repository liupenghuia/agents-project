# Delivery Workflow

## Canonical Delivery Sequence（强制默认顺序）

本仓库**默认且唯一**的多角色交付顺序如下（以后一律按此执行）：

```text
1. Product Agent（产品）
     完成范围、验收、required_scopes / frontend_targets、scope_status 初值
     产品门禁通过 → 任务 status = Ready for Architecture
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      │
2a. Architect Agent      2b. Designer Agent           │  产品完成后并行
    架构 / API / 库表         交互·视觉·IA / Design Spec  │  （无客户端 UI 时跳过设计）
    architecture → Done       design → Done 或 N/A     │
        │                      │                      │
        └──────────┬───────────┘                      │
                   ▼                                  │
3. 双门禁齐备：architecture=Done 且 design∈{Done, N/A}
     → status = Ready for Implementation
                   │
                   ▼
4. 开发工程师角色落码（可并行，仅在本阶段开始）
     Backend / Frontend / MiniProgram / Web / Mobile / iOS / Android
                   │
                   ▼
5. Test Agent →（缺陷修复/复测）→ 发布门禁（如需）→ Done
```

### 硬性规则

1. **禁止跳过产品**：开发不得在 `scope_status.product` 未 `Done`、任务未过产品门禁时开始功能实现。
2. **产品完成后才进架构与设计**：`架构` / `设计` 仅在 `status` 为 `Ready for Architecture`（或之后、且产品已 Done）时启动；二者**并行**，互不等待对方开工。
3. **禁止抢跑开发**：在 `status` 达到 `Ready for Implementation` 之前，**不得**开始 Backend / Frontend / 小程序 / Web / Mobile 等实现落码（允许只读调研，不得改业务代码或把实现 scope 标为 `Done`）。
4. **进入开发的条件**：`architecture=Done`，且 `design=Done`（有客户端 UI）或 `design=N/A`（无客户端 UI）。由**最后完成**的一方（Architect 或 Designer）或 Orchestrator 将任务标为 `Ready for Implementation` 并写 handoff。
5. **有 UI 必设计**：只要 `frontend` / `mobile` / `ios` / `android` 任一为 true，或任一 `frontend_targets` 为 true，则必须走 Designer，不得用实现顺便「代替设计」。
6. **交付命令遵循同一顺序**：`交付 <task>` / `顺序完成` = Product →（Architect ∥ Designer）→ Implementation → Test → …；不得先写码再补产品/架构/设计门禁（除非用户明确只要单点修 bug 且声明跳过完整交付）。

状态名 `Ready for Architecture` 在本仓库表示：**产品已完成，进入「架构 + 设计」阶段**（兼容历史命名；新文档可写作 Ready for Architecture & Design）。

## Idea State Machine

| Status | Set by | Exit condition | Next |
| --- | --- | --- | --- |
| `Captured` | Product | Raw idea and decision owner recorded | `Discovering`, `Rejected` |
| `Discovering` | Product | Discovery loop executed with evidence labels | `Ready for Review`, `Parked`, `Rejected` |
| `Ready for Review` | Product | Product Brief Ready Gate passes | `Approved`, `Parked`, `Rejected`, `Discovering` |
| `Approved` | Decision owner | MVP decision recorded | `Promoted`, `Discovering` |
| `Parked` | Decision owner | Revisit trigger recorded | `Discovering`, `Rejected` |
| `Rejected` | Decision owner | Reason recorded | Terminal |
| `Promoted` | Product | Requirements and bidirectionally linked tasks created | Terminal |

Follow `docs/product-discovery.md`. Product Agent must distinguish facts, assumptions, and unknowns; only the recorded decision owner may approve, park, or reject an idea.

## Preflight

1. Load the role instructions, root instructions, task, source documents, and linked issues.
2. Run `ruby scripts/validate_workflow.rb` before changing delivery state.
3. Pick work by `P0` to `P3`, then oldest `created` date. `Ready for Retest` comes before new work at equal priority.
4. Do not start a new feature when the role owns a `P0`/`P1` issue or the task has an unresolved blocking issue.
5. Confirm dependencies are `Done`; otherwise set the task to `Blocked` and document the unblock condition.
6. Before editing Frontend, Mini Program, Web, shared Mobile, iOS, or Android code, complete and record the check in `docs/client-architecture.md`. Unresolved review triggers return to Architect before implementation.

## Frontend Target State

Frontend has an aggregate `scope_status.frontend` plus independent target metadata:

```yaml
frontend_targets:
  miniprogram: true
  web: false
frontend_target_status:
  miniprogram: Pending
  web: N/A
```

- `frontend_targets` selects required delivery targets; a false target must remain `N/A`.
- `frontend_target_status` is owned by the target Agent. `小程序` updates only `miniprogram`; `Web` updates only `web`.
- `前端` coordinates cross-target work and sets aggregate frontend `Done` only after every required target is `Done` and evidenced.
- Each target handoff records changed files, exact commands/results, issues, and next action in the task and `frontend/HISTORY.md`.
- A target may be implemented in parallel only after the API/requirements contract is stable; cross-target behavior changes require a coordinator handoff.

## Task State Machine

| Status | Set by | Entry condition | Next |
| --- | --- | --- | --- |
| `Draft` | Product | Task created | `Ready for Architecture`, `Blocked`, `Cancelled` |
| `Ready for Architecture` | Product | Product gate passes（同时开放 Architect **与** Designer） | `Ready for Implementation`, `Blocked` |
| `Ready for Implementation` | Architect、Designer 或 Orchestrator（**两者门禁均满足后**） | `architecture=Done` 且 `design` 为 `Done` 或 `N/A` | `In Progress`, `Blocked` |
| `In Progress` | Implementation owner | 任务已是 `Ready for Implementation`，且至少一个 required implementation scope 已开工 | `Ready for Test`, `Blocked` |
| `Blocked` | Any role | Blocker and unblock condition recorded | Previous eligible state, `Cancelled` |
| `Ready for Test` | Last implementation owner | All required implementation scopes are `Done` | `Test Failed`, `Ready for Release`, `Done` |
| `Test Failed` | Test | Issue created and linked | `Ready for Retest`, `Blocked` |
| `Ready for Retest` | Fix owner | All linked fixes await independent retest | `Test Failed`, `Ready for Release`, `Done` |
| `Ready for Release` | Test | Test gate passes and release is required | `Released`, `Blocked` |
| `Released` | Orchestrator or authorized operator | Release evidence recorded | `Done`, `Blocked` |
| `Done` | Test or authorized release operator | Definition of Done passes | Terminal |
| `Cancelled` | Product | Reason recorded | Terminal |

Scope values are `N/A`, `Pending`, `In Progress`, `Blocked`, or `Done`. Overall status never replaces `scope_status`; parallel owners update only their scope.

## Issue State Machine

| Status | Set by | Required evidence |
| --- | --- | --- |
| `Open` | Test | Reproduction, expected/actual behavior, owner, severity |
| `Assigned` | Triage owner | Confirmed owner and routing reason |
| `Fixing` | Fix owner | Investigation or implementation started |
| `Ready for Retest` | Fix owner | Fix notes, changed files, verification command/result |
| `Retest Failed` | Test | Reproduction and failure evidence from retest |
| `Closed` | Test | Original reproduction and relevant automated tests pass |

Severity is `P0` production/security/data-loss impact, `P1` core flow blocked, `P2` degraded non-core behavior, or `P3` minor impact.

## Entry And Exit Gates

### Product Gate

- A source idea is `Approved` or `Promoted`, or the task records why no discovery brief is needed.
- Goal, users, priority, in/out scope, assumptions, and dependencies are explicit.
- Acceptance criteria are observable and include errors, empty states, permissions, and applicable non-functional requirements.
- Required delivery scopes are set in task front matter; non-applicable scopes are `N/A`.
- Set `scope_status.design` to `Pending` when any client UI is required, otherwise `N/A`; set `architecture` to `Pending` (or keep in progress only if Product is still finishing).
- On pass: `scope_status.product=Done`, task `status=Ready for Architecture`, handoff **同时**指向 Architect 与 Designer（无 UI 则仅 Architect）。

### Architecture Gate

- Architecture, API, database, security, migration, compatibility, and rollback impacts are documented or explicitly `None`.
- Ownership boundaries, error behavior, and external dependencies are resolved.
- Required client targets have responsibility placement, dependency direction, and shared-versus-platform decisions documented at a level proportional to the change.
- Breaking contract changes include a versioning and consumer migration decision.
- On pass: `scope_status.architecture=Done`. **Do not** set `Ready for Implementation` until Design Gate is also satisfied (`design=Done` or `N/A`). If design is already satisfied, Architect (or Orchestrator) may advance the task status.

### Design Gate

Applies when any client UI scope is required (`frontend` / `mobile` / `ios` / `android`, or any `frontend_targets.*`).

- Starts **after Product Gate**, **in parallel with Architecture** (not only after architecture).
- Designer Agent owns `scope_status.design` and the task **Design Spec** (see `docs/design/AGENTS.md`).
- User flows, primary CTA hierarchy, information architecture, and loading/empty/error/success states are explicit for key screens.
- Visual notes reuse `docs/design/README.md` tokens/patterns unless a deliberate system change is recorded.
- Reconcile field/API assumptions with Architect before marking design `Done` when contracts affect screens; blockers go to task notes, not silent guesses.
- Handoff names implementing targets (Mini Program / Web / Mobile / …).
- When no client UI is required, `scope_status.design` must remain `N/A`.
- On pass: `scope_status.design=Done`. **Do not** set `Ready for Implementation` until Architecture Gate is also `Done`. If architecture is already `Done`, Designer (or Orchestrator) may advance the task status.

### Implementation Entry Gate（开发开工门禁）

Must pass **before** any implementation agent edits feature code or marks an implementation scope `In Progress`/`Done`:

- Task `status` is `Ready for Implementation` or `In Progress` (never `Draft` / pure product-only).
- `scope_status.product=Done` and `scope_status.architecture=Done`.
- `scope_status.design=Done` when client UI is required; otherwise `design=N/A`.

### Implementation Gate（开发完成门禁）

- Every required scope is `Done`; code, tests, documentation, and generated contracts agree.
- Implementation began only after the Implementation Entry Gate (above).
- Every client scope records its pre-coding architecture check; the implementation follows that decision or includes a completed Architect impact review for deviations.
- UI implementation follows the Design Spec; material deviations require Designer re-review notes.
- Changed files and exact verification commands/results are recorded in the task.
- Every required frontend target is `Done` with a matching history entry.
- No required check is skipped without a blocker.

### Test Gate

- Every acceptance criterion has pass/fail evidence.
- Required unit, integration, contract, UI, and end-to-end checks pass as applicable.
- All linked issues are `Closed`; regression coverage is recorded.

### Release Gate

- If `release_required: false`, Test may move a passing task directly to `Done`.
- Otherwise record environment, artifact/version, deployment command or run, smoke test, monitoring, and rollback readiness.
- Production release requires explicit approval unless the user already authorized that release in the current request.

## Blockers And Recovery

- Record `blocked_reason`, `blocked_since`, `unblock_owner`, and `unblock_condition` in task front matter.
- Retry a transient command at most twice after the original failure; record all attempts. Then mark `Blocked` if no safe alternative exists.
- On resume, rerun preflight and the last failed gate. Do not restart completed phases.
- Concurrent agents must not overwrite another scope's status or handoff rows; re-read shared files immediately before editing.

## Change Control

- Changed acceptance criteria return the task to `Ready for Architecture` and require Product handoff notes; UI-impacting changes also return `scope_status.design` to `Pending` or `In Progress`.
- Changed API/database contracts after implementation starts require Architect impact review and affected scopes return to `Pending`; affected Design Spec sections must be re-reviewed before Frontend finishes.
- New scope requires updated estimates/dependencies, tests, and explicit Product ownership; enabling client UI sets `design` from `N/A` to `Pending`.
- Adding or removing a frontend target returns affected target statuses to `Pending` and requires a coordinator handoff.
- Every transition appends date, actor, from/to status, evidence, and next action to the handoff log.

## Definition Of Done

- Product, architecture, design (when client UI is required), implementation, test, and applicable release gates pass.
- Required scopes are `Done`; excluded scopes are `N/A`.
- Linked issues are `Closed`; dependencies are `Done`.
- `ruby scripts/validate_workflow.rb` passes.
- Known limitations and follow-up work are documented rather than hidden.

## Local Delivery Runner

`ruby scripts/deliver.rb <task>` is the repository-level execution entry point for the reversible local loop. It must:

1. Start a multi-agent **delivery run** (`docs/agent-runtime.md`) and print its `run_id`.
2. Validate workflow metadata before feature checks.
3. Read the task's required scopes and frontend targets.
4. Run the applicable backend, Mini Program, Web, and service health checks.
5. Store exact commands, outputs, and service logs under `/tmp/ppfiles-learn-delivery/<task-id>/`.
6. Dual-write each check/gate/repair outcome into `.agent-runs/<run_id>/events.jsonl`.
7. Stop with failed evidence when no repair command is configured (`run.blocked` when repair is unavailable).
8. When `DELIVERY_REPAIR_COMMAND` is configured, run the repair command with `DELIVERY_TASK`, `DELIVERY_ROUND`, `DELIVERY_RUN_DIR`, and `AGENT_RUN_ID`, then repeat checks.
9. Stop after the configured maximum rounds; never report a passing task from an assumed or skipped check.
10. Terminalize the agent run with `run.completed` or `run.blocked` / `run.failed`.

Runner failure handling follows the issue state machine: Test Agent records an actionable failure under `issues/`, the owning role fixes it and marks it `Ready for Retest`, and Test Agent independently retests it. The runner may provide failure evidence and invoke the configured repair command, but it does not close issues or bypass task status gates.

The runner does not bypass human approval for production deployment, secrets, destructive changes, or real WeChat authorization. Platform-specific Mini Program checks remain explicit manual or DevTools gates. Emit `interrupt.requested` for those boundaries and wait for `human.decision`.

## Multi-Agent Runtime Observability

When delivery or multi-role orchestration is in scope:

1. Prefer reconstructing process from `ruby scripts/agent_run.rb timeline <run_id>` rather than chat history.
2. Dual-write status handoffs with `ruby scripts/agent_run.rb handoff ...` and paste the markdown row into the task `Handoff Log`.
3. Treat `.agent-runs/` as local process truth; do not commit it (see `.gitignore`).
4. Collaboration topology is declared in `docs/agent-graph.yaml`; node ids on events must match that graph.
5. Positioning and non-goals: `docs/agent-system-positioning.md`.
