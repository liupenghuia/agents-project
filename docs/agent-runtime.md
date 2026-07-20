# Agent Runtime

## Purpose

Provide **professional multi-agent observability and HITL control** on top of the existing delivery OS:

- Append-only event stream per run
- Explicit collaboration graph (`docs/agent-graph.yaml`)
- Structured handoffs, gates, tool checks, interrupts, and human decisions
- CLI inspection without relying on chat transcripts

## Storage Layout

Default root: `.agent-runs/` (gitignored local state).

```text
.agent-runs/
  index.json                 # recent runs metadata
  <run_id>/
    run.json                 # run header (task, status, graph, timestamps)
    events.jsonl             # append-only events (one JSON object per line)
    summary.md               # generated timeline projection
```

Override with `AGENT_RUNS_DIR=/path/to/dir`.

## Run Header (`run.json`)

| Field | Meaning |
| --- | --- |
| `schema_version` | Currently `1` |
| `run_id` | `run-YYYYMMDD-HHMMSS-<hex>` |
| `task_id` | Task id from front matter, or bare task name when unknown |
| `task_file` | Relative path to task markdown when known |
| `graph` | Graph id from `docs/agent-graph.yaml` (`delivery-v1`) |
| `status` | `running` \| `completed` \| `blocked` \| `failed` \| `cancelled` |
| `mode` | `delivery` \| `manual` \| `repair` |
| `created_at` / `updated_at` | ISO-8601 UTC |
| `actors` | Distinct actors seen on the run |
| `active_node` | Last entered node id, if any |
| `parent_run_id` | Optional resume/fork parent |
| `delivery_run_dir` | Optional path to `/tmp/ppfiles-learn-delivery/...` |

## Event Envelope

Every line in `events.jsonl`:

```json
{
  "schema_version": 1,
  "event_id": "evt_...",
  "run_id": "run-...",
  "ts": "2026-07-18T00:00:00Z",
  "type": "run.started",
  "actor": "Orchestrator Agent",
  "task_id": "TASK-20260701-002",
  "node": null,
  "payload": {}
}
```

### Event Types

| Type | When | Required payload keys |
| --- | --- | --- |
| `run.started` | Run created | `mode`, optional `parent_run_id` |
| `run.completed` | Happy terminal | `result` (`passed`/`failed`), optional `summary` |
| `run.blocked` | Stopped for human / missing capability | `reason`, `unblock_condition`, optional `owner` |
| `run.failed` | Hard failure | `reason` |
| `run.cancelled` | Explicit cancel | `reason` |
| `node.entered` | Role / phase starts | `node` |
| `node.exited` | Role / phase ends | `node`, `outcome` |
| `message.handoff` | Role transfer / status transition | `from_actor`, `to_actor`, `from_status`, `to_status`, optional `evidence`, `next_action`, `changed_files` |
| `tool.called` | External command or tool begins | `tool`, optional `command` |
| `tool.finished` | Tool ends | `tool`, `success`, optional `command`, `log`, `duration_ms` |
| `gate.evaluated` | Product / architecture / implementation / test / release / workflow gate | `gate`, `result` (`pass`/`fail`), optional `evidence` |
| `check.finished` | Delivery runner atomic check | `label`, `success`, `command`, optional `log` |
| `repair.started` / `repair.finished` | Repair loop | `round`, and on finish `success` |
| `interrupt.requested` | HITL required | `reason`, `options` (array), optional `risk` |
| `human.decision` | Human response | `decision`, `by`, optional `note` |
| `run.checkpointed` | Reversibility marker | `ref` (git sha or label), optional `note` |
| `note` | Free-form structured annotation | `text` |

Actors should use the same role names as workflow owners (`Product Agent`, `Architect Agent`, …) or `User` for human decisions.

## Explicit Graph

See `docs/agent-graph.yaml`. Nodes mirror the delivery pipeline:

```text
discover → product_gate → architect → architecture_gate
  → implement (backend ∥ miniprogram ∥ web ∥ mobile…)
  → implementation_gate → test ⇄ fix → release_gate? → done
```

Verification / repair form a **subgraph** used by `scripts/deliver.rb` (`verify`, `repair`).

## HITL Contract

Emit `interrupt.requested` and set run status to `blocked` when any of these apply:

- Product MVP / tradeoff needs decision owner
- Production deploy, secrets, paid actions, legal/compliance
- Destructive data changes
- Missing platform access (e.g. real WeChat auth) that blocks Done
- Unresolved `Blocked` task with recorded unblock condition

Resume only after `human.decision`. Do not invent approval.

Recommended `options` vocabulary: `approve`, `reject`, `edit_scope`, `park`, `provide_info`, `cancel`.

## CLI

```bash
# Start a manual or delivery-linked run
ruby scripts/agent_run.rb start --task contact-history-and-online-contact --mode manual --actor "Orchestrator Agent"

# Record a handoff (also prints a markdown table row for task files)
ruby scripts/agent_run.rb handoff --run <run_id> \
  --from "Product Agent" --to "Architect Agent" \
  --from-status Draft --to-status "Ready for Architecture" \
  --evidence "Product gate passed" --next "Architect owns contracts"

# HITL
ruby scripts/agent_run.rb interrupt --run <run_id> --reason "MVP scope tradeoff" --options approve,edit_scope,park
ruby scripts/agent_run.rb decide --run <run_id> --decision approve --by User --note "Ship list-only MVP"

# Inspect
ruby scripts/agent_run.rb list
ruby scripts/agent_run.rb list --task TASK-20260716-015
ruby scripts/agent_run.rb show <run_id>
ruby scripts/agent_run.rb timeline <run_id>
```

`ruby scripts/deliver.rb <task>` automatically starts a `delivery` run and emits check / repair / gate / completion events.

## Projection Rules

| Projection | Rule |
| --- | --- |
| `summary.md` | Regenerated from events on each write |
| Task `Handoff Log` | Human edits or paste from `handoff` CLI row; must stay consistent with latest `message.handoff` events when delivery/orchestration is in scope |
| `/tmp/ppfiles-learn-delivery/...` | Binary/text command logs; referenced by `tool.finished` / `check.finished` `log` fields |

If Markdown and events diverge, **events win for process reconstruction**; fix the task log in the next handoff.

## Security

- Never write passwords, session tokens, AppSecrets, or phone numbers into payloads.
- Prefer paths and redacted summaries over raw tool stdout when sensitive.
- Run store is local-only by default; do not commit `.agent-runs/`.

## Versioning

- `schema_version: 1` on runs and events.
- Additive payload keys are allowed; renames require a new schema version and migration note here.
