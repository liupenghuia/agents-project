import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertJobSeekingInformation,
  assertRecruitmentPost,
  assertManagedUser,
  assertMarketTarget,
  assertMarketModerationDecision,
  assertIdentityReviewDecision,
  assertConversationTarget,
  assertMessageBody,
  assertApplicationCreate,
  assertApplicationStatus,
  assertInterviewCreate,
  assertInterviewResponseDecision,
  assertInterviewCancelReason,
  marketMapQuery,
  marketListQuery,
  validateProfile,
  detectImageContentType,
} from '../src/domain/validators.js';

function urlWith(query) {
  return new URL(`http://localhost/x?${query}`);
}

test('validates applicant job-seeking information and rejects bad age', () => {
  const valid = assertJobSeekingInformation({
    jobTypeName: '木工',
    age: 28,
    expectedSalary: '面议',
    workMethod: 'monthly_settlement',
    locationText: '上海',
    latitude: 31.2,
    longitude: 121.4,
  });
  assert.equal(valid.age, 28);
  assert.throws(
    () => assertJobSeekingInformation({
      jobTypeName: '木工',
      age: 0,
      expectedSalary: '面议',
      workMethod: 'monthly_settlement',
      locationText: '上海',
      latitude: 31.2,
      longitude: 121.4,
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('validates recruitment posts and image key limits', () => {
  const valid = assertRecruitmentPost({
    jobType: '电工',
    salaryRange: '日薪 500',
    settlementMethod: '日结',
    locationText: '上海',
    latitude: 31,
    longitude: 121,
    imageKeys: ['a', 'b'],
  });
  assert.deepEqual(valid.imageKeys, ['a', 'b']);
  assert.throws(
    () => assertRecruitmentPost({
      jobType: '电工',
      salaryRange: '日薪 500',
      settlementMethod: '日结',
      locationText: '上海',
      latitude: 31,
      longitude: 121,
      imageKeys: ['1', '2', '3', '4', '5', '6', '7'],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('validates managed users and market targets', () => {
  assert.equal(assertManagedUser({ email: 'a@b.com', name: '张三' }).email, 'a@b.com');
  assert.throws(() => assertManagedUser({ email: 'bad', name: '张三' }), (error) => error.code === 'VALIDATION_ERROR');
  assert.equal(assertMarketTarget({
    targetType: 'recruitment_post',
    targetId: 'post-1',
    reason: 'spam',
  }).targetId, 'post-1');
  assert.throws(
    () => assertMarketTarget({ targetType: 'other', targetId: 'x', reason: 'y' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('validates moderation and identity review decisions', () => {
  assert.equal(assertMarketModerationDecision({ decision: 'approve' }).decision, 'approve');
  assert.throws(
    () => assertMarketModerationDecision({ decision: 'request_changes' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(assertIdentityReviewDecision('approved').decision, 'approved');
  assert.throws(
    () => assertIdentityReviewDecision('changes_requested', ''),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('parses market map and list query bounds', () => {
  const map = marketMapQuery(urlWith('south=30&west=120&north=31&east=121&zoom=12&limit=20'));
  assert.equal(map.zoom, 12);
  assert.throws(
    () => marketMapQuery(urlWith('south=31&west=121&north=30&east=120&zoom=12')),
    (error) => error.code === 'INVALID_MAP_VIEWPORT',
  );
  const list = marketListQuery(urlWith('limit=10&keyword=木工&sort=newest'));
  assert.equal(list.limit, 10);
  assert.equal(list.keyword, '木工');
  assert.throws(
    () => marketListQuery(urlWith('limit=10&sort=nearest')),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('validates identity profiles by role', () => {
  const recruiter = validateProfile('recruiter', {
    organizationName: '主体',
    organizationType: 'company',
    contactName: '联系人',
    contactPhone: '13800138000',
    region: '上海',
    industryOrJobDirection: '软件',
  });
  assert.equal(recruiter.organizationType, 'company');
  assert.throws(
    () => validateProfile('recruiter', {
      organizationName: '主体',
      organizationType: 'unknown',
      contactName: '联系人',
      contactPhone: '13800138000',
      region: '上海',
      industryOrJobDirection: '软件',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('detects common image content types', () => {
  assert.equal(detectImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), 'image/jpeg');
  assert.equal(detectImageContentType(Buffer.from([0x00, 0x01])), null);
});

test('validates collaboration payloads', () => {
  assert.equal(assertConversationTarget({
    targetType: 'recruitment_post',
    targetId: 'post-1',
    body: '你好',
  }).targetId, 'post-1');
  assert.equal(assertMessageBody('  hello  '), 'hello');
  assert.throws(() => assertMessageBody(''), (error) => error.code === 'VALIDATION_ERROR');
  assert.equal(assertApplicationCreate({ recruitmentPostId: 'p1', note: 'x'.repeat(600) }).note.length, 500);
  assert.equal(assertApplicationStatus('viewed'), 'viewed');
  assert.throws(() => assertApplicationStatus('nope'), (error) => error.code === 'VALIDATION_ERROR');
  const interview = assertInterviewCreate({
    applicantUserId: 'u1',
    scheduledAt: '2026-08-01T10:00:00.000Z',
    locationText: '上海',
  });
  assert.equal(interview.locationText, '上海');
  assert.equal(assertInterviewResponseDecision('accept'), 'accept');
  assert.equal(assertInterviewCancelReason('改期'), '改期');
});
