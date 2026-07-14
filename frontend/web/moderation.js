(function expose(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MarketModeration = api;
}(typeof window === 'undefined' ? null : window, () => {
  const statusLabels = {
    published: '已发布',
    pending_review: '待审核',
    changes_requested: '已打回',
    disabled: '已下架',
  };
  const targetTypeLabels = { recruitment_post: '招聘信息', applicant_information: '求职信息' };
  const decisionLabels = { approve: '通过', request_changes: '打回', disable: '下架', restore: '恢复' };
  const decisionsByStatus = {
    published: ['request_changes', 'disable'],
    pending_review: ['approve', 'request_changes', 'disable'],
    changes_requested: ['disable'],
    disabled: ['restore'],
  };

  const decisionsFor = (status) => decisionsByStatus[status] ? [...decisionsByStatus[status]] : [];
  const toIso = (value) => value ? new Date(value).toISOString() : '';
  const buildQuery = ({ targetType = '', status = '', publishedFrom = '', publishedTo = '' } = {}) => {
    const query = new URLSearchParams();
    if (targetType) query.set('targetType', targetType);
    if (status) query.set('status', status);
    if (publishedFrom) query.set('publishedFrom', toIso(publishedFrom));
    if (publishedTo) query.set('publishedTo', toIso(publishedTo));
    const value = query.toString();
    return value ? `?${value}` : '';
  };

  return { buildQuery, decisionLabels, decisionsFor, statusLabels, targetTypeLabels };
}));
