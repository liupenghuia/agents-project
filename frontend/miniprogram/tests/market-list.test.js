const assert = require('assert');
const {
  mergeMarketItems,
  normalizeMarketItem,
  formatPublishedAt,
  formatSalary,
  toMapPreview,
} = require('../utils/market-list');

const normalized = normalizeMarketItem({
  id: 'post-1',
  coverImage: '/market/media/image-1',
  images: [{ id: 'image-1', url: '/market/media/image-1' }],
  publishedAt: '2026-07-14T15:22:49.800Z',
  salaryRange: '60000',
}, (url) => `https://api.example.com${url}`);
assert.strictEqual(normalized.coverImage, 'https://api.example.com/market/media/image-1');
assert.strictEqual(normalized.images[0].url, 'https://api.example.com/market/media/image-1');
assert.strictEqual(normalized.publishedAtLabel, '2026-07-14');
assert.strictEqual(normalized.salaryLabel, '6万');
assert.strictEqual(formatPublishedAt('2026-07-14T15:22:49.800Z'), '2026-07-14');
assert.strictEqual(formatSalary('60000'), '6万');
assert.strictEqual(formatSalary('5K-8K'), '5K-8K');
assert.deepStrictEqual(mergeMarketItems([{ id: '1', value: 'old' }], [{ id: '1', value: 'new' }, { id: '2' }]), [
  { id: '1', value: 'new' }, { id: '2' },
]);

const applicantPreview = toMapPreview({
  id: 'post-1',
  jobType: '木工',
  salaryRange: '60000',
  locationText: '浦东新区',
  publishedAt: '2026-07-14T15:22:49.800Z',
  cluster: false,
}, 'applicant');
assert.strictEqual(applicantPreview.title, '木工');
assert.strictEqual(applicantPreview.salaryLabel, '6万');
assert.strictEqual(applicantPreview.locationText, '浦东新区');
assert.strictEqual(applicantPreview.publishedAtLabel, '2026-07-14');
assert.strictEqual(toMapPreview({ cluster: true, count: 3 }, 'applicant'), null);
assert.strictEqual(toMapPreview(null, 'applicant'), null);
const recruiterPreview = toMapPreview({
  id: 'app-1',
  jobTypeName: '电工',
  expectedSalary: '5K-8K',
}, 'recruiter');
assert.strictEqual(recruiterPreview.title, '电工');
assert.strictEqual(recruiterPreview.salaryLabel, '5K-8K');

console.log('market list tests passed');
