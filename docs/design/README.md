# Design System Notes

Durable design guidance for client targets. Task-level work lives in each task’s **Design Spec** section; this directory holds cross-task patterns.

## Sources of Truth

| Concern | Source |
| --- | --- |
| Designer role contract | `docs/design/AGENTS.md` |
| Product behavior | `docs/requirements.md` |
| Client structure rules | `docs/client-architecture.md` |
| Mini Program tokens / base styles | `frontend/miniprogram/app.wxss` |
| Web styles | `frontend/web/styles.css` |

## Current Product Visual Tokens (寻职 Mini Program)

Prefer reusing these before inventing new ones:

| Token | Value | Use |
| --- | --- | --- |
| Primary | `#0c7a63` | CTA, links, selected tab |
| Primary soft | `#e7f5f0` | chips, soft fills |
| Text | `#14201c` | titles / body |
| Secondary text | `#5c6b65` | descriptions |
| Muted | `#8a9691` | meta / timestamps |
| Danger | `#c9443b` | destructive |
| Warning pay accent | `#e85d04` | salary emphasis |
| Surface | `#ffffff` | cards |
| Page bg | `#f3f5f4` / `#f5f6f7` | canvas |
| Radius | 12–36rpx scale | cards, pills |
| Tab bar | 地图 · 列表 · 我的 | primary navigation |

## Interaction Patterns (approved)

1. **Map explore**: marker → bottom preview sheet → detail (do not skip straight to detail for discovery).
2. **Detail**: sticky bar = secondary (收藏) + **one** primary CTA + 更多 (report/block).
3. **Messages**: conversation list first; chips for 投递/面试 — not a button toolbar wall.
4. **Chat**: bubbles + bottom composer + safe-area.
5. **Me**: role switch for dual approved identities; group 协作 / 个人 / 发布.
6. **Onboarding (`role-home`)**: checklist once; daily home is Tab bar.

## Multi-Agent Runtime UI

Operator / agent-run UIs belong in builder tooling (CLI / future Web ops), **not** in C-end 寻职 tabs, unless a task explicitly scopes an operator console.
