const labels = {
  published: '公开中',
  pending_review: '待审核',
  changes_requested: '已打回',
  disabled: '已下架',
};

function ownerStatusView(item = {}, existing = false) {
  const status = item.status || '';
  const adminDisabled = status === 'disabled' && Boolean(item.moderationReason || item.moderatedAt);
  const messages = {
    published: '当前公开展示中',
    pending_review: '已提交审核，审核通过后恢复公开',
    changes_requested: '审核要求修改，请按原因调整后重新提交',
    disabled: adminDisabled ? '管理员已下架，修改后仍需管理员恢复' : '当前已下架，修改后可重新发布',
  };
  const submitLabels = {
    published: existing ? '保存修改' : '提交信息',
    pending_review: '保存待审核内容',
    changes_requested: '重新提交审核',
    disabled: adminDisabled ? '保存修改' : '保存并重新发布',
  };
  return {
    label: labels[status] || '未发布',
    message: messages[status] || '',
    submitLabel: submitLabels[status] || (existing ? '保存修改' : '提交信息'),
  };
}

function savedMessage(status) {
  if (status === 'pending_review') return '已重新提交审核';
  if (status === 'disabled') return '修改已保存';
  return '信息已保存';
}

module.exports = { labels, ownerStatusView, savedMessage };
