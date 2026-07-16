const assert = require('assert');
const {
  normalizeRole,
  normalizeMode,
  getActiveRole,
  setActiveRole,
  getMarketWorkspace,
  saveMarketWorkspace,
  clearWorkspaceState,
  hydrateAppWorkspace,
} = require('../utils/workspace');
const navigation = require('../utils/navigation');

const memory = {};
const api = {
  getStorageSync: (key) => (Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : ''),
  setStorageSync: (key, value) => { memory[key] = value; },
  removeStorageSync: (key) => { delete memory[key]; },
};

global.getApp = () => ({ globalData: { workspaces: {}, activeRole: null } });

assert.strictEqual(normalizeRole('recruiter'), 'recruiter');
assert.strictEqual(normalizeRole('nope'), null);
assert.strictEqual(normalizeMode('list'), 'list');
assert.strictEqual(normalizeMode('map'), 'map');

clearWorkspaceState(api);
assert.strictEqual(setActiveRole('applicant', api), 'applicant');
assert.strictEqual(getActiveRole(api), 'applicant');

const saved = saveMarketWorkspace('applicant', {
  mode: 'list',
  keyword: '木工',
  filters: { jobType: '木工' },
  scale: 14,
}, api);
assert.strictEqual(saved.mode, 'list');
assert.strictEqual(saved.keyword, '木工');
assert.deepStrictEqual(getMarketWorkspace('applicant', api).filters, { jobType: '木工' });

const hydrated = hydrateAppWorkspace({ globalData: {} }, api);
assert.strictEqual(hydrated.activeRole, 'applicant');
assert.ok(hydrated.workspaces.applicant);

const calls = [];
const navApi = {
  ...api,
  switchTab: ({ url }) => { calls.push(['switchTab', url]); },
  navigateTo: ({ url }) => { calls.push(['navigateTo', url]); },
  reLaunch: ({ url }) => { calls.push(['reLaunch', url]); },
};

const main = navigation.openMainTab('list', { role: 'recruiter' }, navApi);
assert.strictEqual(main.tab, 'list');
assert.strictEqual(main.url, navigation.MAIN_TABS.list);
assert.strictEqual(getActiveRole(navApi), 'recruiter');
assert.deepStrictEqual(calls[0], ['switchTab', navigation.MAIN_TABS.list]);

const detail = navigation.openMarketDetail('recruiter', 'post-1', navApi);
assert.ok(detail.includes('market-detail'));
assert.ok(detail.includes('post-1'));
assert.ok(calls.some((item) => item[0] === 'navigateTo'));

const entered = navigation.enterApprovedRole('applicant', 'id-1', navApi);
assert.strictEqual(entered.tab, 'map');
assert.strictEqual(getMarketWorkspace('applicant', navApi).mode, 'map');

console.log('navigation and workspace tests passed');
