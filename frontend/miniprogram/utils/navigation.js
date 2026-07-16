const {
  getActiveRole,
  setActiveRole,
  saveMarketWorkspace,
  normalizeRole,
  normalizeMode,
} = require('./workspace');

const MAIN_TABS = {
  map: '/pages/market/market',
  list: '/pages/market-list/market-list',
  my: '/pages/my-center/my-center',
};

function getNavigator(api) {
  return api || (typeof wx === 'undefined' ? null : wx);
}

function resolveRole(role) {
  return normalizeRole(role) || getActiveRole() || 'applicant';
}

function openMainTab(tab, options = {}, api) {
  const platform = getNavigator(api);
  const key = tab === 'list' || tab === 'my' || tab === 'map' ? tab : normalizeMode(options.mode) === 'list' ? 'list' : 'map';
  const role = resolveRole(options.role);
  setActiveRole(role, platform);

  if (key === 'map' || key === 'list') {
    saveMarketWorkspace(role, { mode: key }, platform);
  }

  const url = MAIN_TABS[key];
  if (!platform) return { method: 'switchTab', url, role, tab: key };

  if (typeof platform.switchTab === 'function') {
    platform.switchTab({
      url,
      fail: () => {
        if (typeof platform.reLaunch === 'function') platform.reLaunch({ url });
      },
    });
  } else if (typeof platform.reLaunch === 'function') {
    platform.reLaunch({ url });
  }
  return { method: 'switchTab', url, role, tab: key };
}

function openRoleHome(role, identityId, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const query = identityId ? `?role=${normalized}&identityId=${encodeURIComponent(identityId)}` : `?role=${normalized}`;
  const url = `/pages/role-home/role-home${query}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

function enterApprovedRole(role, identityId, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  saveMarketWorkspace(normalized, { mode: 'map' }, platform);
  return openMainTab('map', { role: normalized }, platform);
}

function openFavorites(role, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const url = `/pages/favorites/favorites?role=${normalized}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

function openMessages(role, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const url = `/pages/messages/messages?role=${normalized}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

function openApplications(role, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const url = `/pages/applications/applications?role=${normalized}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

function openInterviews(role, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const url = `/pages/interviews/interviews?role=${normalized}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

function openMarketDetail(role, id, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const url = `/pages/market-detail/market-detail?role=${normalized}&id=${encodeURIComponent(id)}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

function openProfile(role, api) {
  const platform = getNavigator(api);
  const normalized = resolveRole(role);
  setActiveRole(normalized, platform);
  const url = `/pages/profile/profile?role=${normalized}`;
  if (platform && platform.navigateTo) platform.navigateTo({ url });
  return url;
}

module.exports = {
  MAIN_TABS,
  openMainTab,
  openRoleHome,
  enterApprovedRole,
  openFavorites,
  openMessages,
  openApplications,
  openInterviews,
  openMarketDetail,
  openProfile,
  resolveRole,
};
