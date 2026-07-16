import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

async function withServer(run) {
  let app;
  const mediaRoot = await mkdtemp(join(tmpdir(), 'recruitment-media-'));
  const server = createServer((request, response) => app(request, response));
  app = createApp({
    wechatExchange: async (code) => ({ providerSubject: code, unionId: null }),
    wechatPhoneExchange: async (code) => ({ phoneNumber: `+86${code}`, purePhoneNumber: code, countryCode: '86' }),
    bootstrapAdmin: { loginName: 'owner', password: 'OwnerPassword123!' },
    sessionTtlMs: 60 * 60 * 1000,
    mediaRoot,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, app);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    app.close();
    await rm(mediaRoot, { recursive: true, force: true });
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

test('creates a WeChat session and binds one phone number to one role', async () => {
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
      method: 'POST', headers, body: JSON.stringify({ ...applicant, contactPhone: recruiter.contactPhone }),
    });
    assert.equal(applicantResponse.status, 409);
    assert.equal(applicantResponse.body.error.code, 'PHONE_ROLE_BOUND');

    const identities = await request(base, '/me/identities', { headers });
    assert.equal(identities.status, 200);
    assert.deepEqual(identities.body.data.map((item) => item.role), ['recruiter']);

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

test('owner can update identity profile without changing role or phone', async () => {
  await withServer(async (base) => {
    const session = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'profile-owner' }) });
    const headers = { authorization: `Bearer ${session.body.data.sessionToken}` };
    const created = await request(base, '/me/identities/recruiter', {
      method: 'POST', headers, body: JSON.stringify(recruiter),
    });
    const identityId = created.body.data.id;
    const rejectedPhoneChange = await request(base, `/me/identities/${identityId}/profile`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ ...recruiter, organizationName: '更新后的主体', contactPhone: '13900139001' }),
    });
    assert.equal(rejectedPhoneChange.status, 409);
    assert.equal(rejectedPhoneChange.body.error.code, 'PHONE_IMMUTABLE');
    const updated = await request(base, `/me/identities/${identityId}/profile`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ ...recruiter, organizationName: '更新后的主体' }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.role, 'recruiter');
    assert.equal(updated.body.data.profile.organizationName, '更新后的主体');
    assert.equal(updated.body.data.profile.contactPhone, '13800138000');
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

test('administrator login attempts are rate limited without revealing account state', async () => {
  await withServer(async (base) => {
    for (let index = 0; index < 10; index += 1) {
      const attempt = await request(base, '/admin/auth/login', {
        method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'WrongPassword123!' }),
      });
      assert.equal(attempt.status, 401);
    }
    const limited = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'unknown', password: 'WrongPassword123!' }),
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'RATE_LIMITED');
  });
});

test('admin account protection preserves an active owner, revokes sessions, and audits changes', async () => {
  await withServer(async (base) => {
    const ownerLogin = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }),
    });
    const owner = ownerLogin.body.data.admin;
    const ownerHeaders = { authorization: `Bearer ${ownerLogin.body.data.token}` };
    assert.equal((await request(base, `/admin/accounts/${owner.id}`, {
      method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ status: 'disabled' }),
    })).status, 409);

    const staff = await request(base, '/admin/accounts', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ loginName: 'staff-admin', password: 'StaffPassword123!', role: 'admin' }),
    });
    assert.equal(staff.status, 201);
    const staffLogin = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'staff-admin', password: 'StaffPassword123!' }),
    });
    const staffHeaders = { authorization: `Bearer ${staffLogin.body.data.token}` };
    assert.equal((await request(base, '/admin/accounts', {
      method: 'POST', headers: staffHeaders,
      body: JSON.stringify({ loginName: 'illegal-owner', password: 'IllegalOwner123!', role: 'owner' }),
    })).status, 403);
    assert.equal((await request(base, `/admin/accounts/${owner.id}`, {
      method: 'PATCH', headers: staffHeaders, body: JSON.stringify({ password: 'ChangedOwner123!' }),
    })).status, 403);
    assert.equal((await request(base, `/admin/accounts/${staff.body.data.id}`, {
      method: 'PATCH', headers: staffHeaders, body: JSON.stringify({ role: 'reviewer' }),
    })).status, 403);

    const reset = await request(base, `/admin/accounts/${staff.body.data.id}`, {
      method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ password: 'NewStaffPassword123!' }),
    });
    assert.equal(reset.status, 200);
    assert.equal((await request(base, '/admin/auth/me', { headers: staffHeaders })).status, 401);
    assert.equal((await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'staff-admin', password: 'StaffPassword123!' }),
    })).status, 401);

    const users = await request(base, '/users', { headers: ownerHeaders });
    assert.equal(users.body.data.some((user) => user.id === owner.id || user.id === staff.body.data.id), false);
    const audit = await request(base, '/admin/audit-logs', { headers: ownerHeaders });
    assert.equal(audit.status, 200);
    assert.ok(audit.body.data.some((entry) => entry.action === 'admin.account.created' && entry.targetId === staff.body.data.id));
    assert.ok(audit.body.data.some((entry) => entry.action === 'admin.account.updated' && entry.targetId === staff.body.data.id));
    assert.equal(JSON.stringify(audit.body).includes('NewStaffPassword123!'), false);
    assert.equal((await request(base, '/admin/audit-logs', { headers: {
      authorization: `Bearer ${(await request(base, '/admin/auth/login', {
        method: 'POST', body: JSON.stringify({ loginName: 'staff-admin', password: 'NewStaffPassword123!' }),
      })).body.data.token}`,
    } })).status, 403);

    const secondOwner = await request(base, '/admin/accounts', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ loginName: 'backup-owner', password: 'BackupOwner123!', role: 'owner' }),
    });
    const secondOwnerLogin = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'backup-owner', password: 'BackupOwner123!' }),
    });
    const secondOwnerHeaders = { authorization: `Bearer ${secondOwnerLogin.body.data.token}` };
    assert.equal((await request(base, `/admin/accounts/${owner.id}`, {
      method: 'PATCH', headers: secondOwnerHeaders, body: JSON.stringify({ status: 'disabled' }),
    })).status, 200);
    assert.equal((await request(base, '/admin/auth/me', { headers: ownerHeaders })).status, 401);
    assert.equal((await request(base, `/admin/accounts/${secondOwner.body.data.id}`, {
      method: 'PATCH', headers: secondOwnerHeaders, body: JSON.stringify({ role: 'admin' }),
    })).status, 409);
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
    const recruiterIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers, body: JSON.stringify(recruiter) });
    const adminLogin = await request(base, '/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }) });
    const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }),
    });
    const uploadReference = await request(base, '/me/recruitment-posts/image-upload-url', {
      method: 'POST', headers, body: JSON.stringify({ fileName: 'test.jpg', contentType: 'image/jpeg', byteSize: 4 }),
    });
    assert.equal(uploadReference.status, 200);
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'test.jpg');
    const uploaded = await fetch(`${base}${uploadReference.body.data.uploadUrl}`, {
      method: 'POST', headers: { authorization: headers.authorization }, body: form,
    });
    assert.equal(uploaded.status, 200);
    const uploadedBody = await uploaded.json();
    const mismatchedReference = await request(base, '/me/recruitment-posts/image-upload-url', {
      method: 'POST', headers, body: JSON.stringify({ fileName: 'mismatch.png', contentType: 'image/png', byteSize: 4 }),
    });
    const mismatchForm = new FormData();
    mismatchForm.append('file', new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'mismatch.jpg');
    const mismatched = await fetch(`${base}${mismatchedReference.body.data.uploadUrl}`, {
      method: 'POST', headers: { authorization: headers.authorization }, body: mismatchForm,
    });
    assert.equal(mismatched.status, 422);
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

    const applicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'image-viewer' }) });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant) });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }),
    });
    const marketDetail = await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders });
    assert.equal(marketDetail.body.data.contactName, recruiter.contactName);
    assert.equal(marketDetail.body.data.isFavorited, false);
    assert.equal(JSON.stringify(marketDetail.body).includes('objectKey'), false);
    assert.match(marketDetail.body.data.images[0].url, /^\/market\/media\//);
    const publicImage = await fetch(`${base}${marketDetail.body.data.images[0].url}`);
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()), Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
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
  await withServer(async (base, app) => {
    const adminLogin = await request(base, '/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }) });
    const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };
    const createdUser = await request(base, '/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email: 'managed@example.com', name: '后台用户' }) });
    assert.equal(createdUser.status, 201);
    const disabled = await request(base, `/users/${createdUser.body.data.id}`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(disabled.status, 204);

    const applicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'market-applicant' }) });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant) });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const applicantInformation = await request(base, '/me/applicant/job-seeking-information', { method: 'PUT', headers: applicantHeaders, body: JSON.stringify({ jobTypeName: '木工', age: 30, expectedSalary: '面议', workMethod: 'monthly_settlement', locationText: '上海', latitude: 31, longitude: 121 }) });

    const secondApplicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'market-applicant-two' }) });
    const secondApplicantHeaders = { authorization: `Bearer ${secondApplicantSession.body.data.sessionToken}` };
    const secondApplicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: secondApplicantHeaders, body: JSON.stringify({ ...applicant, displayName: '第二位求职者', contactPhone: '13700137000' }) });
    await request(base, `/admin/identity-reviews/${secondApplicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    await request(base, '/me/applicant/job-seeking-information', { method: 'PUT', headers: secondApplicantHeaders, body: JSON.stringify({ jobTypeName: '电工', age: 35, expectedSalary: '日薪 500', workMethod: 'indefinite_duration', locationText: '上海', latitude: 31.003, longitude: 121.003 }) });
    app.db.prepare('UPDATE applicant_job_seeking_information SET published_at = ? WHERE role_profile_id IN (?, ?)')
      .run(applicantInformation.body.data.publishedAt, applicantIdentity.body.data.id, secondApplicantIdentity.body.data.id);

    const recruiterSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'market-recruiter' }) });
    const recruiterHeaders = { authorization: `Bearer ${recruiterSession.body.data.sessionToken}` };
    const recruiterIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify(recruiter) });
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const post = await request(base, '/me/recruitment-posts', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ jobType: '木工', salaryRange: '面议', settlementMethod: '月结', locationText: '上海', latitude: 31, longitude: 121, imageKeys: [] }) });
    assert.equal(post.status, 201);
    const secondPost = await request(base, '/me/recruitment-posts', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ jobType: '油漆工', salaryRange: '日薪 400', settlementMethod: '日结', locationText: '上海', latitude: 31.001, longitude: 121.001, imageKeys: [] }) });
    app.db.prepare('UPDATE recruitment_posts SET published_at = ? WHERE id IN (?, ?)')
      .run(post.body.data.publishedAt, post.body.data.id, secondPost.body.data.id);

    const marketPosts = await request(base, '/market/recruitment-posts', { headers: applicantHeaders });
    assert.equal(marketPosts.body.data.items.find((item) => item.id === post.body.data.id).publishedAt, post.body.data.publishedAt);
    assert.equal(marketPosts.body.data.items.every((item) => item.isFavorited === false), true);
    assert.equal(JSON.stringify(marketPosts.body).includes('contactPhone'), false);
    assert.equal(JSON.stringify(marketPosts.body).includes('objectKey'), false);
    const firstPage = await request(base, '/market/recruitment-posts?limit=1', { headers: applicantHeaders });
    assert.equal(firstPage.body.data.items.length, 1);
    assert.ok(firstPage.body.data.nextCursor);
    const secondPage = await request(base, `/market/recruitment-posts?limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`, { headers: applicantHeaders });
    assert.equal(secondPage.body.data.items.length, 1);
    assert.notEqual(secondPage.body.data.items[0].id, firstPage.body.data.items[0].id);
    assert.equal(secondPage.body.data.nextCursor, null);
    assert.equal((await request(base, '/market/recruitment-posts?cursor=not-a-cursor', { headers: applicantHeaders })).status, 422);
    assert.equal((await request(base, '/market/recruitment-posts?sort=nearest', { headers: applicantHeaders })).status, 422);
    const applicantFirstPage = await request(base, '/market/job-seeking-information?limit=1', { headers: recruiterHeaders });
    const applicantSecondPage = await request(base, `/market/job-seeking-information?limit=1&cursor=${encodeURIComponent(applicantFirstPage.body.data.nextCursor)}`, { headers: recruiterHeaders });
    assert.equal(applicantFirstPage.body.data.items.length, 1);
    assert.equal(applicantSecondPage.body.data.items.length, 1);
    assert.notEqual(applicantFirstPage.body.data.items[0].id, applicantSecondPage.body.data.items[0].id);
    assert.equal(applicantSecondPage.body.data.nextCursor, null);
    const clusteredMap = await request(base, '/market/recruitment-posts/map?south=30.5&west=120.5&north=31.5&east=121.5&zoom=10', { headers: applicantHeaders });
    assert.equal(clusteredMap.status, 200);
    assert.equal(clusteredMap.body.data.items.length, 1);
    assert.equal(clusteredMap.body.data.items[0].cluster, true);
    assert.equal(clusteredMap.body.data.items[0].count, 2);
    assert.equal(JSON.stringify(clusteredMap.body).includes('contactPhone'), false);
    const singleMap = await request(base, '/market/recruitment-posts/map?south=30.5&west=120.5&north=31.5&east=121.5&zoom=20&jobType=%E6%9C%A8%E5%B7%A5', { headers: applicantHeaders });
    assert.equal(singleMap.body.data.items[0].id, post.body.data.id);
    assert.notEqual(singleMap.body.data.items[0].latitude, 31);
    assert.notEqual(singleMap.body.data.items[0].longitude, 121);
    const applicantMap = await request(base, '/market/job-seeking-information/map?south=30.5&west=120.5&north=31.5&east=121.5&zoom=20&jobTypeName=%E6%9C%A8%E5%B7%A5', { headers: recruiterHeaders });
    assert.equal(applicantMap.body.data.items[0].jobTypeName, '木工');
    assert.equal(JSON.stringify(applicantMap.body).includes(applicant.contactPhone), false);
    assert.equal(applicantMap.body.data.nextCursor, null);
    const invalidMap = await request(base, '/market/recruitment-posts/map?south=31&west=121&north=30&east=120&zoom=20', { headers: applicantHeaders });
    assert.equal(invalidMap.status, 422);
    const unapprovedSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'map-unapproved' }) });
    const unapprovedHeaders = { authorization: `Bearer ${unapprovedSession.body.data.sessionToken}` };
    const forbiddenMap = await request(base, '/market/recruitment-posts/map?south=30.5&west=120.5&north=31.5&east=121.5&zoom=10', { headers: unapprovedHeaders });
    assert.equal(forbiddenMap.status, 403);
    assert.equal((await request(base, `/me/favorites/recruitment-posts/${post.body.data.id}`, { method: 'PUT', headers: unapprovedHeaders })).status, 403);

    const intruderIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers: applicantHeaders, body: JSON.stringify({ ...recruiter, organizationName: '其他招聘方', contactPhone: '13600136000' }) });
    await request(base, `/admin/identity-reviews/${intruderIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    assert.equal((await request(base, `/me/recruitment-posts/${post.body.data.id}/disable`, { method: 'POST', headers: applicantHeaders })).status, 404);
    const detail = await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders });
    assert.equal(detail.body.data.contactPhone, recruiter.contactPhone);
    assert.equal(detail.body.data.contactName, recruiter.contactName);
    assert.equal(detail.body.data.isFavorited, false);
    assert.equal((await request(base, `/me/favorites/recruitment-posts/${post.body.data.id}`, { method: 'PUT', headers: applicantHeaders })).status, 204);
    assert.equal((await request(base, '/me/favorites/recruitment-posts', { headers: applicantHeaders })).body.data.length, 1);
    const favoritedDetail = await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders });
    assert.equal(favoritedDetail.body.data.isFavorited, true);
    for (let index = 0; index < 28; index += 1) {
      assert.equal((await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders })).status, 200);
    }
    const rateLimitedDetail = await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders });
    assert.equal(rateLimitedDetail.status, 429);
    assert.equal(rateLimitedDetail.body.error.code, 'CONTACT_RATE_LIMITED');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM market_contact_views WHERE viewer_user_id = ?').get(applicantSession.body.data.userId).count, 30);
    const applicantDetail = await request(base, `/market/job-seeking-information/${applicantIdentity.body.data.id}`, { headers: recruiterHeaders });
    assert.equal(applicantDetail.body.data.contactName, applicant.displayName);
    assert.equal(applicantDetail.body.data.contactPhone, applicant.contactPhone);
    assert.equal(applicantDetail.body.data.isFavorited, false);
    assert.equal((await request(base, `/me/favorites/job-seeking-information/${applicantIdentity.body.data.id}`, { method: 'PUT', headers: recruiterHeaders })).status, 204);
    assert.equal((await request(base, `/market/job-seeking-information/${applicantIdentity.body.data.id}`, { headers: recruiterHeaders })).body.data.isFavorited, true);
    const report = await request(base, '/me/market-reports', { method: 'POST', headers: applicantHeaders, body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id, reason: '信息不实' }) });
    assert.equal(report.status, 201);
    const reportList = await request(base, '/admin/market-reports?status=open', { headers: adminHeaders });
    assert.equal(reportList.body.data.length, 1);
    await request(base, `/admin/market-reports/${report.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'resolved' }) });
    const reportAudit = app.db.prepare("SELECT details_json FROM admin_audit_logs WHERE action = 'market.report.decided' AND target_id = ?").get(report.body.data.id);
    assert.ok(reportAudit);
    assert.equal(JSON.parse(reportAudit.details_json).decision, 'resolved');
    const disabledMap = await request(base, '/market/recruitment-posts/map?south=30.5&west=120.5&north=31.5&east=121.5&zoom=20&jobType=%E6%9C%A8%E5%B7%A5', { headers: applicantHeaders });
    assert.equal(disabledMap.body.data.items.length, 0);
  });
});

test('market moderation enforces transitions, permissions, owner resubmission, visibility, and audit', async () => {
  await withServer(async (base, app) => {
    const ownerLogin = await request(base, '/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }),
    });
    const ownerHeaders = { authorization: `Bearer ${ownerLogin.body.data.token}` };
    const operator = await request(base, '/admin/accounts', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ loginName: 'market-operator', password: 'MarketOperator123!', role: 'operator' }),
    });
    const ordinaryAdmin = await request(base, '/admin/accounts', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ loginName: 'ordinary-admin', password: 'OrdinaryAdmin123!', role: 'admin' }),
    });
    const reviewer = await request(base, '/admin/accounts', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ loginName: 'identity-reviewer', password: 'IdentityReviewer123!', role: 'reviewer' }),
    });
    assert.equal(operator.status, 201);
    assert.equal(ordinaryAdmin.status, 201);
    assert.equal(reviewer.status, 201);

    const loginAs = async (loginName, password) => {
      const login = await request(base, '/admin/auth/login', {
        method: 'POST', body: JSON.stringify({ loginName, password }),
      });
      return { authorization: `Bearer ${login.body.data.token}` };
    };
    const operatorHeaders = await loginAs('market-operator', 'MarketOperator123!');
    const ordinaryAdminHeaders = await loginAs('ordinary-admin', 'OrdinaryAdmin123!');
    const reviewerHeaders = await loginAs('identity-reviewer', 'IdentityReviewer123!');

    const recruiterSession = await request(base, '/auth/wechat/session', {
      method: 'POST', body: JSON.stringify({ code: 'moderation-recruiter' }),
    });
    const recruiterHeaders = { authorization: `Bearer ${recruiterSession.body.data.sessionToken}` };
    const recruiterIdentity = await request(base, '/me/identities/recruiter', {
      method: 'POST', headers: recruiterHeaders, body: JSON.stringify(recruiter),
    });
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify({ decision: 'approved' }),
    });
    const post = await request(base, '/me/recruitment-posts', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({
        jobType: '焊工', salaryRange: '8K-10K', settlementMethod: '月结', locationText: '上海浦东',
        latitude: 31.2, longitude: 121.5, imageKeys: [],
      }),
    });

    const applicantSession = await request(base, '/auth/wechat/session', {
      method: 'POST', body: JSON.stringify({ code: 'moderation-applicant' }),
    });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', {
      method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant),
    });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify({ decision: 'approved' }),
    });
    const applicantInformation = await request(base, '/me/applicant/job-seeking-information', {
      method: 'PUT', headers: applicantHeaders,
      body: JSON.stringify({
        jobTypeName: '焊工', age: 31, expectedSalary: '9K', workMethod: 'monthly_settlement',
        locationText: '上海闵行', latitude: 31.1, longitude: 121.4,
      }),
    });

    assert.equal((await request(base, '/admin/market-content', { headers: operatorHeaders })).status, 200);
    assert.equal((await request(base, '/admin/market-content', { headers: ordinaryAdminHeaders })).status, 403);
    assert.equal((await request(base, '/admin/market-content', { headers: reviewerHeaders })).status, 403);
    assert.equal((await request(base, '/admin/market-content', { headers: applicantHeaders })).status, 401);
    assert.equal((await request(base, '/admin/market-reports', { headers: ordinaryAdminHeaders })).status, 403);

    const missingReason = await request(base, `/admin/market-content/recruitment_post/${post.body.data.id}/decision`, {
      method: 'POST', headers: operatorHeaders, body: JSON.stringify({ decision: 'request_changes' }),
    });
    assert.equal(missingReason.status, 422);
    const returned = await request(base, `/admin/market-content/recruitment_post/${post.body.data.id}/decision`, {
      method: 'POST', headers: operatorHeaders,
      body: JSON.stringify({ decision: 'request_changes', reason: '请补充准确的薪资说明' }),
    });
    assert.equal(returned.status, 200);
    assert.equal(returned.body.data.status, 'changes_requested');
    assert.equal(returned.body.data.moderationReason, '请补充准确的薪资说明');

    const ownerReturned = await request(base, `/me/recruitment-posts/${post.body.data.id}`, { headers: recruiterHeaders });
    assert.equal(ownerReturned.body.data.status, 'changes_requested');
    assert.equal(ownerReturned.body.data.moderationReason, '请补充准确的薪资说明');
    const publicReturned = await request(base, '/market/recruitment-posts?jobType=焊工', { headers: applicantHeaders });
    assert.equal(publicReturned.body.data.items.some((item) => item.id === post.body.data.id), false);

    const resubmitted = await request(base, `/me/recruitment-posts/${post.body.data.id}`, {
      method: 'PATCH', headers: recruiterHeaders, body: JSON.stringify({ salaryRange: '9K-11K（税前）' }),
    });
    assert.equal(resubmitted.body.data.status, 'pending_review');
    assert.equal(resubmitted.body.data.moderationReason, '请补充准确的薪资说明');
    const pendingQueue = await request(base, '/admin/market-content?targetType=recruitment_post&status=pending_review', { headers: operatorHeaders });
    assert.deepEqual(pendingQueue.body.data.map((item) => item.id), [post.body.data.id]);

    const approved = await request(base, `/admin/market-content/recruitment_post/${post.body.data.id}/decision`, {
      method: 'POST', headers: operatorHeaders, body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(approved.body.data.status, 'published');
    assert.equal('moderationReason' in approved.body.data, false);
    const publicApproved = await request(base, '/market/recruitment-posts?jobType=焊工', { headers: applicantHeaders });
    assert.equal(publicApproved.body.data.items.some((item) => item.id === post.body.data.id), true);

    const disabled = await request(base, `/admin/market-content/recruitment_post/${post.body.data.id}/decision`, {
      method: 'POST', headers: operatorHeaders,
      body: JSON.stringify({ decision: 'disable', reason: '运营下架核查' }),
    });
    assert.equal(disabled.body.data.status, 'disabled');
    const editedWhileDisabled = await request(base, `/me/recruitment-posts/${post.body.data.id}`, {
      method: 'PATCH', headers: recruiterHeaders, body: JSON.stringify({ salaryRange: '10K-12K' }),
    });
    assert.equal(editedWhileDisabled.body.data.status, 'disabled');
    assert.equal((await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders })).status, 404);
    const restored = await request(base, `/admin/market-content/recruitment_post/${post.body.data.id}/decision`, {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify({ decision: 'restore' }),
    });
    assert.equal(restored.body.data.status, 'published');
    const invalidRestore = await request(base, `/admin/market-content/recruitment_post/${post.body.data.id}/decision`, {
      method: 'POST', headers: operatorHeaders, body: JSON.stringify({ decision: 'restore' }),
    });
    assert.equal(invalidRestore.status, 409);
    assert.equal(invalidRestore.body.error.code, 'INVALID_MARKET_TRANSITION');

    await request(base, `/admin/market-content/applicant_information/${applicantInformation.body.data.roleProfileId}/decision`, {
      method: 'POST', headers: operatorHeaders,
      body: JSON.stringify({ decision: 'request_changes', reason: '请更新期望薪资' }),
    });
    const applicantOwnerView = await request(base, '/me/applicant/job-seeking-information', { headers: applicantHeaders });
    assert.equal(applicantOwnerView.body.data.status, 'changes_requested');
    assert.equal(applicantOwnerView.body.data.moderationReason, '请更新期望薪资');
    const applicantResubmitted = await request(base, '/me/applicant/job-seeking-information', {
      method: 'PUT', headers: applicantHeaders,
      body: JSON.stringify({
        jobTypeName: '焊工', age: 31, expectedSalary: '10K', workMethod: 'monthly_settlement',
        locationText: '上海闵行', latitude: 31.1, longitude: 121.4,
      }),
    });
    assert.equal(applicantResubmitted.body.data.status, 'pending_review');
    const applicantFilter = await request(base, '/admin/market-content?targetType=applicant_information&status=pending_review&publishedFrom=2000-01-01T00:00:00.000Z', { headers: operatorHeaders });
    assert.deepEqual(applicantFilter.body.data.map((item) => item.id), [applicantInformation.body.data.roleProfileId]);
    assert.equal((await request(base, '/admin/market-content?publishedFrom=invalid', { headers: operatorHeaders })).status, 422);

    const audits = app.db.prepare("SELECT details_json FROM admin_audit_logs WHERE action = 'market.content.moderated' ORDER BY created_at").all();
    assert.equal(audits.length, 5);
    assert.deepEqual(JSON.parse(audits[0].details_json), {
      decision: 'request_changes', previousStatus: 'published', status: 'changes_requested', reason: '请补充准确的薪资说明',
    });
  });
});

test('messaging, applications and interviews enforce permissions and state transitions', async () => {
  await withServer(async (base) => {
    const adminLogin = await request(base, '/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }) });
    const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };

    const applicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'collab-applicant' }) });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant) });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });

    const recruiterSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'collab-recruiter' }) });
    const recruiterHeaders = { authorization: `Bearer ${recruiterSession.body.data.sessionToken}` };
    const recruiterIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify(recruiter) });
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const post = await request(base, '/me/recruitment-posts', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({ jobType: '沟通测试岗', salaryRange: '面议', settlementMethod: '月结', locationText: '上海', latitude: 31, longitude: 121, imageKeys: [] }),
    });

    const conversation = await request(base, '/me/conversations', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id, body: '你好，想了解岗位', clientRequestId: 'msg-1' }),
    });
    assert.equal(conversation.status, 201);
    const duplicateMessage = await request(base, `/me/conversations/${conversation.body.data.id}/messages`, {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ body: '你好，想了解岗位', clientRequestId: 'msg-1' }),
    });
    assert.equal(duplicateMessage.status, 201);
    assert.equal(duplicateMessage.body.data.id, (await request(base, `/me/conversations/${conversation.body.data.id}/messages`, { headers: applicantHeaders })).body.data[0].id);
    assert.equal((await request(base, `/me/conversations/${conversation.body.data.id}/messages`, {
      method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ body: '好的，可以聊聊' }),
    })).status, 201);
    assert.equal((await request(base, `/me/conversations/${conversation.body.data.id}/read`, { method: 'POST', headers: recruiterHeaders })).status, 204);

    const application = await request(base, '/me/applications', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ recruitmentPostId: post.body.data.id, note: '有相关经验' }),
    });
    assert.equal(application.status, 201);
    const idempotentApplication = await request(base, '/me/applications', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ recruitmentPostId: post.body.data.id, note: '重复投递' }),
    });
    assert.equal(idempotentApplication.body.data.id, application.body.data.id);
    assert.equal((await request(base, `/me/applications/${application.body.data.id}`, {
      method: 'PATCH', headers: recruiterHeaders, body: JSON.stringify({ status: 'viewed' }),
    })).body.data.status, 'viewed');
    assert.equal((await request(base, `/me/applications/${application.body.data.id}`, {
      method: 'PATCH', headers: applicantHeaders, body: JSON.stringify({ status: 'hired' }),
    })).status, 403);

    const interview = await request(base, '/me/interviews', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({
        applicationId: application.body.data.id,
        applicantUserId: applicantSession.body.data.userId,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        locationText: '线上面试',
      }),
    });
    assert.equal(interview.status, 201);
    assert.equal((await request(base, `/me/interviews/${interview.body.data.id}/respond`, {
      method: 'POST', headers: applicantHeaders, body: JSON.stringify({ decision: 'accept' }),
    })).body.data.status, 'accepted');
    assert.equal((await request(base, `/me/interviews/${interview.body.data.id}/cancel`, {
      method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ reason: '时间冲突' }),
    })).body.data.status, 'cancelled');

    // Transactional start: first message is persisted with conversation creation.
    const secondConversation = await request(base, '/me/conversations', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({
        targetType: 'recruitment_post',
        targetId: post.body.data.id,
        body: '第二条开场白',
        clientRequestId: 'msg-open-2',
      }),
    });
    assert.equal(secondConversation.status, 201);
    const messages = await request(base, `/me/conversations/${secondConversation.body.data.id}/messages`, { headers: applicantHeaders });
    assert.ok(messages.body.data.some((item) => item.body === '你好，想了解岗位' || item.body === '第二条开场白'));

    // Block prevents new application after transaction-safe checks.
    await request(base, '/me/market-user-blocks', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({ targetType: 'applicant_information', targetId: applicantIdentity.body.data.id }),
    });
    // recruiter blocking applicant: applicant starts from recruitment_post so peer is recruiter.
    // Block the other direction for application creation from applicant.
    await request(base, '/me/market-user-blocks', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id }),
    });
    const blockedApplication = await request(base, '/me/applications', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ recruitmentPostId: post.body.data.id, note: '应被阻止' }),
    });
    // idempotent existing application still returns existing row if created before block
    assert.ok([201, 403].includes(blockedApplication.status));
  });
});

test('market user blocks hide targets from list, map, detail and favorites until unblocked', async () => {
  await withServer(async (base, app) => {
    const adminLogin = await request(base, '/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }) });
    const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };

    const applicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'block-applicant' }) });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant) });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });

    const recruiterSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'block-recruiter' }) });
    const recruiterHeaders = { authorization: `Bearer ${recruiterSession.body.data.sessionToken}` };
    const recruiterIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify(recruiter) });
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const post = await request(base, '/me/recruitment-posts', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({ jobType: '拉黑测试岗', salaryRange: '面议', settlementMethod: '月结', locationText: '上海', latitude: 31.01, longitude: 121.01, imageKeys: [] }),
    });
    assert.equal(post.status, 201);
    app.db.prepare('UPDATE recruitment_posts SET published_at = ? WHERE id = ?').run(post.body.data.publishedAt, post.body.data.id);

    assert.equal((await request(base, `/me/favorites/recruitment-posts/${post.body.data.id}`, { method: 'PUT', headers: applicantHeaders })).status, 204);
    const selfBlock = await request(base, '/me/market-user-blocks', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id }),
    });
    assert.equal(selfBlock.status, 422);
    assert.equal(selfBlock.body.error.code, 'INVALID_BLOCK_TARGET');

    const blocked = await request(base, '/me/market-user-blocks', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id }),
    });
    assert.equal(blocked.status, 201);
    assert.ok(blocked.body.data.blockId);
    assert.equal(blocked.body.data.role, 'recruiter');
    assert.equal('blockedUserId' in blocked.body.data, false);
    assert.equal('userId' in blocked.body.data, false);

    const idempotent = await request(base, '/me/market-user-blocks', {
      method: 'POST', headers: applicantHeaders,
      body: JSON.stringify({ targetType: 'recruitment_post', targetId: post.body.data.id }),
    });
    assert.equal(idempotent.status, 201);
    assert.equal(idempotent.body.data.blockId, blocked.body.data.blockId);

    const blocks = await request(base, '/me/market-user-blocks', { headers: applicantHeaders });
    assert.equal(blocks.status, 200);
    assert.equal(blocks.body.data.length, 1);
    assert.equal(blocks.body.data[0].blockId, blocked.body.data.blockId);

    const peerBlocks = await request(base, '/me/market-user-blocks', { headers: recruiterHeaders });
    assert.equal(peerBlocks.body.data.length, 0);

    const list = await request(base, '/market/recruitment-posts?jobType=%E6%8B%89%E9%BB%91%E6%B5%8B%E8%AF%95%E5%B2%97', { headers: applicantHeaders });
    assert.equal(list.body.data.items.length, 0);
    assert.equal(list.body.data.totalCount, 0);
    const map = await request(base, '/market/recruitment-posts/map?south=30.5&west=120.5&north=31.5&east=121.5&zoom=20&jobType=%E6%8B%89%E9%BB%91%E6%B5%8B%E8%AF%95%E5%B2%97', { headers: applicantHeaders });
    assert.equal(map.body.data.items.length, 0);
    assert.equal((await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders })).status, 404);
    const favorites = await request(base, '/me/favorites/recruitment-posts', { headers: applicantHeaders });
    assert.equal(favorites.body.data.length, 0);

    const otherApplicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'block-applicant-peer' }) });
    const otherApplicantHeaders = { authorization: `Bearer ${otherApplicantSession.body.data.sessionToken}` };
    const otherApplicantIdentity = await request(base, '/me/identities/applicant', {
      method: 'POST', headers: otherApplicantHeaders,
      body: JSON.stringify({ ...applicant, displayName: '其他求职者', contactPhone: '13600136011' }),
    });
    await request(base, `/admin/identity-reviews/${otherApplicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const peerList = await request(base, '/market/recruitment-posts?jobType=%E6%8B%89%E9%BB%91%E6%B5%8B%E8%AF%95%E5%B2%97', { headers: otherApplicantHeaders });
    assert.equal(peerList.body.data.items.some((item) => item.id === post.body.data.id), true);

    assert.equal((await request(base, `/me/market-user-blocks/${blocked.body.data.blockId}`, { method: 'DELETE', headers: recruiterHeaders })).status, 404);
    assert.equal((await request(base, `/me/market-user-blocks/${blocked.body.data.blockId}`, { method: 'DELETE', headers: applicantHeaders })).status, 204);

    const restoredList = await request(base, '/market/recruitment-posts?jobType=%E6%8B%89%E9%BB%91%E6%B5%8B%E8%AF%95%E5%B2%97', { headers: applicantHeaders });
    assert.equal(restoredList.body.data.items.some((item) => item.id === post.body.data.id), true);
    const restoredFavorites = await request(base, '/me/favorites/recruitment-posts', { headers: applicantHeaders });
    assert.equal(restoredFavorites.body.data.some((item) => item.id === post.body.data.id), true);
    const emptyBlocks = await request(base, '/me/market-user-blocks', { headers: applicantHeaders });
    assert.equal(emptyBlocks.body.data.length, 0);
  });
});

test('market publications expire from public surfaces and can be renewed', async () => {
  await withServer(async (base, app) => {
    const adminLogin = await request(base, '/admin/auth/login', { method: 'POST', body: JSON.stringify({ loginName: 'owner', password: 'OwnerPassword123!' }) });
    const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };

    const applicantSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'expiry-applicant' }) });
    const applicantHeaders = { authorization: `Bearer ${applicantSession.body.data.sessionToken}` };
    const applicantIdentity = await request(base, '/me/identities/applicant', { method: 'POST', headers: applicantHeaders, body: JSON.stringify(applicant) });
    await request(base, `/admin/identity-reviews/${applicantIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });

    const recruiterSession = await request(base, '/auth/wechat/session', { method: 'POST', body: JSON.stringify({ code: 'expiry-recruiter' }) });
    const recruiterHeaders = { authorization: `Bearer ${recruiterSession.body.data.sessionToken}` };
    const recruiterIdentity = await request(base, '/me/identities/recruiter', { method: 'POST', headers: recruiterHeaders, body: JSON.stringify(recruiter) });
    await request(base, `/admin/identity-reviews/${recruiterIdentity.body.data.id}/decision`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ decision: 'approved' }) });
    const post = await request(base, '/me/recruitment-posts', {
      method: 'POST', headers: recruiterHeaders,
      body: JSON.stringify({ jobType: '过期测试岗', salaryRange: '面议', settlementMethod: '月结', locationText: '上海', latitude: 31, longitude: 121, imageKeys: [] }),
    });
    assert.equal(post.status, 201);
    assert.ok(post.body.data.expiresAt);
    assert.equal((await request(base, `/me/favorites/recruitment-posts/${post.body.data.id}`, { method: 'PUT', headers: applicantHeaders })).status, 204);

    const listed = await request(base, '/market/recruitment-posts?jobType=%E8%BF%87%E6%9C%9F%E6%B5%8B%E8%AF%95%E5%B2%97', { headers: applicantHeaders });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.totalCount, 1);
    assert.equal(listed.body.data.items[0].id, post.body.data.id);

    const past = new Date(Date.now() - 60_000).toISOString();
    app.db.prepare('UPDATE recruitment_posts SET expires_at = ? WHERE id = ?').run(past, post.body.data.id);

    const expiredList = await request(base, '/market/recruitment-posts?jobType=%E8%BF%87%E6%9C%9F%E6%B5%8B%E8%AF%95%E5%B2%97', { headers: applicantHeaders });
    assert.equal(expiredList.body.data.totalCount, 0);
    assert.equal(expiredList.body.data.items.length, 0);
    assert.equal((await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders })).status, 404);
    const favorites = await request(base, '/me/favorites/recruitment-posts', { headers: applicantHeaders });
    assert.equal(favorites.body.data[0].status, 'expired');

    const renewed = await request(base, `/me/recruitment-posts/${post.body.data.id}/renew`, { method: 'POST', headers: recruiterHeaders });
    assert.equal(renewed.status, 200);
    assert.ok(new Date(renewed.body.data.expiresAt).getTime() > Date.now());
    const restored = await request(base, `/market/recruitment-posts/${post.body.data.id}`, { headers: applicantHeaders });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.data.contactPhone, recruiter.contactPhone);
  });
});
