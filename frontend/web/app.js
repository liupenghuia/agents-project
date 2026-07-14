const API_BASE = (window.REVIEW_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const permissions = window.AdminPermissions;
const moderation = window.MarketModeration;
const statusLabels = { pending_review: '待审核', changes_requested: '待补充', approved: '已通过' };
const roleLabels = { recruiter: '招人方', applicant: '应聘方' };
const adminRoleLabels = { owner: '所有者', admin: '管理员', reviewer: '审核员', operator: '运营员' };
const reportStatusLabels = { open: '待处理', resolved: '已下架', rejected: '已驳回' };
const auditActionLabels = {
  'admin.login.succeeded': '管理员登录', 'admin.account.created': '创建管理员', 'admin.account.updated': '修改管理员',
  'user.created': '创建用户', 'user.updated': '修改用户', 'user.disabled': '停用用户',
  'identity.review.decided': '身份审核', 'market.report.decided': '处理举报',
  'market.content.moderated': '内容审核',
};
const moduleTitles = { review: '人工审核', users: '用户管理', moderation: '内容运营', reports: '举报处理', admins: '管理员账号' };
const fieldLabels = {
  organizationName: '招聘主体名称', organizationType: '主体类型', contactName: '联系人称呼', contactPhone: '联系手机号',
  region: '所在地区', industryOrJobDirection: '行业或岗位方向', displayName: '展示昵称', desiredJob: '期望岗位',
  experienceSummary: '工作经验概况', preferredRegionOrTime: '地区或时间偏好',
};
const organizationLabels = { company: '企业', individual: '个体', other: '个人/其他' };

const state = {
  token: '', admin: null, status: 'pending_review', queue: [], selected: null,
  queueLoading: false, decisionLoading: false, usersLoading: false, reportsLoading: false, adminsLoading: false,
  marketContentLoading: false, moderationDecisionLoading: false,
  users: [], reports: [], admins: [], auditLogs: [], marketContent: [], pendingModeration: null,
};
const $ = (selector) => document.querySelector(selector);
const element = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function setHidden(selector, hidden) { $(selector).hidden = hidden; }
function showError(selector, message) { const node = $(selector); node.textContent = message; node.hidden = !message; }
function clearGlobalError() { showError('#globalError', ''); }
function apiError(payload, status) { return new Error(payload?.error?.message || (status === 401 ? '登录已失效，请重新登录' : '请求失败，请稍后重试')); }

async function request(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) logout(false);
    throw apiError(payload, response.status);
  }
  return payload.data;
}

function logout(redirect = true) {
  const token = state.token;
  state.token = '';
  state.admin = null;
  state.queue = [];
  state.selected = null;
  state.marketContent = [];
  state.pendingModeration = null;
  if (token) fetch(`${API_BASE}/admin/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  setHidden('#loginView', false);
  setHidden('#dashboardView', true);
  clearGlobalError();
  if (redirect) $('#loginForm').elements.loginName.focus();
}

function configureNavigation() {
  const allowed = permissions.allowedModules(state.admin.role);
  document.querySelectorAll('.module-tab').forEach((button) => { button.hidden = !allowed.includes(button.dataset.module); });
  $('#userForm').hidden = !permissions.canManageUsers(state.admin.role);
  $('#adminForm').hidden = !permissions.canManageAdmins(state.admin.role);
  const roleSelect = $('#adminForm').elements.role;
  roleSelect.replaceChildren();
  const creatableRoles = state.admin.role === 'owner' ? ['reviewer', 'operator', 'admin', 'owner'] : ['reviewer', 'operator', 'admin'];
  creatableRoles.forEach((role) => {
    const option = element('option', '', adminRoleLabels[role]);
    option.value = role;
    roleSelect.append(option);
  });
}

async function activateModule(moduleName) {
  const selected = permissions.canAccess(state.admin.role, moduleName) ? moduleName : permissions.defaultModule(state.admin.role);
  if (!selected) { showError('#globalError', '当前管理员角色没有可用模块'); return; }
  document.querySelectorAll('.module-panel').forEach((panel) => { panel.hidden = panel.id !== `${selected}Panel`; });
  document.querySelectorAll('.module-tab').forEach((button) => {
    const active = button.dataset.module === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  $('#dashboardTitle').textContent = moduleTitles[selected];
  clearGlobalError();
  if (selected === 'review') await loadQueue();
  if (selected === 'users') await loadUsers();
  if (selected === 'moderation') await loadMarketContent();
  if (selected === 'reports') await loadReports();
  if (selected === 'admins') await loadAdmins();
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  showError('#loginError', '');
  const form = new FormData(event.currentTarget);
  try {
    const session = await request('/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: form.get('loginName'), password: form.get('password') }) });
    state.token = session.token;
    state.admin = session.admin;
    setHidden('#loginView', true);
    setHidden('#dashboardView', false);
    $('#adminIdentity').textContent = `${session.admin.loginName} · ${adminRoleLabels[session.admin.role] || session.admin.role}`;
    configureNavigation();
    await activateModule(permissions.defaultModule(session.admin.role));
  } catch (error) {
    showError('#loginError', error.message);
  } finally {
    button.disabled = false;
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '时间未知';
}
function formatValue(key, value) { return key === 'organizationType' ? organizationLabels[value] || value : value || '未填写'; }

function renderQueue() {
  const list = $('#queueList');
  list.replaceChildren();
  if (!state.queue.length) { $('#queueState').textContent = '当前队列为空'; return; }
  $('#queueState').textContent = `${state.queue.length} 份资料`;
  state.queue.forEach((identity) => {
    const item = element('button', `queue-item${state.selected?.id === identity.id ? ' selected' : ''}`);
    item.type = 'button';
    const heading = element('span', 'queue-item-title');
    heading.append(element('span', '', roleLabels[identity.role] || identity.role), element('span', '', statusLabels[identity.reviewStatus] || identity.reviewStatus));
    item.append(heading, element('span', 'queue-item-meta', `提交于 ${formatDate(identity.createdAt)}`));
    item.addEventListener('click', () => { state.selected = identity; renderQueue(); renderDetail(); });
    list.append(item);
  });
}

function renderDetail() {
  const identity = state.selected;
  setHidden('#detailEmpty', Boolean(identity));
  setHidden('#detailContent', !identity);
  if (!identity) return;
  $('#detailRole').textContent = roleLabels[identity.role] || identity.role;
  const profile = identity.profile || {};
  $('#detailTitle').textContent = identity.role === 'recruiter' ? profile.organizationName : profile.displayName;
  const status = $('#detailStatus');
  status.textContent = statusLabels[identity.reviewStatus] || identity.reviewStatus;
  status.className = `status status-${identity.reviewStatus}`;
  const notice = $('#detailNotice');
  notice.hidden = !identity.reviewReason;
  notice.textContent = identity.reviewReason ? `上次审核意见：${identity.reviewReason}` : '';
  const fields = $('#profileFields');
  fields.replaceChildren();
  Object.entries(profile).filter(([key]) => key !== 'roleProfileId').forEach(([key, value]) => {
    const wrapper = element('div');
    wrapper.append(element('dt', '', fieldLabels[key] || key), element('dd', '', formatValue(key, value)));
    fields.append(wrapper);
  });
  const actionable = identity.reviewStatus === 'pending_review' || identity.reviewStatus === 'changes_requested';
  setHidden('#reviewActions', !actionable);
  setHidden('#decisionForm', true);
}

async function loadQueue() {
  if (state.queueLoading) return;
  state.queueLoading = true;
  $('#queueState').textContent = '正在读取队列...';
  clearGlobalError();
  try {
    state.queue = await request(`/admin/identity-reviews?status=${encodeURIComponent(state.status)}`) || [];
    state.selected = state.queue[0] || null;
    renderQueue();
    renderDetail();
  } catch (error) {
    state.queue = [];
    state.selected = null;
    renderQueue();
    renderDetail();
    showError('#globalError', error.message);
  } finally {
    state.queueLoading = false;
  }
}

async function decide(decision, reason = '') {
  if (!state.selected || state.decisionLoading) return;
  state.decisionLoading = true;
  $('#approveButton').disabled = true;
  $('#submitDecision').disabled = true;
  clearGlobalError();
  try {
    await request(`/admin/identity-reviews/${encodeURIComponent(state.selected.id)}/decision`, { method: 'POST', body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }) });
    $('#reason').value = '';
    state.decisionLoading = false;
    await loadQueue();
  } catch (error) {
    showError('#globalError', error.message);
  } finally {
    state.decisionLoading = false;
    $('#approveButton').disabled = false;
    $('#submitDecision').disabled = false;
  }
}

function editableInput(label, value, type = 'text') {
  const input = element('input', 'row-input');
  input.type = type;
  input.value = value || '';
  input.setAttribute('aria-label', label);
  return input;
}

function actionButton(label, action, className = 'button quiet') {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

async function updateUser(user, values, button) {
  button.disabled = true;
  clearGlobalError();
  try {
    await request(`/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify(values) });
    await loadUsers(true);
  } catch (error) {
    showError('#globalError', error.message);
  } finally {
    button.disabled = false;
  }
}

function renderUsers() {
  const list = $('#usersList');
  list.replaceChildren();
  $('#usersState').textContent = state.users.length ? `${state.users.length} 个用户` : '暂无用户';
  const writable = permissions.canManageUsers(state.admin.role);
  state.users.forEach((user) => {
    const row = element('div', 'admin-row editable-row');
    const fields = element('div', 'row-fields');
    const name = editableInput('用户姓名', user.name);
    const email = editableInput('用户邮箱', user.email, 'email');
    fields.append(name, email, element('small', '', `创建于 ${formatDate(user.createdAt)}`));
    const actions = element('div', 'admin-row-actions');
    actions.append(element('span', `status status-${user.status}`, user.status === 'active' ? '正常' : '已停用'));
    if (writable) {
      const save = actionButton('保存', () => updateUser(user, { name: name.value.trim(), email: email.value.trim() }, save));
      const toggle = actionButton(user.status === 'active' ? '停用' : '启用', () => updateUser(user, { status: user.status === 'active' ? 'disabled' : 'active' }, toggle));
      actions.append(save, toggle);
    } else {
      name.disabled = true;
      email.disabled = true;
    }
    row.append(fields, actions);
    list.append(row);
  });
}

async function loadUsers(force = false) {
  if (state.usersLoading && !force) return;
  state.usersLoading = true;
  $('#usersState').textContent = '正在读取用户...';
  clearGlobalError();
  try { state.users = await request('/users') || []; renderUsers(); }
  catch (error) { state.users = []; renderUsers(); showError('#globalError', error.message); }
  finally { state.usersLoading = false; }
}

function closeModerationDialog() {
  const dialog = $('#moderationDialog');
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  state.pendingModeration = null;
  $('#moderationReason').value = '';
}

function openModerationDialog(item, decision) {
  state.pendingModeration = { item, decision };
  const label = moderation.decisionLabels[decision] || decision;
  $('#moderationDialogTitle').textContent = `${label}${moderation.targetTypeLabels[item.targetType] || '市场内容'}`;
  $('#moderationDialogSummary').textContent = `${item.title} · ${item.locationText}`;
  const reasonVisible = decision === 'request_changes' || decision === 'disable';
  $('#moderationReasonLabel').hidden = !reasonVisible;
  $('#moderationReason').hidden = !reasonVisible;
  $('#moderationReason').required = decision === 'request_changes';
  $('#moderationReasonRequired').hidden = decision !== 'request_changes';
  $('#submitModeration').textContent = `确认${label}`;
  const dialog = $('#moderationDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  if (reasonVisible) $('#moderationReason').focus();
  else $('#submitModeration').focus();
}

function renderMarketContent() {
  const list = $('#moderationList');
  list.replaceChildren();
  $('#moderationState').textContent = state.marketContent.length ? `${state.marketContent.length} 条内容` : '当前筛选条件下暂无内容';
  state.marketContent.forEach((item) => {
    const row = element('article', 'admin-row moderation-row');
    const summary = element('div', 'moderation-summary');
    const heading = element('div', 'moderation-heading');
    heading.append(
      element('strong', '', item.title),
      element('span', `status status-${item.status}`, moderation.statusLabels[item.status] || item.status),
    );
    summary.append(
      heading,
      element('small', '', `${moderation.targetTypeLabels[item.targetType] || item.targetType} · ${item.subtitle || '暂无补充信息'} · ${item.locationText}`),
      element('small', '', `发布于 ${formatDate(item.publishedAt)} · 更新于 ${formatDate(item.updatedAt)}`),
    );
    if (item.moderationReason) summary.append(element('p', 'moderation-reason', `处理原因：${item.moderationReason}`));
    const actions = element('div', 'admin-row-actions moderation-actions');
    moderation.decisionsFor(item.status).forEach((decision) => {
      const className = decision === 'approve' || decision === 'restore' ? 'button primary'
        : decision === 'request_changes' ? 'button secondary' : 'button quiet danger';
      actions.append(actionButton(moderation.decisionLabels[decision], () => openModerationDialog(item, decision), className));
    });
    row.append(summary, actions);
    list.append(row);
  });
}

function moderationFilterValues() {
  const form = new FormData($('#moderationFilters'));
  return {
    targetType: form.get('targetType'), status: form.get('status'),
    publishedFrom: form.get('publishedFrom'), publishedTo: form.get('publishedTo'),
  };
}

async function loadMarketContent(force = false) {
  if (state.marketContentLoading && !force) return;
  state.marketContentLoading = true;
  $('#moderationState').textContent = '正在读取市场内容...';
  clearGlobalError();
  try {
    state.marketContent = await request(`/admin/market-content${moderation.buildQuery(moderationFilterValues())}`) || [];
    renderMarketContent();
  } catch (error) {
    state.marketContent = [];
    renderMarketContent();
    showError('#globalError', error.message);
  } finally {
    state.marketContentLoading = false;
  }
}

async function submitModerationDecision(event) {
  event.preventDefault();
  if (!state.pendingModeration || state.moderationDecisionLoading) return;
  const { item, decision } = state.pendingModeration;
  const reason = $('#moderationReason').value.trim();
  if (decision === 'request_changes' && !reason) { $('#moderationReason').focus(); return; }
  state.moderationDecisionLoading = true;
  $('#submitModeration').disabled = true;
  clearGlobalError();
  try {
    await request(`/admin/market-content/${encodeURIComponent(item.targetType)}/${encodeURIComponent(item.id)}/decision`, {
      method: 'POST', body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
    });
    closeModerationDialog();
    await loadMarketContent(true);
  } catch (error) {
    showError('#globalError', error.message);
  } finally {
    state.moderationDecisionLoading = false;
    $('#submitModeration').disabled = false;
  }
}

async function decideReport(report, decision, button) {
  button.disabled = true;
  clearGlobalError();
  try {
    await request(`/admin/market-reports/${encodeURIComponent(report.id)}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
    await loadReports(true);
  } catch (error) { showError('#globalError', error.message); }
  finally { button.disabled = false; }
}

function renderReports() {
  const list = $('#reportsList');
  list.replaceChildren();
  $('#reportsState').textContent = state.reports.length ? `${state.reports.length} 条举报` : '暂无举报';
  state.reports.forEach((report) => {
    const row = element('div', 'admin-row');
    const summary = element('div');
    summary.append(element('strong', '', `${report.targetType} · ${report.targetId}`), element('small', '', `${report.reason} · ${formatDate(report.createdAt)}`));
    const actions = element('div', 'admin-row-actions');
    actions.append(element('span', 'status', reportStatusLabels[report.status] || report.status));
    if (report.status === 'open') {
      const resolve = actionButton('下架', () => decideReport(report, 'resolved', resolve));
      const reject = actionButton('驳回', () => decideReport(report, 'rejected', reject));
      actions.append(resolve, reject);
    }
    row.append(summary, actions);
    list.append(row);
  });
}

async function loadReports(force = false) {
  if (state.reportsLoading && !force) return;
  state.reportsLoading = true;
  $('#reportsState').textContent = '正在读取举报...';
  clearGlobalError();
  try { state.reports = await request('/admin/market-reports?status=open') || []; renderReports(); }
  catch (error) { state.reports = []; renderReports(); showError('#globalError', error.message); }
  finally { state.reportsLoading = false; }
}

function adminRoleSelect(admin) {
  const select = element('select', 'row-select');
  select.setAttribute('aria-label', `${admin.loginName} 的角色`);
  const roles = permissions.canAssignAdminRoles(state.admin.role) ? ['owner', 'admin', 'reviewer', 'operator'] : [admin.role];
  roles.forEach((role) => { const option = element('option', '', adminRoleLabels[role]); option.value = role; select.append(option); });
  select.value = admin.role;
  select.disabled = !permissions.canAssignAdminRoles(state.admin.role);
  return select;
}

async function updateAdmin(admin, values, button) {
  button.disabled = true;
  clearGlobalError();
  try {
    await request(`/admin/accounts/${encodeURIComponent(admin.id)}`, { method: 'PATCH', body: JSON.stringify(values) });
    await loadAdmins(true);
  } catch (error) { showError('#globalError', error.message); }
  finally { button.disabled = false; }
}

function renderAdmins() {
  const list = $('#adminsList');
  list.replaceChildren();
  $('#adminsState').textContent = state.admins.length ? `${state.admins.length} 个管理员` : '暂无管理员';
  state.admins.forEach((admin) => {
    const row = element('div', 'admin-row editable-row');
    const fields = element('div', 'row-fields');
    fields.append(element('strong', '', admin.loginName), element('small', '', admin.status === 'active' ? '账号正常' : '账号已停用'));
    const role = adminRoleSelect(admin);
    const password = editableInput(`${admin.loginName} 的新密码`, '', 'password');
    password.placeholder = '新密码（不修改可留空）';
    password.autocomplete = 'new-password';
    password.maxLength = 256;
    fields.append(role, password);
    const actions = element('div', 'admin-row-actions');
    actions.append(element('span', 'status', adminRoleLabels[admin.role] || admin.role));
    const manageable = permissions.canManageAdminAccount(state.admin.role, admin.role);
    if (manageable) {
      const save = actionButton('保存', () => {
        const values = {
          ...(permissions.canAssignAdminRoles(state.admin.role) && role.value !== admin.role ? { role: role.value } : {}),
          ...(password.value ? { password: password.value } : {}),
        };
        if (!Object.keys(values).length) { showError('#globalError', '请选择新角色或输入新密码'); return; }
        updateAdmin(admin, values, save);
      });
      const toggle = actionButton(admin.status === 'active' ? '停用' : '启用', () => updateAdmin(admin, { status: admin.status === 'active' ? 'disabled' : 'active' }, toggle));
      actions.append(save, toggle);
    } else {
      password.disabled = true;
    }
    row.append(fields, actions);
    list.append(row);
  });
}

function renderAuditLogs() {
  const visible = state.admin?.role === 'owner';
  setHidden('#auditSection', !visible);
  if (!visible) return;
  $('#auditState').textContent = state.auditLogs.length ? `最近 ${state.auditLogs.length} 条` : '暂无记录';
  const list = $('#auditList');
  list.replaceChildren();
  state.auditLogs.forEach((entry) => {
    const row = element('div', 'audit-row');
    const summary = element('div');
    summary.append(
      element('strong', '', auditActionLabels[entry.action] || entry.action),
      element('small', '', `${entry.adminLoginName} · ${formatDate(entry.createdAt)}`),
    );
    row.append(summary, element('code', '', `${entry.targetType}${entry.targetId ? ` · ${entry.targetId}` : ''}`));
    list.append(row);
  });
}

async function loadAdmins(force = false) {
  if (state.adminsLoading && !force) return;
  state.adminsLoading = true;
  $('#adminsState').textContent = '正在读取管理员...';
  clearGlobalError();
  try {
    state.admins = await request('/admin/accounts') || [];
  } catch (error) {
    state.admins = [];
    showError('#globalError', error.message);
    renderAdmins();
    state.adminsLoading = false;
    return;
  }
  state.auditLogs = [];
  if (state.admin.role === 'owner') {
    try { state.auditLogs = await request('/admin/audit-logs?limit=100') || []; }
    catch (error) { showError('#globalError', error.message); }
  }
  if (!state.admin) { state.admins = []; state.adminsLoading = false; return; }
  renderAdmins();
  renderAuditLogs();
  state.adminsLoading = false;
}

function selectStatus(event) {
  document.querySelectorAll('#reviewPanel .tab').forEach((tab) => {
    const active = tab === event.currentTarget;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  state.status = event.currentTarget.dataset.status;
  loadQueue();
}

$('#loginForm').addEventListener('submit', login);
$('#logoutButton').addEventListener('click', () => logout());
document.querySelectorAll('.module-tab').forEach((button) => button.addEventListener('click', () => activateModule(button.dataset.module)));
$('#refreshButton').addEventListener('click', loadQueue);
document.querySelectorAll('#reviewPanel .tab').forEach((tab) => tab.addEventListener('click', selectStatus));
$('#approveButton').addEventListener('click', () => decide('approved'));
$('#changesButton').addEventListener('click', () => { setHidden('#reviewActions', true); setHidden('#decisionForm', false); $('#reason').focus(); });
$('#cancelDecision').addEventListener('click', () => { setHidden('#reviewActions', false); setHidden('#decisionForm', true); });
$('#submitDecision').addEventListener('click', () => { const reason = $('#reason').value.trim(); if (!reason) { $('#reason').focus(); return; } decide('changes_requested', reason); });
$('#usersRefresh').addEventListener('click', loadUsers);
$('#moderationRefresh').addEventListener('click', () => loadMarketContent(true));
$('#moderationFilters').addEventListener('submit', (event) => { event.preventDefault(); loadMarketContent(true); });
$('#moderationDecisionForm').addEventListener('submit', submitModerationDecision);
$('#cancelModeration').addEventListener('click', closeModerationDialog);
$('#reportsRefresh').addEventListener('click', loadReports);
$('#adminsRefresh').addEventListener('click', loadAdmins);
$('#userForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const form = new FormData(event.currentTarget);
  button.disabled = true;
  try {
    await request('/users', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email') }) });
    event.currentTarget.reset();
    await loadUsers(true);
  } catch (error) { showError('#globalError', error.message); }
  finally { button.disabled = false; }
});
$('#adminForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const form = new FormData(event.currentTarget);
  button.disabled = true;
  try {
    await request('/admin/accounts', { method: 'POST', body: JSON.stringify({ loginName: form.get('loginName'), password: form.get('password'), role: form.get('role') }) });
    event.currentTarget.reset();
    await loadAdmins(true);
  } catch (error) { showError('#globalError', error.message); }
  finally { button.disabled = false; }
});
