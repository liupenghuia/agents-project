import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

async function withServer(run) {
  let app;
  const server = createServer((request, response) => app(request, response));
  app = createApp({
    wechatExchange: async (code) => ({ providerSubject: code, unionId: null }),
    sessionTtlMs: 60 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, app);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    app.close();
  }
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  return { status: response.status, body };
}

const recruiter = {
  organizationName: '示例招聘主体',
  organizationType: 'company',
  contactName: '招聘联系人',
  contactPhone: '13800138000',
  region: '上海',
  industryOrJobDirection: '软件开发',
};

const applicant = {
  displayName: '求职者',
  contactPhone: '13900139000',
  region: '上海',
  desiredJob: '前端开发',
  experienceSummary: '三年 Web 开发经验',
  preferredRegionOrTime: '上海，工作日',
};

test('health endpoint reports a running backend', async () => {
  await withServer(async (base) => {
    const response = await request(base, '/health');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { status: 'ok', service: 'recruitment-backend' });
  });
});

test('creates WeChat session and supports two independent identities', async () => {
  await withServer(async (base, app) => {
    const sessionResponse = await request(base, '/auth/wechat/session', {
      method: 'POST',
      body: JSON.stringify({ code: 'user-one' }),
    });
    assert.equal(sessionResponse.status, 200);
    const token = sessionResponse.body.data.sessionToken;
    const headers = { authorization: `Bearer ${token}` };

    const recruiterResponse = await request(base, '/me/identities/recruiter', {
      method: 'POST', headers, body: JSON.stringify(recruiter),
    });
    assert.equal(recruiterResponse.status, 201);
    assert.equal(recruiterResponse.body.data.reviewStatus, 'pending_review');

    const applicantResponse = await request(base, '/me/identities/applicant', {
      method: 'POST', headers, body: JSON.stringify(applicant),
    });
    assert.equal(applicantResponse.status, 201);
    assert.equal(applicantResponse.body.data.role, 'applicant');

    const identities = await request(base, '/me/identities', { headers });
    assert.equal(identities.status, 200);
    assert.deepEqual(identities.body.data.map((item) => item.role), ['recruiter', 'applicant']);

    const duplicate = await request(base, '/me/identities/recruiter', {
      method: 'POST', headers, body: JSON.stringify(recruiter),
    });
    assert.equal(duplicate.status, 409);
    app.grantReviewer(sessionResponse.body.data.userId);
  });
});

test('reviewer can approve and request profile changes', async () => {
  await withServer(async (base, app) => {
    const user = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'candidate' }) });
    const reviewer = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'reviewer' }) });
    const userHeaders = { authorization: `Bearer ${user.body.data.sessionToken}` };
    const reviewerHeaders = { authorization: `Bearer ${reviewer.body.data.sessionToken}` };
    app.grantReviewer(reviewer.body.data.userId);

    const created = await request(base, '/me/identities/applicant', {
      method: 'POST', headers: userHeaders, body: JSON.stringify(applicant),
    });
    const identityId = created.body.data.id;

    const queue = await request(base, '/admin/identity-reviews', { headers: reviewerHeaders });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.data[0].id, identityId);

    const changes = await request(base, `/admin/identity-reviews/${identityId}/decision`, {
      method: 'POST', headers: reviewerHeaders,
      body: JSON.stringify({ decision: 'changes_requested', reason: '请补充工作经验说明' }),
    });
    assert.equal(changes.status, 200);
    assert.equal(changes.body.data.reviewStatus, 'changes_requested');

    const resubmitted = await request(base, `/me/identities/${identityId}/resubmit`, {
      method: 'POST', headers: userHeaders,
      body: JSON.stringify({ profile: { ...applicant, experienceSummary: '五年相关经验' } }),
    });
    assert.equal(resubmitted.status, 200);
    assert.equal(resubmitted.body.data.reviewStatus, 'pending_review');

    const approved = await request(base, `/admin/identity-reviews/${identityId}/decision`, {
      method: 'POST', headers: reviewerHeaders,
      body: JSON.stringify({ decision: 'approved' }),
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.reviewStatus, 'approved');
  });
});

test('review endpoints require reviewer permission', async () => {
  await withServer(async (base) => {
    const session = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'ordinary' }) });
    const response = await request(base, '/admin/identity-reviews', {
      headers: { authorization: `Bearer ${session.body.data.sessionToken}` },
    });
    assert.equal(response.status, 403);
  });
});
