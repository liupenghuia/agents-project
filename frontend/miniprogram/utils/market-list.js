function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatPublishedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16);
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatSalary(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  if (!text) return '';
  if (/[万千Kk¥￥元\/]/.test(text)) return text;
  const num = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(num)) return text;
  if (num >= 10000 && num % 1000 === 0) {
    const wan = num / 10000;
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`;
  }
  return `¥${num.toLocaleString('zh-CN')}`;
}

function normalizeMarketItem(item, resolveMediaUrl) {
  const images = (item.images || []).map((image) => ({ ...image, url: resolveMediaUrl(image.url) }));
  const salaryRaw = item.salaryRange || item.expectedSalary || '';
  return {
    ...item,
    images,
    ...(item.coverImage ? { coverImage: resolveMediaUrl(item.coverImage) } : {}),
    publishedAtLabel: formatPublishedAt(item.publishedAt),
    salaryLabel: formatSalary(salaryRaw),
  };
}

function mergeMarketItems(current, incoming) {
  const items = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => items.set(item.id, item));
  return Array.from(items.values());
}

/**
 * Build a map bottom-sheet preview model from a map projection item.
 * Map APIs return a slim projection (no images); keep instant open, no extra fetch.
 */
function toMapPreview(item, role = 'applicant') {
  if (!item || item.cluster || !item.id) return null;
  const salaryRaw = item.salaryRange || item.expectedSalary || '';
  const title = role === 'applicant'
    ? (item.jobType || item.jobTypeName || '职位信息')
    : (item.jobTypeName || item.jobType || '求职信息');
  return {
    ...item,
    title,
    salaryLabel: formatSalary(salaryRaw) || salaryRaw || '面议',
    locationText: item.locationText || '位置待完善',
    publishedAtLabel: formatPublishedAt(item.publishedAt),
    isFavorited: Boolean(item.isFavorited),
  };
}

module.exports = {
  mergeMarketItems,
  normalizeMarketItem,
  formatPublishedAt,
  formatSalary,
  toMapPreview,
};
