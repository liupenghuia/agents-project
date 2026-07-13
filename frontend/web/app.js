const API_BASE = window.REVIEW_API_BASE_URL || 'http://localhost:3000';
const statusLabels = { pending_review: '待审核', changes_requested: '待补充', approved: '已通过' };
const roleLabels = { recruiter: '招人方', applicant: '应聘方' };
const fieldLabels = {
  organizationName: '招聘主体名称', organizationType: '主体类型', contactName: '联系人称呼', contactPhone: '联系手机号',
  region: '所在地区', industryOrJobDirection: '行业或岗位方向', displayName: '展示昵称', desiredJob: '期望岗位',
  experienceSummary: '工作经验概况', preferredRegionOrTime: '地区或时间偏好',
};
const organizationLabels = { company: '企业', individual: '个体', other: '个人/其他' };

const state = { token: '', admin: null, status: 'pending_review', queue: [], selected: null, loading: false };
const $ = (selector) => document.querySelector(selector);

function setHidden(selector, hidden) { $(selector).hidden = hidden; }
function showError(selector, message) { const element = $(selector); element.textContent = message; element.hidden = !message; }
function apiError(payload, status) { return new Error(payload?.error?.message || (status === 401 ? '登录已失效，请重新登录' : '请求失败，请稍后重试')); }

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401) logout(false); throw apiError(payload, response.status); }
  return payload.data;
}

function logout(redirect = true) {
  const token = state.token;
  state.token = '';
  state.admin = null;
  if (token) fetch(`${API_BASE}/admin/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  setHidden('#loginView', false); setHidden('#dashboardView', true); showError('#globalError', '');
  if (redirect) $('#loginForm').elements.loginName.focus();
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true; showError('#loginError', '');
  const form = new FormData(event.currentTarget);
  try {
    const session = await request('/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: form.get('loginName'), password: form.get('password') }) });
    state.token = session.token;
    state.admin = session.admin;
    setHidden('#loginView', true); setHidden('#dashboardView', false);
    $('#adminIdentity').textContent = `${session.admin.loginName} · ${session.admin.role}`;
    await loadQueue();
  } catch (error) { showError('#loginError', error.message); } finally { button.disabled = false; }
}

function renderQueue() {
  const list = $('#queueList');
  list.replaceChildren();
  if (!state.queue.length) { $('#queueState').textContent = '当前队列为空'; return; }
  $('#queueState').textContent = `${state.queue.length} 份资料`;
  state.queue.forEach((identity) => {
    const item = document.createElement('button');
    item.type = 'button'; item.className = `queue-item${state.selected?.id === identity.id ? ' selected' : ''}`;
    item.innerHTML = `<span class="queue-item-title"><span>${roleLabels[identity.role] || identity.role}</span><span>${statusLabels[identity.reviewStatus] || identity.reviewStatus}</span></span><span class="queue-item-meta">提交于 ${formatDate(identity.createdAt)}</span>`;
    item.addEventListener('click', () => { state.selected = identity; renderQueue(); renderDetail(); });
    list.append(item);
  });
}

function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '时间未知'; }
function formatValue(key, value) { return key === 'organizationType' ? organizationLabels[value] || value : value || '未填写'; }

function renderDetail() {
  const identity = state.selected;
  setHidden('#detailEmpty', Boolean(identity)); setHidden('#detailContent', !identity);
  if (!identity) return;
  $('#detailRole').textContent = roleLabels[identity.role] || identity.role;
  const profile = identity.profile || {};
  $('#detailTitle').textContent = identity.role === 'recruiter' ? profile.organizationName : profile.displayName;
  const status = $('#detailStatus'); status.textContent = statusLabels[identity.reviewStatus] || identity.reviewStatus; status.className = `status status-${identity.reviewStatus}`;
  const notice = $('#detailNotice'); notice.hidden = !identity.reviewReason; notice.textContent = identity.reviewReason ? `上次审核意见：${identity.reviewReason}` : '';
  const fields = $('#profileFields'); fields.replaceChildren();
  Object.entries(profile).filter(([key]) => key !== 'roleProfileId').forEach(([key, value]) => {
    const wrapper = document.createElement('div'); wrapper.innerHTML = `<dt>${fieldLabels[key] || key}</dt><dd></dd>`; wrapper.querySelector('dd').textContent = formatValue(key, value); fields.append(wrapper);
  });
  const actionable = identity.reviewStatus === 'pending_review' || identity.reviewStatus === 'changes_requested';
  setHidden('#reviewActions', !actionable); setHidden('#decisionForm', true);
}

async function loadQueue() {
  if (state.loading) return;
  state.loading = true; $('#queueState').textContent = '正在读取队列...';
  try { state.queue = await request(`/admin/identity-reviews?status=${encodeURIComponent(state.status)}`) || []; state.selected = state.queue[0] || null; renderQueue(); renderDetail(); }
  catch (error) { state.queue = []; state.selected = null; renderQueue(); renderDetail(); showError('#globalError', error.message); }
  finally { state.loading = false; }
}

async function decide(decision, reason = '') {
  if (!state.selected || state.loading) return;
  state.loading = true;
  $('#approveButton').disabled = true; $('#submitDecision').disabled = true;
  try { await request(`/admin/identity-reviews/${encodeURIComponent(state.selected.id)}/decision`, { method: 'POST', body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }) }); await loadQueue(); }
  catch (error) { showError('#globalError', error.message); }
  finally { state.loading = false; $('#approveButton').disabled = false; $('#submitDecision').disabled = false; }
}

function selectStatus(event) {
  document.querySelectorAll('.tab').forEach((tab) => { const active = tab === event.currentTarget; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  state.status = event.currentTarget.dataset.status; loadQueue();
}

$('#loginForm').addEventListener('submit', login);
$('#logoutButton').addEventListener('click', () => logout());
$('#refreshButton').addEventListener('click', loadQueue);
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', selectStatus));
$('#approveButton').addEventListener('click', () => decide('approved'));
$('#changesButton').addEventListener('click', () => { setHidden('#reviewActions', true); setHidden('#decisionForm', false); $('#reason').focus(); });
$('#cancelDecision').addEventListener('click', () => { setHidden('#reviewActions', false); setHidden('#decisionForm', true); });
$('#submitDecision').addEventListener('click', () => { const reason = $('#reason').value.trim(); if (!reason) { $('#reason').focus(); return; } decide('changes_requested', reason); });
