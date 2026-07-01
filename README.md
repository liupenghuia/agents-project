# 多 Agent 协作开发框架使用说明

这个项目目录用于支持前后端项目的多 Agent 协作开发。核心思想是：每个功能都有任务单，每个 Agent 有明确职责，测试发现问题后通过 issue 交给对应 Agent 修复，再由测试 Agent 回归验证。

## 目录说明

```text
├── AGENTS.md
├── COMMANDS.md
├── docs
│   ├── AGENTS.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── openapi.yaml
│   ├── database.md
│   └── testing.md
├── tasks
│   ├── template.md
│   ├── user-management.md
│   └── login-auth.md
├── issues
│   └── template.md
├── frontend
│   └── AGENTS.md
├── backend
│   └── AGENTS.md
└── tests
    └── AGENTS.md
```

### 根目录文件

- `AGENTS.md`：全局协作规则，定义 Product、Architect、Frontend、Backend、Test Agent 的职责和闭环流程。
- `COMMANDS.md`：短命令说明，告诉你如何用一句话启动不同 Agent。
- `README.md`：当前文件，用中文说明整个框架怎么使用。

### docs

- `docs/AGENTS.md`：产品和架构 Agent 的本地规则。
- `docs/requirements.md`：产品需求文档。
- `docs/architecture.md`：系统架构和前后端边界。
- `docs/openapi.yaml`：前后端 API 契约。
- `docs/database.md`：数据库设计。
- `docs/testing.md`：测试策略和完成标准。

### tasks

`tasks/` 下面每个文件代表一个功能模块的开发任务单。

例如：

```text
tasks/user-management.md
tasks/login-auth.md
```

以后新增功能时，也按这个规则创建：

```text
tasks/order-management.md
tasks/product-management.md
tasks/file-upload.md
```

### issues

`issues/` 用来放测试发现的问题。

测试 Agent 发现 bug 后，不直接修改前后端代码，而是创建 issue，并指定 Owner：

```text
Owner = Frontend Agent
Owner = Backend Agent
Owner = Architect Agent
Owner = Product Agent
```

对应 Agent 修复后，把 issue 状态改成：

```text
Ready for Retest
```

然后测试 Agent 回归测试。通过后关闭，失败则改成：

```text
Retest Failed
```

再退回原 Owner 继续修。

### frontend

前端代码目录。

前端 Agent 工作前必须先读：

```text
frontend/AGENTS.md
AGENTS.md
```

它会先检查自己名下的未关闭 issue，再决定是否可以开发新功能。

### backend

后端代码目录。

后端 Agent 工作前必须先读：

```text
backend/AGENTS.md
AGENTS.md
```

它会先检查自己名下的未关闭 issue，再决定是否可以开发新功能。

### tests

测试 Agent 的工作入口。

测试 Agent 工作前必须先读：

```text
tests/AGENTS.md
AGENTS.md
```

测试 Agent 会优先处理 `Ready for Retest` 的 issue，然后再测试新功能。

## 短命令使用方式

你不需要每次输入很长的提示词，只需要使用：

```text
角色 功能名
```

常用角色：

```text
产品
架构
后端
前端
测试
```

功能名就是 `tasks/` 下面的任务文件名，不带 `.md`。

例如：

```text
产品 login-auth
架构 login-auth
后端 login-auth
前端 login-auth
测试 login-auth
```

对应的任务文件是：

```text
tasks/login-auth.md
```

## 开发一个新功能的标准流程

假设要开发订单管理功能，功能名叫：

```text
order-management
```

### 1. 产品阶段

输入：

```text
产品 order-management
```

Product Agent 会：

- 创建或完善 `tasks/order-management.md`
- 更新 `docs/requirements.md`
- 写清楚功能范围、用户故事、验收标准
- 把任务推进到 `Ready for Architecture`

### 2. 架构阶段

输入：

```text
架构 order-management
```

Architect Agent 会：

- 更新 `docs/architecture.md`
- 更新 `docs/openapi.yaml`
- 更新 `docs/database.md`
- 明确前后端边界
- 把任务推进到 `Ready for Implementation`

### 3. 后端开发

输入：

```text
后端 order-management
```

Backend Agent 会：

- 先检查 `issues/` 中是否有自己的阻塞问题
- 没有阻塞 issue 时，开发 `backend/`
- 实现 API、业务逻辑、数据库访问和后端测试
- 更新任务单状态和交接记录

### 4. 前端开发

输入：

```text
前端 order-management
```

Frontend Agent 会：

- 先检查 `issues/` 中是否有自己的阻塞问题
- 没有阻塞 issue 时，开发 `frontend/`
- 实现页面、组件、接口调用和前端测试
- 更新任务单状态和交接记录

### 5. 测试阶段

输入：

```text
测试 order-management
```

Test Agent 会：

- 优先回测 `Ready for Retest` 的 issue
- 没有待回测 issue 时，测试当前功能
- 测试失败时，在 `issues/` 下创建问题
- 指定问题 Owner
- 等对应 Agent 修复后再次回测

## Bug 修复闭环

完整闭环如下：

```text
Test Agent 测试失败
  ↓
创建 issues/xxx.md
  ↓
指定 Owner = Frontend Agent 或 Backend Agent
  ↓
对应 Agent 下次工作前先处理自己的 issue
  ↓
修复后改为 Ready for Retest
  ↓
Test Agent 回归测试
  ↓
通过：Closed
失败：Retest Failed，退回原 Owner
```

前端或后端 Agent 不能自己关闭 issue。只有 Test Agent 回归通过后，才能把 issue 改成 `Closed`。

## 不知道下一步该做什么时

可以使用：

```text
下一个 前端
下一个 后端
下一个 测试
```

含义：

- `下一个 前端`：前端 Agent 先找自己的高优先级 issue，没有再找前端任务。
- `下一个 后端`：后端 Agent 先找自己的高优先级 issue，没有再找后端任务。
- `下一个 测试`：测试 Agent 先找 `Ready for Retest`，没有再找 `Ready for Test` 的任务。

## 功能命名规则

建议使用英文小写加中横线：

```text
login-auth
user-management
order-management
product-management
file-upload
payment
notification
dashboard
```

规则：

```text
tasks/<功能名>.md
```

例如：

```text
tasks/login-auth.md
```

对应命令：

```text
产品 login-auth
架构 login-auth
后端 login-auth
前端 login-auth
测试 login-auth
```

## 当前推荐用法

先按这个顺序推进：

```text
产品 <功能名>
架构 <功能名>
后端 <功能名>
前端 <功能名>
测试 <功能名>
```

如果测试发现问题，再使用：

```text
下一个 前端
下一个 后端
下一个 测试
```

这套框架当前是文档驱动的多 Agent 协作模式。后续如果项目变复杂，可以再增加自动调度脚本、状态看板和 CI 校验。

