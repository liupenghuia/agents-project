/**
 * Market application service: orchestration + mapping between API and page state.
 * Pages own setData / lifecycle; this module owns filters, list/map load, favorite/report/block.
 */

const { boundsFromCenter, buildMapQuery, toMapMarkers } = require('../utils/market-map');
const { mergeMarketItems, normalizeMarketItem } = require('../utils/market-list');
const { matchMarketItem } = require('../utils/matching');

const DEFAULT_CENTER = { latitude: 31.2304, longitude: 121.4737 };
const FILTERS_KEY = (role) => `marketFilters:${role}`;
const RECENT_KEY = (role) => `marketRecent:${role}`;

function summarizeFilters(filters = {}) {
  return Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}:${value}`)
    .join(' · ');
}

function toApiFilters(role, filters = {}) {
  return role === 'applicant'
    ? {
      jobTypeName: filters.jobType || '',
      expectedSalary: filters.salaryRange || '',
      workMethod: filters.workMethod || '',
      location: filters.location || '',
      publishedFrom: filters.publishedFrom || '',
      publishedTo: filters.publishedTo || '',
    }
    : {
      jobType: filters.jobType || '',
      salaryRange: filters.salaryRange || '',
      settlementMethod: filters.workMethod || '',
      location: filters.location || '',
      publishedFrom: filters.publishedFrom || '',
      publishedTo: filters.publishedTo || '',
    };
}

function targetTypeForRole(role) {
  return role === 'applicant' ? 'recruitment_post' : 'applicant_information';
}

function readStorageArray(key) {
  try {
    return wx.getStorageSync(key) || [];
  } catch (error) {
    return [];
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // ignore storage failures in restricted environments
  }
}

function loadFilterHistory(role) {
  return {
    savedFilters: readStorageArray(FILTERS_KEY(role)),
    recentSearches: readStorageArray(RECENT_KEY(role)),
  };
}

function persistRecentSearch(role, filters, keyword) {
  if (!Object.values(filters || {}).some(Boolean) && !keyword) return readStorageArray(RECENT_KEY(role));
  const entry = { ...filters, keyword, savedAt: Date.now() };
  const recent = [entry, ...readStorageArray(RECENT_KEY(role))]
    .filter((item, index, list) => list.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index)
    .slice(0, 5);
  writeStorage(RECENT_KEY(role), recent);
  return recent;
}

function saveFiltersPreset(role, filters, keyword) {
  const entry = { ...filters, keyword };
  if (!Object.values(entry).some(Boolean)) {
    return { ok: false, message: '没有可保存的条件', savedFilters: readStorageArray(FILTERS_KEY(role)) };
  }
  const next = [entry, ...readStorageArray(FILTERS_KEY(role))]
    .filter((item, index, list) => list.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index)
    .slice(0, 8);
  writeStorage(FILTERS_KEY(role), next);
  return { ok: true, savedFilters: next };
}

function deleteSavedFilter(role, index) {
  const next = readStorageArray(FILTERS_KEY(role)).filter((_, itemIndex) => itemIndex !== index);
  writeStorage(FILTERS_KEY(role), next);
  return next;
}

function mapListItems(items, resolveMediaUrl, viewerProfile) {
  return (items || []).map((item) => {
    const normalized = normalizeMarketItem(item, resolveMediaUrl);
    const matching = matchMarketItem(normalized, viewerProfile);
    return matching.reasons.length
      ? { ...normalized, matchScore: matching.score, matchReasons: matching.reasons }
      : normalized;
  });
}

/**
 * @param {object} api services/api exports
 * @param {object} params
 */
function fetchMarketList(api, {
  role,
  keyword = '',
  filters = {},
  cursor = null,
  append = false,
  existingItems = [],
  viewerProfile = null,
}) {
  const action = role === 'applicant' ? api.listMarketRecruitmentPosts : api.listMarketJobSeekingInformation;
  return action({
    keyword,
    ...toApiFilters(role, filters),
    ...(append && cursor ? { cursor } : {}),
  }).then((result) => {
    const incoming = mapListItems(result.items, api.resolveMediaUrl, viewerProfile);
    return {
      items: append ? mergeMarketItems(existingItems, incoming) : incoming,
      nextCursor: result.nextCursor || null,
      totalCount: typeof result.totalCount === 'number' ? result.totalCount : null,
    };
  });
}

/**
 * @param {object} api
 * @param {object} params
 */
function fetchMarketMap(api, {
  role,
  bounds,
  scale,
  keyword = '',
  filters = {},
}) {
  const query = {
    ...buildMapQuery(bounds, scale, keyword, role),
    ...toApiFilters(role, filters),
  };
  const action = role === 'applicant' ? api.mapMarketRecruitmentPosts : api.mapMarketJobSeekingInformation;
  return action(query).then((result) => {
    const mapped = toMapMarkers(result.items, role);
    return {
      markers: mapped.markers,
      markerTargets: mapped.targets,
    };
  });
}

function toggleFavorite(api, { role, item, shouldFavorite }) {
  const action = role === 'applicant'
    ? (shouldFavorite ? api.favoriteRecruitmentPost : api.unfavoriteRecruitmentPost)
    : (shouldFavorite ? api.favoriteJobSeekingInformation : api.unfavoriteJobSeekingInformation);
  return action(item.id).then(() => ({
    selected: { ...item, isFavorited: shouldFavorite },
    shouldFavorite,
  }));
}

function reportItem(api, { role, item, reason }) {
  return api.createMarketReport({
    targetType: targetTypeForRole(role),
    targetId: item.id,
    reason,
  });
}

function blockPublisher(api, { role, item }) {
  return api.createMarketUserBlock({
    targetType: targetTypeForRole(role),
    targetId: item.id,
  });
}

function applyFavoriteToItems(items, itemId, isFavorited) {
  return (items || []).map((candidate) => (
    candidate.id === itemId ? { ...candidate, isFavorited } : candidate
  ));
}

function fallbackBounds() {
  return boundsFromCenter(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude);
}

module.exports = {
  DEFAULT_CENTER,
  summarizeFilters,
  toApiFilters,
  loadFilterHistory,
  persistRecentSearch,
  saveFiltersPreset,
  deleteSavedFilter,
  fetchMarketList,
  fetchMarketMap,
  toggleFavorite,
  reportItem,
  blockPublisher,
  applyFavoriteToItems,
  fallbackBounds,
  boundsFromCenter,
};
