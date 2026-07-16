const test = require('node:test');
const assert = require('node:assert/strict');
const marketApp = require('../services/market-app');

test('toApiFilters maps applicant filters to job-seeking query fields', () => {
  assert.deepEqual(marketApp.toApiFilters('applicant', {
    jobType: '焊工',
    salaryRange: '8k',
    workMethod: 'monthly_settlement',
    location: '上海',
  }), {
    jobTypeName: '焊工',
    expectedSalary: '8k',
    workMethod: 'monthly_settlement',
    location: '上海',
    publishedFrom: '',
    publishedTo: '',
  });
});

test('toApiFilters maps recruiter filters to recruitment query fields', () => {
  assert.deepEqual(marketApp.toApiFilters('recruiter', {
    jobType: '普工',
    salaryRange: '日结',
    workMethod: 'indefinite_duration',
    location: '浦东',
  }), {
    jobType: '普工',
    salaryRange: '日结',
    settlementMethod: 'indefinite_duration',
    location: '浦东',
    publishedFrom: '',
    publishedTo: '',
  });
});

test('summarizeFilters joins non-empty filters', () => {
  assert.equal(marketApp.summarizeFilters({ jobType: '焊工', location: '', salaryRange: '8k' }), 'jobType:焊工 · salaryRange:8k');
  assert.equal(marketApp.summarizeFilters({}), '');
});

test('applyFavoriteToItems updates matching item only', () => {
  const items = [
    { id: 'a', isFavorited: false },
    { id: 'b', isFavorited: true },
  ];
  const next = marketApp.applyFavoriteToItems(items, 'a', true);
  assert.equal(next[0].isFavorited, true);
  assert.equal(next[1].isFavorited, true);
  assert.notEqual(next, items);
});

test('fetchMarketList maps and merges pages', async () => {
  const api = {
    resolveMediaUrl: (url) => url,
    listMarketRecruitmentPosts: async ({ cursor }) => {
      if (cursor) {
        return { items: [{ id: '2', jobType: 'B', status: 'published' }], nextCursor: null, totalCount: 2 };
      }
      return { items: [{ id: '1', jobType: 'A', status: 'published' }], nextCursor: 'c1', totalCount: 2 };
    },
    listMarketJobSeekingInformation: async () => ({ items: [] }),
  };

  const first = await marketApp.fetchMarketList(api, {
    role: 'applicant',
    keyword: '',
    filters: {},
  });
  assert.equal(first.items.length, 1);
  assert.equal(first.nextCursor, 'c1');
  assert.equal(first.totalCount, 2);

  const second = await marketApp.fetchMarketList(api, {
    role: 'applicant',
    append: true,
    cursor: 'c1',
    existingItems: first.items,
  });
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
});

test('toggleFavorite returns updated selected state', async () => {
  const calls = [];
  const api = {
    favoriteRecruitmentPost: async (id) => { calls.push(['fav', id]); },
    unfavoriteRecruitmentPost: async (id) => { calls.push(['unfav', id]); },
  };
  const result = await marketApp.toggleFavorite(api, {
    role: 'applicant',
    item: { id: 'p1', isFavorited: false },
    shouldFavorite: true,
  });
  assert.deepEqual(calls, [['fav', 'p1']]);
  assert.equal(result.selected.isFavorited, true);
});
