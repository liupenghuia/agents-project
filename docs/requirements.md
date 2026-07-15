# Requirements

## Product Goal

Build a maintainable full-stack application using a multi-agent development process.

## Users

- End user: uses the product features through the frontend.
- Mobile user: uses the product features through iOS or Android apps when mobile is in scope.
- Admin user: uses the Web management system to manage users, administrator accounts, permissions, and operational data.
- Development team: uses this repository structure to coordinate product, architecture, frontend, backend, and testing work.
- Recruiter: creates a hiring identity and submits recruitment information for manual review.
- Applicant: creates a job-seeking identity and submits basic job-seeking information for manual review.
- Reviewer: an administrator role that manually reviews registration profiles and approves or requests changes.

## Current Feature Scope

### User Management

The first feature module is user management.

Minimum scope:

- Create user.
- View user profile.
- Update user profile.
- Disable or delete user.

### Login Authentication

The next feature module is login authentication.

Minimum scope:

- Register a user account.
- Log in with email and password.
- Log out from the current session.
- View the current authenticated user.
- Protect authenticated-only pages and APIs.
- Show clear errors for invalid credentials and expired sessions.

### Recruitment Platform Phase 1: Role Selection And Registration

The first recruitment phase is limited to a WeChat Mini Program. It establishes the identity boundary before job posting or job seeking features are built.

Minimum scope:

- Show new users two entry choices: `招人` and `应聘`.
- Provide separate minimum registration flows for each identity.
- Follow WeChat Mini Program authorization, privacy, and user agreement requirements.
- Bind the authorized phone number to exactly one role: `招人` or `应聘`.
- Keep the role immutable after phone authorization; the same phone number cannot register or switch to the other role.
- On later launches, restore the existing WeChat session and enter the bound role workspace directly when the session is valid.
- Submit registration profiles for manual review.
- Show `待审核`, `通过`, and `拒绝/需修改` states with actionable feedback.
- Do not perform real-name verification, identity document collection, or enterprise certification in phase one.

Mini Program entry and navigation:

- After role selection, show a short registration flow and complete phone-number authorization before submitting the role profile.
- The first launch may show a minimal startup page with only the product name and one or two short status lines; it must transition automatically after session restoration.
- A returning user with a valid session must not repeat role selection, phone authorization, or registration. Expired sessions may request WeChat login again, then restore the bound role.
- An authorized phone number already bound to the other role must be rejected with a clear explanation and a recovery path; it must not create a second identity.
- Every approved role workspace has three persistent bottom tabs: `地图`, `列表`, and `我的`. Tab switching preserves role and relevant map/list filters and does not route through the role-selection home page.

### Applicant Job-Seeking Information

After an applicant identity is available, the applicant can maintain a minimum personal job-seeking information page.

Minimum scope:

- Show a personal information page for the authenticated applicant identity.
- Collect job type name, expected salary, work method, location, and preferred work scope.
- Collect applicant age as a required field.
- Treat job type name, expected salary, work method, and location as required; preferred work scope is optional and secondary.
- Save the information only after the applicant submits the form.
- Allow an applicant to view and edit their own submitted information.
- Show loading, validation, success, network failure, and retry states.

The first version does not include job search, matching, applications, chat, interviews, hiring, salary payments, or recommendation. This submission does not add a new manual-review workflow unless a later product decision explicitly requires it.

### Recruiter Information And Job Posting

After a recruiter identity is available, the recruiter can maintain a hiring location and publish a minimum recruitment information record.

Minimum scope:

- Recruiter information entry for location obtained through device geolocation and a detailed address accurate to the building.
- Recruitment information entry for job type, salary range, settlement method, location, latitude/longitude, and images.
- Allow no more than six images per recruitment information record.
- Preserve latitude and longitude with the submitted location for later location-based features.
- Support loading, location permission denied, invalid input, upload progress, success, failure, retry, and duplicate-submit prevention.

The first version does not define job matching, applicant applications, chat, interviews, hiring, or a new manual-review workflow for recruitment information. Exact salary format, settlement options, location provider, address privacy display, image type/size, and whether publishing requires review are Architect/Product follow-ups.

### First-Version Two-Sided Information Market

The first market version lets authenticated users browse the other side's published information in the WeChat Mini Program.

Minimum scope:

- Applicants can browse recruiter-published recruitment information.
- Recruiters can browse applicant-published job-seeking information.
- Both directions provide list cards, filters, cursor pagination, detail pages, and empty/loading/error/retry states.
- Filters open in a dedicated, readable filter sheet/page with explicit selected values, reset, cancel, and apply actions; applying filters resets pagination and updates both map and list consistently.
- List cards use a consistent compact hierarchy: title, key salary/work method, area summary, publication time, and status where applicable; contact details, precise addresses, internal IDs, and long unbounded text are excluded.
- Every published card and detail includes `publishedAt`; lists default to newest first.
- Contact information is required on detail responses and detail pages, but is not shown in list cards.
- Contact details are available only to authenticated users with the corresponding approved identity; contact views are logged and rate-limited.
- Applicants can favorite and unfavorite recruitment information and view a dedicated “我的收藏” module.
- Recruiters can favorite and unfavorite job-seeking information and view a dedicated “我的收藏” module.
- Owners can disable their own published information; disabled information leaves public lists and cannot expose contact details.
- Users can report inappropriate recruitment or job-seeking information; administrators can disable reported content through protected backend operations.
- Reporting requires a selectable or text reason, prevents duplicate submission while pending, confirms successful submission, and exposes retry/error states without losing the entered reason.
- Favorite actions provide immediate pending/success/failure feedback, prevent duplicate taps, confirm destructive unfavorite actions where needed, and keep list, detail, and `我的收藏` state synchronized.
- The favorites module supports loading, empty, unavailable/removed item, retry, and return-to-detail states; unavailable items cannot expose contact details.
- Precise building addresses remain private in the first version; public details show only an allowed location summary.

First-version non-goals:

- Automatic matching, recommendation, ranking algorithms, chat, applications, interviews, hiring, push notifications, favorite notes, and multi-device mobile clients.

Second-version candidates, not part of the current delivery:

- Intelligent matching and recommendations.
- Contact exchange workflow, chat, and application status.
- Notifications, saved filters, favorite notes, and personalized ranking.
- Public map browsing and precise location rules.

### Web Management System

The Web client is an administrator management system, not a general end-user client in phase one.

Minimum scope:

- Administrator account login with assigned username/password.
- Administrator account creation, disabling, password reset/change, and role assignment.
- RBAC roles: `owner`, `admin`, `reviewer`, and `operator`.
- One initial `owner` account with maximum permission, created through secure bootstrap and without a committed default password.
- User management and identity review in the same protected system.
- Audit history for administrator login, permission changes, account changes, user changes, and review decisions.

Permission rules:

| Role | Permissions |
| --- | --- |
| `owner` | All administrator, permission, user, and identity review operations |
| `admin` | Manage users and administrator accounts; cannot change owner protection rules |
| `reviewer` | View identity review queues and approve/request changes |
| `operator` | View explicitly allowed operational data; no permission assignment or review decisions |

The last active `owner` cannot be disabled, deleted, or demoted. Administrator sessions are separate from WeChat Mini Program sessions.

Out of scope:

- Public job search, resumes, matching, applications, chat, interviews, hiring, payments, and recommendations.
- iOS App and Android App delivery in phase one.

### Map Location Tags And Workspaces

第一版在现有双向信息市场上增加微信小程序地图、卡片列表和“我的”三个 Tab。

- 求职者在地图上查看招聘信息；招聘者在地图上查看求职信息。
- 地图标记支持点击详情、缩放和按区域聚合；聚合标记显示区域内信息数量。
- 地图和卡片列表使用同一套发布时间、发布状态、打回状态和筛选条件。
- 详情支持电话联系、收藏、举报和仅对当前用户生效的拉黑。
- “我的”包含个人资料、身份状态、我的发布、收藏、拉黑、隐私协议和基础设置。
- 管理员可以查看、打回、下架和处理信息；打回原因和状态在发布者地图/卡片中明显展示，并进入筛选条件。

地图隐私规则：普通用户只接收区域级坐标或聚合中心点，不接收原始经纬度；招聘者的楼栋级详细地址不公开。地图、列表和详情接口必须继续遵守已审核身份和联系方式访问规则。

第一版不包含路线规划、实时位置、自动匹配、推荐算法、聊天、投递、通知、iOS、Android 或普通用户 Web 端。

### 第一阶段核心闭环完善

第一阶段优先完善现有产品闭环：身份自动承接、地图/列表/我的工作区、资料和发布管理、市场筛选与详情、收藏举报拉黑，以及微信 DevTools/真机和生产上线验收。聊天、推荐、投递、通知、支付和商业化不纳入本阶段。

## Non-Functional Requirements

### Security

- Validate all backend inputs.
- Avoid exposing sensitive user data in frontend responses.
- Document authentication and authorization decisions before implementation.
- Passwords must never be stored or returned in plain text.
- Authentication state must be represented by a server-verifiable session or token.
- Protected APIs must reject unauthenticated requests.

### Reliability

- API errors must return predictable error responses.
- Frontend must show useful failure states.
- Expired or invalid sessions must fail safely and redirect users to login where appropriate.

### Maintainability

- API behavior must match `docs/openapi.yaml`.
- Database changes must be reflected in `docs/database.md`.
- Every feature must have a task file in `tasks/`.
- Every new feature task must reference its approved source Idea, or document why product discovery is not required.
- Mobile features must also define iOS and Android task coverage when mobile delivery is in scope.

### Testability

- Every task must include acceptance criteria.
- Test Agent must be able to verify the task without reading private implementation notes.

## Acceptance Criteria

- A feature is not complete until it passes the quality gates in `docs/delivery-workflow.md`.
- Any failed verification must create an issue under `issues/`.
- Issues must be fixed by the owning agent and retested by the Test Agent.
- Login authentication is not complete until registration, login, logout, current-user lookup, protected route behavior, and invalid-session behavior are all testable.
- Mobile-authored flows are not complete until iOS and Android behavior is testable where mobile delivery is in scope.

### Prioritized Extension Roadmap

After the first core-closure phase, the next product priority is search and quality: richer filters, explainable rule-based matching, drafts, preview, media/text validation and publication expiry. These items must complete before communication or application flows.

The following priority adds in-product communication, job-seeking interest/application, recruiter candidate handling and interview states. It remains product-design pending until search and quality work has passed its test gate. AI recommendations, payments, enterprise verification and commercialization remain out of scope for both priorities.

The complete priority definitions are recorded in:

- `tasks/phase-one-product-completion.md`: identity restoration, workspaces, profile/publication management, market usability and safety. Status: Done.
- `tasks/phase-two-discovery-and-quality.md`: advanced search/filter, explainable matching, drafts, preview, validation and expiry. Status: Done.
- `tasks/phase-three-communication-and-recruitment.md`: messaging, applications, invitations and interviews. Status: Done.

Any future priority decision must update the relevant task file, acceptance criteria, state/error requirements and handoff log in the same change; conversational planning alone is not considered recorded product scope.
