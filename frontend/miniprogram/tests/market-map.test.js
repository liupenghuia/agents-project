const assert = require('assert');
const { boundsFromCenter, buildMapQuery, toMapMarkers } = require('../utils/market-map');

assert.deepStrictEqual(boundsFromCenter(31, 121, 0.5), { south: 30.5, west: 120.5, north: 31.5, east: 121.5 });
assert.deepStrictEqual(buildMapQuery({ south: 30, west: 120, north: 32, east: 122 }, 10.4, ' 木工 ', 'applicant'), {
  south: 30, west: 120, north: 32, east: 122, zoom: 10, limit: 50, jobType: '木工',
});
assert.strictEqual(buildMapQuery({ south: 30, west: 120, north: 32, east: 122 }, 30, '电工', 'recruiter').zoom, 20);

const mapped = toMapMarkers([
  { cluster: true, count: 8, latitude: 31.2, longitude: 121.4 },
  { id: 'post-1', cluster: false, jobType: '木工', latitude: 31.3, longitude: 121.5 },
], 'applicant');
assert.strictEqual(mapped.markers.length, 2);
assert.strictEqual(mapped.markers[0].callout.content, '8 条信息');
assert.strictEqual(mapped.targets[2].id, 'post-1');
assert.notStrictEqual(mapped.markers[0].callout.bgColor, mapped.markers[1].callout.bgColor);

console.log('market map tests passed');
