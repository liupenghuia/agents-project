# Commands

Use these short commands when asking an agent to work in this repository.

## Idea Discovery

```text
想法 smart-expense-assistant
```

English equivalent: `idea smart-expense-assistant`.

Include the raw idea after the command. If `ideas/smart-expense-assistant.md` does not exist, Product Agent creates it from `ideas/template.md`, separates facts/assumptions/unknowns, defines the problem, user, MVP, journey, metrics, risks, and presents a product recommendation. It stops at `Ready for Review` unless the recorded decision owner approves.

## Product

```text
产品 user-management
```

Expands to: continue discovery when the name matches an idea, or update requirements and task acceptance criteria when it matches a task. An approved idea is promoted into requirements and bidirectionally linked task files.

## Architect

```text
架构 user-management
```

Expands to: after Product Gate, read architecture rules, update `docs/architecture.md`, `docs/openapi.yaml`, `docs/database.md`, set `architecture=Done`. Advance to `Ready for Implementation` only if design is already `Done` or `N/A`; otherwise stay in architecture/design phase. Does not start implementation coding.

## Design

```text
设计 user-management
```

English equivalent: `design user-management`.

Expands to: after Product Gate (parallel with Architect), read `docs/design/AGENTS.md` and `docs/design/README.md`, produce or update the task **Design Spec**, set `scope_status.design=Done` when the Design Gate passes. Advance to `Ready for Implementation` only if architecture is already `Done`. Does not own product scope, API contracts, or implementation code; developers must not code until that status is reached.

## Backend

```text
后端 user-management
```

Expands to: read backend rules, check backend issues first, then implement backend work for the task.

## Mobile

```text
移动端 user-management
```

Expands to: read mobile rules, check mobile issues first, then implement shared mobile work for the task.

## iOS

```text
iOS user-management
```

Expands to: read iOS rules, check iOS issues first, then implement iOS work for the task.

## Android

```text
安卓 user-management
```

Expands to: read Android rules, check Android issues first, then implement Android work for the task.

## Frontend

```text
前端 user-management
```

Expands to: read frontend rules, check frontend issues first, then implement frontend work for the task.

## WeChat Mini Program

```text
小程序 user-management
```

English equivalent: `miniprogram user-management`.

Expands to: read `frontend/AGENTS.md` and `frontend/miniprogram/AGENTS.md`, check Mini Program issues first, then implement only the `frontend_targets.miniprogram` scope and record target history.

## Web

```text
Web user-management
```

English equivalent: `web user-management`.

Expands to: read `frontend/AGENTS.md` and `frontend/web/AGENTS.md`, check Web issues first, then implement only the `frontend_targets.web` scope and record target history. Web scope includes protected reviewer operations when the task requires it.

## Test

```text
测试 user-management
```

Expands to: read test rules, retest `Ready for Retest` issues first, then test the task.

## Autonomous Delivery

```text
交付 user-management
```

English equivalent: `deliver user-management`.

Expands to: promote a matching approved idea when needed, then run **Product → Architect and Designer in parallel (design skipped only when no client UI) → only then Backend/Frontend/MiniProgram/Web/… → Test → fix/retest → release gate** until `Done` or a documented blocker. Implementation code changes are forbidden until architecture is Done and design is Done or N/A. Production, destructive, secret, paid, legal, and unresolved product decisions still require approval.

### Local Delivery Runner

The repository also provides an executable local loop:

```bash
ruby scripts/deliver.rb user-management
```

The runner validates workflow metadata, executes required module checks, starts local backend/Web services for health checks, saves evidence, **opens an agent run under `.agent-runs/`**, dual-writes check/gate/repair events, and can invoke a configured repair command before retesting. Configure `DELIVERY_REPAIR_COMMAND` or pass `--repair-command`; the default maximum is three rounds.

### Agent Runtime (observability + HITL)

```bash
ruby scripts/agent_run.rb start --task user-management --mode manual
ruby scripts/agent_run.rb handoff --run <run_id> \
  --from "Product Agent" --to "Architect Agent" \
  --from-status Draft --to-status "Ready for Architecture" \
  --evidence "Product gate passed" --next "Architect owns contracts"
ruby scripts/agent_run.rb interrupt --run <run_id> --reason "MVP tradeoff" --options approve,edit_scope,park
ruby scripts/agent_run.rb decide --run <run_id> --decision approve --by User --note "Ship list-only MVP"
ruby scripts/agent_run.rb list
ruby scripts/agent_run.rb timeline <run_id>
```

See `docs/agent-runtime.md` and `docs/agent-system-positioning.md`.

## Next Work

```text
下一个 设计
下一个 前端
下一个 小程序
下一个 Web
下一个 后端
下一个 移动端
下一个 iOS
下一个 安卓
下一个 测试
```

Expands to: pick `Ready for Retest` first at equal priority, then owned issues, then eligible tasks. Sort by `P0` through `P3`, then oldest creation date.
