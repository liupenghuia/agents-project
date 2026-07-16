# 多 Agent 闭环交付框架

本项目用 Idea Brief、任务、角色、质量门禁和缺陷复测记录组织多 Agent 协作。目标不是让多个 Agent 各自输出代码，而是让一个原始想法经过产品判断、工程交付和独立验证后进入可信的 `Done`，且每次状态变化都有证据和下一步。

## 通用交付套件（agent-delivery-kit）

与业务无关的流程 / 角色 / 脚手架 / 校验 / 交付 runner 已抽到：

**[`agent-delivery-kit/`](./agent-delivery-kit/)**

- 完整使用说明：[`agent-delivery-kit/docs/USAGE.md`](./agent-delivery-kit/docs/USAGE.md)
- 设计蓝图：[`docs/agent-delivery-kit-design.md`](./docs/agent-delivery-kit-design.md)
- 新产品：`ruby agent-delivery-kit/scripts/init_product.rb --path ... --name ... --preset api-web`

本 monorepo 的寻职业务仍使用根目录 `scripts/` 与 `docs/` 中的产品真相；kit 用于复用与新开产品仓。

## 快速开始

### 自动交付闭环

对已有任务运行本地交付编排器：

```bash
ruby scripts/deliver.rb recruitment-role-registration
```

它会执行工作流校验、后端测试与健康检查、小程序语法/逻辑测试、Web 静态检查与健康检查，并把每轮命令、结果和日志写入 `/tmp/ppfiles-learn-delivery/`。默认最多执行 3 轮。

需要接入修复 Agent 时，设置 `DELIVERY_REPAIR_COMMAND`。命令会收到 `DELIVERY_TASK`、`DELIVERY_ROUND` 和 `DELIVERY_RUN_DIR` 环境变量；修复完成后编排器自动重新测试：

```bash
DELIVERY_REPAIR_COMMAND='your-agent-command' ruby scripts/deliver.rb recruitment-role-registration
```

修复命令未配置或连续失败时，流程会停止并保留失败证据，不会假定任务通过。微信 DevTools 授权、真实小程序渲染和生产部署仍属于平台/人工门禁。

只有一句想法时，使用：

```text
想法 <想法名称>
<用一句或几句话描述你的想法>
```

例如：

```text
想法 smart-expense-assistant
做一个帮助个人自动整理消费记录并发现异常支出的应用。
```

Product Agent 会创建 `ideas/smart-expense-assistant.md`，补全用户、问题、价值、MVP、指标和风险，并把没有证据的内容标记为假设或未知。产品评审批准后，再运行：

```text
产品 smart-expense-assistant
```

它会更新 `docs/requirements.md`、创建带 `source_idea` 的任务，并推进到架构入口。

已有产品文档和任务时，直接使用：

```text
交付 <功能名>
```

例如：

```text
交付 login-auth
```

Orchestrator 会按以下闭环持续推进：

```text
原始想法
  -> Product Brief 与产品决策
  -> 产品需求和任务
  -> 架构/API/数据库契约
  -> required_scopes 中需要的开发范围
  -> 独立测试
  -> 缺陷修复与复测
  -> 发布门禁（如需要）
  -> Done
```

如果任务不存在但存在同名 `Approved` Idea，`交付 <功能名>` 可以先将它晋升为任务；Idea 尚未批准时会停在产品决策边界，不会擅自进入开发。

## 从一个 Idea 到产品文档

### 第一步：命名并提交原始想法

名称使用英文小写和中横线。最少只需提供一句话：

```text
想法 team-meeting-memory
让小团队能自动沉淀会议决定和待办，避免会后遗漏。
```

信息较多时，推荐使用下面的输入模板：

```text
想法 team-meeting-memory

原始想法：
让小团队能自动沉淀会议决定和待办，避免会后遗漏。

我认为的目标用户：10-50 人的软件团队
已观察到的问题：会后经常找不到最终决定，待办没有负责人
现有替代方式：人工会议纪要、聊天记录、项目管理工具
期望结果：会议结束后 2 分钟内得到可确认的决定和待办
已知约束：第一版不接入电话会议，只处理上传的录音或文字
已有证据：来自 3 次团队复盘；没有正式用户调研
决策人：我
决策权限：重要 MVP 取舍需要我确认
```

只写一句话也可以。Agent 会继续产出，但必须把推断标记为 `Assumption` 或 `Unknown`，不能虚构用户访谈、市场规模、竞品结论或技术可行性证据。

### 第二步：Product Agent 完成发现

Product Agent 根据 `ideas/template.md` 生成 Product Brief，并依次补齐：

- 原始想法和一句话价值主张。
- 目标用户、触发场景、核心问题、现有替代方式和问题成本。
- 用户任务、用户结果和业务结果。
- 事实、假设、未知、置信度和验证动作。
- 核心用户旅程，包括首次使用、成功、失败、取消和返回流程。
- MVP 必做项、明确不做项和后续机会。
- 主结果指标、领先指标和护栏指标。
- 产品、隐私、安全、可行性、成本、无障碍和运营风险。
- 初步交付范围假设，但不代替 Architect 的技术决策。

信息不足时，Agent 只询问会实质改变用户、问题、MVP、重大风险或交付范围的问题。其余未知项使用可逆假设继续推进，并给出验证计划。

### 第三步：评审 Product Brief

Brief 完整后状态为 `Ready for Review`。重点检查：

- 解决的是具体用户问题，而不是只有功能设想。
- 事实和假设已分开。
- MVP 足够小且形成完整用户价值。
- 成功指标可以验证。
- 高风险假设有验证动作。
- 不做什么已经明确。

批准时输入：

```text
产品 team-meeting-memory
评审结论：批准当前 MVP。
调整：第一版只接受文字会议记录，不处理音频。
请记录产品决策，更新需求，并创建可交付任务。
```

需要补充时输入：

```text
产品 team-meeting-memory
评审结论：继续发现。
需要先确认：用户是否愿意在会后人工确认待办负责人。
```

也可以选择 `Parked` 或 `Rejected`，并记录重新评估条件或拒绝原因。默认 `decision_owner: User`，没有明确授权时 Product Agent 不能自行批准。

### 第四步：晋升为需求和任务

批准后 Product Agent 会：

1. 将稳定的产品级结论写入 `docs/requirements.md`。
2. 从 `tasks/template.md` 创建一个或多个任务。
3. 将任务 `source_idea` 设置为 Idea ID。
4. 将任务 ID 写回 Idea 的 `promoted_tasks`。
5. 将产品描述转成可观察的验收标准。
6. 校验通过后把 Idea 标记为 `Promoted`。

Idea 晋升不等于授权开发。任务仍需通过产品门禁和架构门禁，才能进入 `Ready for Implementation`。

### 委托 Product Agent 自主决策

不希望停在产品评审时，可以在输入中明确委托范围：

```text
想法 team-meeting-memory
让小团队自动沉淀会议决定和待办。

决策权限：授权 Product Agent 决定第一版 MVP 和非目标；涉及付费、隐私合规、外部数据共享或生产发布时仍需我批准。
成功标准：4 周内让试用团队 80% 的会议待办具有负责人和截止时间。
```

Agent 必须把这项授权写入 Decision Log。授权只适用于记录的产品取舍，不会自动扩大生产、密钥、费用、法律或破坏性操作权限。

## 三种交付方式

### 1. 自动闭环

```text
交付 user-management
```

适合需求和权限边界已经明确的功能。Agent 会自动完成可逆的仓库修改、本地构建和测试，不需要每个阶段逐次确认。

### 2. 分角色推进

```text
产品 user-management
架构 user-management
后端 user-management
前端 user-management
移动端 user-management
iOS user-management
安卓 user-management
测试 user-management
```

只执行任务 `required_scopes` 中标记为 `true` 的开发范围。标记为 `false` 的范围应保持 `N/A`，无需为了走流程而执行。

### 3. 自动领取下一项

```text
下一个 前端
下一个 小程序
下一个 Web
下一个 后端
下一个 移动端
下一个 iOS
下一个 安卓
下一个 测试
```

选择顺序为：同优先级下先处理 `Ready for Retest`，再处理角色拥有的 issue，最后处理可进入的任务；优先级按 `P0` 到 `P3`，同级按创建时间从早到晚。

英文命令也可使用，例如 `deliver user-management`、`product login-auth`、`miniprogram login-auth`、`web login-auth`、`next frontend`。

## 权限与暂停边界

自动闭环可以在仓库内持续编辑文件、运行本地命令和修复测试问题。即使 Agent 拥有较高系统权限，以下操作仍必须获得明确授权：

- 生产环境部署。
- 破坏性数据变更或不可逆迁移。
- 读取或修改密钥、凭据。
- 产生费用的外部操作。
- 法律、合规或隐私决策。
- 产品文档无法确定的业务取舍。

遇到工具缺失、依赖不可用或外部决策未完成时，不能假定通过。Agent 必须将任务设为 `Blocked`，记录原因、开始时间、解除负责人和解除条件。

## 核心文件

```text
.
├── AGENTS.md                    # 全局 Agent 入口和权限边界
├── CLAUDE.md -> AGENTS.md       # 复用同一套 Agent 规则
├── COMMANDS.md                  # 短命令速查
├── README.md                    # 本使用说明
├── ideas
│   ├── template.md              # Idea/Product Brief 模板
│   └── <idea>.md                # 产品发现、证据与决策
├── docs
│   ├── AGENTS.md                # Product/Architect 角色规则
│   ├── delivery-workflow.md     # 状态机、门禁、阻塞和恢复
│   ├── product-discovery.md     # 从 Idea 到任务的方法
│   ├── requirements.md          # 产品行为
│   ├── architecture.md          # 系统边界
│   ├── openapi.yaml             # HTTP 契约
│   ├── database.md              # 数据模型
│   └── testing.md               # 测试策略
├── tasks
│   ├── template.md              # 任务模板
│   └── <feature>.md             # 功能任务与交接证据
├── issues
│   ├── template.md              # 缺陷模板
│   └── <issue>.md               # 缺陷与复测证据
├── scripts
│   └── validate_workflow.rb     # 工作流静态校验
├── frontend
│   ├── AGENTS.md              # 前端协调规则
│   ├── miniprogram/AGENTS.md  # 微信小程序规则
│   ├── web/AGENTS.md          # Web/审核端规则
│   └── HISTORY.md             # 跨任务前端历史索引
├── backend/AGENTS.md
├── mobile/AGENTS.md
├── mobile/ios/AGENTS.md
├── mobile/android/AGENTS.md
└── tests/AGENTS.md
```

## 信息来源

| 内容 | 唯一来源 |
| --- | --- |
| 原始想法、证据、假设和 MVP 决策 | `ideas/*.md` 与 `docs/product-discovery.md` |
| 产品行为 | `docs/requirements.md` 与任务验收标准 |
| 系统边界 | `docs/architecture.md` |
| HTTP 接口 | `docs/openapi.yaml` |
| 数据模型 | `docs/database.md` |
| 任务和缺陷状态 | `tasks/*.md`、`issues/*.md` 顶部 YAML |
| 状态流转和质量门禁 | `docs/delivery-workflow.md` |
| 测试策略 | `docs/testing.md` |

如果实现与文档冲突，应先按所有权修正文档或实现，不能在任务交接记录中另造一套约定。

## 任务模型

每个任务位于 `tasks/<功能名>.md`。文件名使用英文小写和中横线，例如：

```text
tasks/login-auth.md
tasks/user-management.md
tasks/order-management.md
```

任务顶部 YAML 是机器可读状态，正文用于记录目标、范围、验收标准、架构影响、实施清单、测试计划、验证证据、发布计划和交接历史。

关键字段：

| 字段 | 用途 |
| --- | --- |
| `id` | 唯一任务编号，如 `TASK-20260713-001` |
| `status` | 整体生命周期状态 |
| `priority` | `P0`、`P1`、`P2`、`P3` |
| `owner` | 当前负责角色 |
| `source_idea` | 来源 Idea ID；豁免时为 `null` 并在正文说明原因 |
| `depends_on` | 必须先完成的任务 ID |
| `linked_issues` | 关联 issue ID |
| `required_scopes` | 哪些开发范围必须交付 |
| `scope_status` | 各角色聚合进度 |
| `frontend_targets` | 必需的前端目标端：`miniprogram`、`web` |
| `frontend_target_status` | 小程序和 Web 的独立进度 |
| `release_required` | 是否需要发布门禁 |
| `blocked_*` | 阻塞原因、时间、负责人和解除条件 |

一个任务只有一个整体 `status`，但可以同时拥有多个 `scope_status` 和前端目标状态。例如小程序可以完成而 Web 审核端仍在进行，互不覆盖状态；所有必需范围和目标端完成后，整体任务才能进入 `Ready for Test`。

## 状态说明

Idea 状态：

```text
Captured
Discovering
Ready for Review
Approved
Parked
Rejected
Promoted
```

任务状态：

```text
Draft
Ready for Architecture
Ready for Implementation
In Progress
Blocked
Ready for Test
Test Failed
Ready for Retest
Ready for Release
Released
Done
Cancelled
```

范围状态：

```text
N/A
Pending
In Progress
Blocked
Done
```

Issue 状态：

```text
Open
Assigned
Fixing
Ready for Retest
Retest Failed
Closed
```

完整转换条件见 `docs/delivery-workflow.md`。不要手工跳过中间门禁，也不要用后端或前端状态替代整体任务状态。

## 角色职责

| 角色 | 主要职责 | 主要目录/文档 |
| --- | --- | --- |
| Product Agent | Idea 发现、证据与假设、产品决策、范围和验收标准 | `ideas/`、`docs/product-discovery.md`、`docs/requirements.md`、`tasks/` |
| Architect Agent | 架构、API、数据库、兼容与回滚 | `docs/architecture.md`、`docs/openapi.yaml`、`docs/database.md` |
| Backend Agent | API、业务规则、数据与后端测试 | `backend/` |
| Frontend Agent | 跨目标协调、共享 API/UI 约束和聚合状态 | `frontend/AGENTS.md`、`frontend/HISTORY.md` |
| Frontend MiniProgram Agent | 微信小程序 UI、生命周期、授权、注册和小程序测试 | `frontend/miniprogram/` |
| Frontend Web Agent | Web UI、响应式、审核操作、权限和 Web 测试 | `frontend/web/` |
| Mobile Agent | 跨平台移动端状态、网络、导航与共享逻辑 | `mobile/` |
| iOS Agent | iOS UI、生命周期、权限、存储与测试 | `mobile/ios/` |
| Android Agent | Android UI、生命周期、权限、存储与测试 | `mobile/android/` |
| Test Agent | 独立验证、创建 issue、复测和关闭 issue | `tests/`、`docs/testing.md`、`issues/` |
| Orchestrator Agent | 选择阶段、协调角色、推进整体状态 | 任务和交接记录 |

每个角色开始工作前必须读取最近的角色 `AGENTS.md`、根 `AGENTS.md`、`docs/delivery-workflow.md`、目标 Idea/任务和关联 issue。前端目标 Agent 还必须更新任务交接记录和 `frontend/HISTORY.md`。

## 前端目标端规则

```text
前端 <task>       # 协调小程序和 Web，维护 aggregate frontend 状态
小程序 <task>     # 只实现 frontend_targets.miniprogram
Web <task>        # 只实现 frontend_targets.web
```

目标端规则分别位于：

- `frontend/miniprogram/AGENTS.md`：WXML/WXSS、微信生命周期、授权/隐私、`setData`、小程序状态和小屏可用性。
- `frontend/web/AGENTS.md`：语义 HTML、响应式、键盘/无障碍、会话安全、路由和审核操作。

每次前端交接必须记录：目标端、变更文件、精确命令和结果、关联 issue、下一步。详细历史写入 `frontend/HISTORY.md`，任务文件中的 handoff log 仍是当前任务的权威记录。

## 质量门禁

### Product Brief 就绪门禁

- 原始想法和决策人已记录。
- 目标用户、场景、问题、替代方式和期望结果具体。
- 事实、假设、未知、置信度和验证动作已分开。
- MVP、非目标、旅程、指标、重大风险和交付假设已记录。
- 阻塞产品决策已解决或明确提交给决策人。

### 产品门禁

- 来源 Idea 已是 `Approved`/`Promoted`，或任务明确记录无需发现流程的原因。
- 目标、用户、优先级、范围、假设和依赖明确。
- 验收标准可观察，覆盖适用的错误、空状态、权限和非功能要求。
- 必需开发范围已经设置，非适用范围为 `N/A`。

### 架构门禁

- 架构、API、数据库、安全、迁移、兼容性和回滚影响已记录，或明确说明 `None` 及原因。
- 所有权、错误行为和外部依赖已经确定。
- 破坏性契约变更有版本和消费者迁移方案。

### 实施门禁

- 所有必需范围为 `Done`。
- 代码、测试、文档和契约一致。
- 变更文件、精确验证命令及结果已经写入任务。

### 测试门禁

- 每条验收标准都有通过或失败证据。
- 适用的单元、集成、契约、UI 和端到端测试通过。
- 所有关联 issue 都已由 Test Agent 复测并关闭。

### 发布门禁

- `release_required: false` 时，测试通过后可直接进入 `Done`。
- 需要发布时，必须记录环境、版本/产物、部署、冒烟测试、监控和回滚准备。
- 生产发布仍受前述审批边界约束。

## Bug 修复闭环

```text
Test Agent 发现失败
  -> 从 issues/template.md 创建 issue
  -> 设置 P0-P3、Owner 和关联任务 ID
  -> 任务 linked_issues 加入 issue ID
  -> Owner 修复并记录根因、文件和验证结果
  -> Owner 设置 Ready for Retest
  -> Test Agent 重跑原复现步骤和相关自动化测试
     -> 通过：Closed
     -> 失败：Retest Failed，退回原 Owner
```

实现角色不能关闭自己修复的 issue。只有 Test Agent 独立复测通过后才能设置 `Closed`。同优先级下，待复测 issue 优先于新功能。

## 优先级

| 等级 | 含义 |
| --- | --- |
| `P0` | 生产事故、安全问题或数据丢失风险 |
| `P1` | 核心用户流程完全阻断 |
| `P2` | 非核心行为降级或存在可接受绕行方式 |
| `P3` | 轻微影响 |

角色拥有 `P0` 或 `P1` issue 时，不应开始新的功能工作。

## 阻塞、恢复与变更控制

- 临时命令失败可在记录后重试两次；仍失败且没有安全替代方案时设为 `Blocked`。
- 恢复任务时重新执行 preflight 和最后失败的门禁，不重复已经完成的阶段。
- 验收标准改变后，任务返回 `Ready for Architecture`。
- 实施开始后改变 API 或数据库契约，需要 Architect 重新评估，并将受影响范围重置为 `Pending`。
- 并行 Agent 只更新自己的 `scope_status`，修改共享任务文件前应重新读取，避免覆盖其他交接记录。
- 每次状态转换都要记录日期、操作者、原状态、新状态、证据和下一步。

## 校验工作流

每次状态交接前以及标记 `Done` 前运行：

```bash
ruby scripts/validate_workflow.rb
```

校验器会检查：

- Idea、任务和 issue 是否包含合法 YAML 元数据。
- ID、Owner、优先级和状态是否合法且不重复。
- Idea 的决策人、状态和晋升任务是否有效。
- Idea 与任务的 `source_idea`/`promoted_tasks` 是否双向关联。
- `required_scopes` 与 `scope_status` 是否一致。
- `frontend_targets` 与 `frontend_target_status` 是否一致，必需目标端是否完成。
- 进入测试或完成状态时，必需范围是否已经完成。
- 任务依赖和 issue 双向关联是否有效。
- `Done` 任务是否仍有未关闭 issue。
- `Blocked` 任务是否记录完整解除条件。

当前仓库的期望输出：

```text
Workflow validation passed (0 ideas, 2 tasks, 0 issues).
```

如果项目子模块定义了自己的构建、lint、类型检查或测试命令，还必须执行对应模块命令；根目录目前没有统一应用包管理器。

## Done 的最低条件

任务只有同时满足以下条件才能标记为 `Done`：

- 产品、架构、实施、测试和适用的发布门禁均通过。
- 必需范围为 `Done`，排除范围为 `N/A`。
- 依赖任务已经 `Done`。
- 所有关联 issue 已 `Closed`。
- 工作流校验通过。
- 已知限制和后续工作已记录，没有被隐藏成“测试通过”。

具体规则以 `AGENTS.md` 和 `docs/delivery-workflow.md` 为准，本 README 用于日常操作和团队沉淀。
