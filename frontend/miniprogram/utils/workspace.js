const ACTIVE_ROLE_KEY = 'activeRole';
const WORKSPACES_KEY = 'marketWorkspaces';

function normalizeRole(role) {
  return role === 'recruiter' ? 'recruiter' : role === 'applicant' ? 'applicant' : null;
}

function normalizeMode(mode) {
  return mode === 'list' ? 'list' : 'map';
}

function emptyMarketWorkspace() {
  return { mode: 'map', keyword: '', filters: {}, scale: 11 };
}

function readStorage(api, key, fallback) {
  try {
    const value = api.getStorageSync(key);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(api, key, value) {
  try {
    api.setStorageSync(key, value);
  } catch (error) {
    // Storage may be unavailable in tests or restricted environments.
  }
}

function removeStorage(api, key) {
  try {
    api.removeStorageSync(key);
  } catch (error) {
    // ignore
  }
}

function getWx(api) {
  return api || (typeof wx === 'undefined' ? null : wx);
}

function getActiveRole(api) {
  return normalizeRole(readStorage(getWx(api), ACTIVE_ROLE_KEY, null));
}

function setActiveRole(role, api) {
  const normalized = normalizeRole(role);
  const platform = getWx(api);
  if (!normalized) {
    removeStorage(platform, ACTIVE_ROLE_KEY);
    return null;
  }
  writeStorage(platform, ACTIVE_ROLE_KEY, normalized);
  return normalized;
}

function readAllWorkspaces(api) {
  const raw = readStorage(getWx(api), WORKSPACES_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

function getMarketWorkspace(role, api) {
  const normalizedRole = normalizeRole(role) || getActiveRole(api) || 'applicant';
  const all = readAllWorkspaces(api);
  const saved = all[normalizedRole] || {};
  return {
    role: normalizedRole,
    mode: normalizeMode(saved.mode),
    keyword: typeof saved.keyword === 'string' ? saved.keyword : '',
    filters: saved.filters && typeof saved.filters === 'object' ? { ...saved.filters } : {},
    scale: Number.isFinite(Number(saved.scale)) ? Number(saved.scale) : 11,
  };
}

function saveMarketWorkspace(role, patch = {}, api) {
  const normalizedRole = normalizeRole(role) || getActiveRole(api) || 'applicant';
  const platform = getWx(api);
  const all = readAllWorkspaces(platform);
  const current = getMarketWorkspace(normalizedRole, platform);
  const next = {
    mode: patch.mode !== undefined ? normalizeMode(patch.mode) : current.mode,
    keyword: patch.keyword !== undefined ? String(patch.keyword || '') : current.keyword,
    filters: patch.filters !== undefined ? { ...(patch.filters || {}) } : current.filters,
    scale: patch.scale !== undefined && Number.isFinite(Number(patch.scale)) ? Number(patch.scale) : current.scale,
  };
  all[normalizedRole] = next;
  writeStorage(platform, WORKSPACES_KEY, all);

  const app = typeof getApp === 'function' ? getApp() : null;
  if (app && app.globalData) {
    app.globalData.workspaces = all;
    app.globalData.activeRole = normalizedRole;
  }
  return { role: normalizedRole, ...next };
}

function hydrateAppWorkspace(appLike, api) {
  const platform = getWx(api);
  const activeRole = getActiveRole(platform);
  const workspaces = readAllWorkspaces(platform);
  if (appLike && appLike.globalData) {
    appLike.globalData.activeRole = activeRole;
    appLike.globalData.workspaces = workspaces;
  }
  return { activeRole, workspaces };
}

function clearWorkspaceState(api) {
  const platform = getWx(api);
  removeStorage(platform, ACTIVE_ROLE_KEY);
  removeStorage(platform, WORKSPACES_KEY);
  const app = typeof getApp === 'function' ? getApp() : null;
  if (app && app.globalData) {
    app.globalData.activeRole = null;
    app.globalData.workspaces = {};
  }
}

module.exports = {
  ACTIVE_ROLE_KEY,
  WORKSPACES_KEY,
  normalizeRole,
  normalizeMode,
  emptyMarketWorkspace,
  getActiveRole,
  setActiveRole,
  getMarketWorkspace,
  saveMarketWorkspace,
  hydrateAppWorkspace,
  clearWorkspaceState,
};
