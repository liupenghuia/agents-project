# Agent System Positioning

## Product Identity

This repository ships **two layers**:

| Layer | What it is | Primary users | Success metric |
| --- | --- | --- | --- |
| **A. Delivery OS** | Role contracts, idea/task/issue state machines, gates, evidence | Builders operating coding agents | Reproducible `Done` with audit trail |
| **B. Agent Runtime Observability** | Run records, event stream, explicit graph, HITL interrupts | Same builders, plus anyone reviewing multi-agent work | Any delivery can be reconstructed without the original chat |

Layer A already existed as Markdown + YAML + `deliver.rb`.  
Layer B is the professional multi-agent surface: **events as truth for process**, Markdown handoffs as human projections.

This project is **not** (yet) a consumer multi-agent chat product with a live canvas. Business Mini Program / Web UI remains product UI, not the agent control plane.

## Non-Goals (current phase)

- Replacing host IDE tool UIs (Cursor / Claude Code / etc.).
- Full LangGraph Studio parity or remote agent marketplace.
- Automatic production deploy without human approval.
- Storing secrets, raw tokens, or provider payloads in run events.

## Design Principles

1. **Single process truth for runtime:** append-only `events.jsonl` under `.agent-runs/<run_id>/`.
2. **Dual write:** role handoffs and the delivery runner both emit structured events; task `Handoff Log` stays the human-readable projection.
3. **HITL as first-class events:** `interrupt.requested` + `human.decision`, aligned with approval boundaries in `AGENTS.md`.
4. **Bounded automation:** repair loops and autonomous delivery stop on documented blockers; never invent pass results.
5. **Reversibility:** resume from last failed gate; change control resets scopes; checkpoints record git refs when available.
6. **Least ceremony by default:** Code-First implementation does not require run ceremony unless the user asks for delivery / multi-role orchestration.

## Sources of Truth (extended)

| Concern | Source |
| --- | --- |
| Product / architecture / contracts | Existing `docs/*` and task files |
| Task lifecycle status | `tasks/*.md` YAML front matter |
| **Multi-agent run process** | `.agent-runs/<run_id>/events.jsonl` |
| Delivery check artifacts | `/tmp/ppfiles-learn-delivery/<task-id>/` (or linked refs in events) |
| Explicit collaboration graph | `docs/agent-graph.yaml` |

## Canonical Multi-Role Order

Delivery OS sequence (source of truth: `docs/delivery-workflow.md`):

**Product → (Architect ∥ Designer) → Implementation engineers → Test → …**

Implementation nodes must not start before architecture is Done and design is Done or N/A.

## When Agents Must Touch Runtime

| User intent | Runtime obligation |
| --- | --- |
| `交付` / `deliver` / closed-loop multi-role work | Start or resume a run; emit node, gate, tool, handoff, interrupt events; respect Product → Arch∥Design → Impl order |
| Explicit status / handoff transitions | Emit `message.handoff` (CLI or library) matching the task log row |
| Approval / product tradeoff / production boundary | Emit `interrupt.requested`; wait for `human.decision` |
| Pure code change without delivery request | Optional; no requirement to open a run |

## Success Criteria for This Upgrade

- [x] Run event schema and local store exist.
- [x] `ruby scripts/deliver.rb` dual-writes run events.
- [x] Operators can `list` / `show` / `timeline` without chat history.
- [x] Graph nodes match the documented delivery pipeline.
- [x] HITL interrupt / decision types are defined and CLI-usable.
- [ ] Optional later: web Approval Queue / Graph View (follow-up).
