# Commands

Use these short commands when asking an agent to work in this repository.

## Product

```text
产品 user-management
```

Expands to: read product/architecture rules, update requirements and task acceptance criteria.

## Architect

```text
架构 user-management
```

Expands to: read architecture rules, update `docs/architecture.md`, `docs/openapi.yaml`, `docs/database.md`, and confirm task readiness.

## Backend

```text
后端 user-management
```

Expands to: read backend rules, check backend issues first, then implement backend work for the task.

## Frontend

```text
前端 user-management
```

Expands to: read frontend rules, check frontend issues first, then implement frontend work for the task.

## Test

```text
测试 user-management
```

Expands to: read test rules, retest `Ready for Retest` issues first, then test the task.

## Next Work

```text
下一个 前端
下一个 后端
下一个 测试
```

Expands to: pick the highest-priority pending issue first; if none exists, pick the next eligible task.

