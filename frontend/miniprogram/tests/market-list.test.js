const assert = require('assert');
const { mergeMarketItems, normalizeMarketItem } = require('../utils/market-list');

const normalized = normalizeMarketItem({
  id: 'post-1', coverImage: '/market/media/image-1', images: [{ id: 'image-1', url: '/market/media/image-1' }],
}, (url) => `https://api.example.com${url}`);
assert.strictEqual(normalized.coverImage, 'https://api.example.com/market/media/image-1');
assert.strictEqual(normalized.images[0].url, 'https://api.example.com/market/media/image-1');
assert.deepStrictEqual(mergeMarketItems([{ id: '1', value: 'old' }], [{ id: '1', value: 'new' }, { id: '2' }]), [
  { id: '1', value: 'new' }, { id: '2' },
]);

console.log('market list tests passed');
