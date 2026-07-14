const assert = require('assert');
const moderation = require('../moderation');

assert.deepStrictEqual(moderation.decisionsFor('published'), ['request_changes', 'disable']);
assert.deepStrictEqual(moderation.decisionsFor('pending_review'), ['approve', 'request_changes', 'disable']);
assert.deepStrictEqual(moderation.decisionsFor('disabled'), ['restore']);
assert.deepStrictEqual(moderation.decisionsFor('unknown'), []);
assert.strictEqual(moderation.statusLabels.changes_requested, '已打回');
assert.strictEqual(moderation.targetTypeLabels.recruitment_post, '招聘信息');
assert.strictEqual(
  moderation.buildQuery({ targetType: 'applicant_information', status: 'pending_review' }),
  '?targetType=applicant_information&status=pending_review',
);
assert.match(moderation.buildQuery({ publishedFrom: '2026-07-14T08:30' }), /^\?publishedFrom=2026-07-14T/);

console.log('web moderation tests passed');
