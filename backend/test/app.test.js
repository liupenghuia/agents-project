import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

async function withServer(run) {
  let app;
  const server = createServer((request, response) => app(request, response));
  app = createApp({
    wechatExchange: async (code) => ({ providerSubject: code, unionId: null }),
    wechatPhoneExchange: async (code) => ({ phoneNumber: `+86${code}`, purePhoneNumber: code, countryCode: '86' }),
    bootstrapAdmin: { loginName: 'owner', password: 'OwnerPassword123!' },
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
  if (response.status === 204) return { status: response.status, body: null };
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

test('exchanges an authorized WeChat phone code for the current session', async () => {
  await withServer(async (base) => {
    const session = await request(base, '/auth/wechat/session', {
      method: 'POST',
      body: JSON.stringify({ code: 'phone-user' }),
    });
    const headers = { authorization: `Bearer ${session.body.data.sessionToken}` };
    const phone = await request(base, '/auth/wechat/phone', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: '13800138000' }),
    });
    assert.equal(phone.status, 200);
    assert.deepEqual(phone.body.data, {
      phoneNumber: '+8613800138000',
      purePhoneNumber: '13800138000',
      countryCode: '86',
    });

    const unauthorized = await request(base, '/auth/wechat/phone', {
      method: 'POST',
      body: JSON.stringify({ code: '13800138000' }),
    });
    assert.equal(unauthorized.status, 401);
  });
});

test('reviewer can approve and request profile changes', async () => {
  await withServer(async (base, app) => {
    const user = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'candidate' }) });
    const userHeaders = { authorization: `Bearer ${user.body.data.sessionToken}` };
    const adminLogin = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }),
    });
    assert.equal(adminLogin.status, 200);
    const reviewerHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };

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
    assert.equal(response.status, 401);
  });
});

test('bootstrapped owner can authenticate, inspect itself, and log out', async () => {
  await withServer(async (base) => {
    const login = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }),
    });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.data.admin, {
      id: login.body.data.admin.id,
      loginName: 'owner',
      status: 'active',
      role: 'owner',
      lastLoginAt: login.body.data.admin.lastLoginAt,
    });
    const headers = { authorization: `Bearer ${login.body.data.token}` };
    const me = await request(base, '/admin/auth/me', { headers });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.loginName, 'owner');
    const logout = await request(base, '/admin/auth/logout', { method: 'POST', headers });
    assert.equal(logout.status, 204);
    const afterLogout = await request(base, '/admin/auth/me', { headers });
    assert.equal(afterLogout.status, 401);
  });
});

test('applicant and recruiter information APIs persist owner data', async () => {
  await withServer(async (base) => {
    const session = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'information-user' }) });
    const headers = { authorization: `Bearer ${session.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', {
      method: 'POST', headers, body: JSON.stringify(applicant),
    });
    assert.equal(applicantIdentity.status, 201);
    const recruiterIdentity = await request(base, '/me/identities/recruiter', {
      method: 'POST', headers, body: JSON.stringify(recruiter),
    });
    assert.equal(recruiterIdentity.status, 201);

    const applicantInfo = await request(base, '/me/applicant/job-seeking-information', {
      method: 'PUT', headers, body: JSON.stringify({
        jobTypeName: '前端开发', age: 28, expectedSalary: '15K-20K', workMethod: 'monthly_settlement',
        locationText: '上海浦东', latitude: 31.2304, longitude: 121.4737, preferredWorkScope: '浦东新区',
      }),
    });
    assert.equal(applicantInfo.status, 200);
    assert.equal(applicantInfo.body.data.age, 28);
    const applicantRead = await request(base, '/me/applicant/job-seeking-information', { headers });
    assert.equal(applicantRead.body.data.jobTypeName, '前端开发');
    const invalidAge = await request(base, '/me/applicant/job-seeking-information', {
      method: 'PUT', headers, body: JSON.stringify({ jobTypeName: '前端', age: 121, expectedSalary: '面议', workMethod: 'monthly_settlement', locationText: '上海', latitude: 31, longitude: 121 }),
    });
    assert.equal(invalidAge.status, 422);

    const recruiterInfo = await request(base, '/me/recruiter/information', {
      method: 'PUT', headers, body: JSON.stringify({ latitude: 31.2, longitude: 121.4, detailedAddress: '浦东新区示例路 1 号 3 栋 502 室' }),
    });
    assert.equal(recruiterInfo.status, 200);
    assert.equal(recruiterInfo.body.data.detailedAddress, '浦东新区示例路 1 号 3 栋 502 室');
    assert.equal(recruiterIdentity.body.data.role, 'recruiter');
  });
});

test('recruitment post API uploads references, publishes, updates, and enforces image limits', async () => {
  await withServer(async (base) => {
    const session = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'recruitment-user' }) });
    const headers = { authorization: `Bearer ${session.body.data.sessionToken}` };
    await request(base, '/me/identities/recruiter', { method: 'POST', headers, body: JSON.stringify(recruiter) });
    const uploadReference = await request(base, '/me/recruitment-posts/image-upload-url', {
      method: 'POST', headers, body: JSON.stringify({ fileName: 'test.jpg', contentType: 'image/jpeg', byteSize: 4 }),
    });
    assert.equal(uploadReference.status, 200);
    const form = new FormData();
    form.append('file', new Blob(['test'], { type: 'image/jpeg' }), 'test.jpg');
    const uploaded = await fetch(`${base}${uploadReference.body.data.uploadUrl}`, {
      method: 'POST', headers: { authorization: headers.authorization }, body: form,
    });
    assert.equal(uploaded.status, 200);
    const uploadedBody = await uploaded.json();
    const post = await request(base, '/me/recruitment-posts', {
      method: 'POST', headers, body: JSON.stringify({
        jobType: '服务员', salaryRange: '5K-7K', settlementMethod: '月结', locationText: '上海浦东',
        latitude: 31.2, longitude: 121.4, imageKeys: [uploadedBody.data.objectKey],
      }),
    });
    assert.equal(post.status, 201);
    assert.equal(post.body.data.images.length, 1);
    const listed = await request(base, '/me/recruitment-posts', { headers });
    assert.equal(listed.body.data.length, 1);
    const updated = await request(base, `/me/recruitment-posts/${post.body.data.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ salaryRange: '6K-8K' }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.salaryRange, '6K-8K');
    const tooManyImages = await request(base, '/me/recruitment-posts', {
      method: 'POST', headers, body: JSON.stringify({
        jobType: '服务员', salaryRange: '5K-7K', settlementMethod: '月结', locationText: '上海',
        latitude: 31, longitude: 121, imageKeys: ['1', '2', '3', '4', '5', '6', '7'],
      }),
    });
    assert.equal(tooManyImages.status, 422);
  });
});

test('admin manages users and both roles browse, favorite, report, and disable market records', async () => {
  await withServer(async (base) => {
    const adminLogin = await request(base, '/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }) });
    const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };
    const createdUser = await request(base, '/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email: 'managed@example.com', name: '后台用户' }) });
    assert.equal(createdUser.status, 201);
    const disabled = await request(base, `/users/${createdUser.body.data.id}`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(disabled.body.data.status, 'disabled');

    const applicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'market-applicant' }) });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant) });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    await request(base, '/me/applicant/job-seeking-information', { method: 'PUT', headers: applicantHeaders, body: JSON.stringify({ jobTypeName: '木工', age: 30, expectedSalary: '面议', workMethod: 'monthly_settlement', locationText: '上海', latitude: 31, longitude: 121 }) });

    const recruiterSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'market-recruiter' }) });
    const recruiterHeaders = { authorization: `Bearer ${recruiterSession.body.data.sessionToken}` };
    const recruiterIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify(recruiter) });
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const post = await request(base, '/me/recruitment-posts', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ jobType: '木工', salaryRange: '面议', settlementMethod: '月结', locationText: '上海', latitude: 31, longitude: 121, imageKeys: [] }) });
    assert.equal(post.status, 201);

    const marketPosts = await request(base, '/market/recruitment-posts', { headers: applicantHeaders });
    assert.equal(marketPosts.body.data.items[0].publishedAt, post.body.data.publishedAt);
    const detail = await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders });
    assert.equal(detail.body.data.contactPhone, recruiter.contactPhone);
    assert.equal((await request(base, `/me/favorites/recruitment-posts/${post.body.data.id}`, { method: 'PUT', headers: applicantHeaders })).status, 204);
    assert.equal((await request(base, '/me/favorites/recruitment-posts', { headers: applicantHeaders })).body.data.length, 1);
    const report = await request(base, '/me/market-reports', { method: 'POST', headers: applicantHeaders, body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id, reason: '信息不实' }) });
    assert.equal(report.status, 201);
    const reportList = await request(base, '/admin/market-reports?status=open', { headers: adminHeaders });
    assert.equal(reportList.body.data.length, 1);
    await request(base, `/admin/market-reports/${report.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'resolved' }) });
    assert.equal((await request(base, '/market/recruitment-posts', { headers: applicantHeaders })).body.data.items.length, 0);
  });
});
