const assert = require('assert');
const { labels, ownerStatusView, savedMessage } = require('../utils/market-status');

assert.strictEqual(labels.changes_requested, '已打回');
assert.deepStrictEqual(ownerStatusView({ status: 'changes_requested' }, true), {
  label: '已打回', message: '审核要求修改，请按原因调整后重新提交', submitLabel: '重新提交审核',
});
assert.strictEqual(ownerStatusView({ status: 'disabled' }, true).submitLabel, '保存并重新发布');
assert.strictEqual(ownerStatusView({ status: 'disabled', moderatedAt: '2026-07-14T00:00:00.000Z' }, true).submitLabel, '保存修改');
assert.strictEqual(ownerStatusView({ status: 'pending_review' }, true).message, '已提交审核，审核通过后恢复公开');
assert.strictEqual(savedMessage('pending_review'), '已重新提交审核');

console.log('market status tests passed');
