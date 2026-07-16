const { createSession } = require('./services/api');
const { resolveApiBaseUrl } = require('./config');
const { hydrateAppWorkspace, clearWorkspaceState } = require('./utils/workspace');

function sessionValid(session) {
  return Boolean(session && session.sessionToken && new Date(session.expiresAt).getTime() > Date.now());
}

App({
  globalData: {
    session: null,
    identities: [],
    workspaces: {},
    activeRole: null,
    apiBaseUrl: '',
  },

  onLaunch() {
    this.globalData.apiBaseUrl = resolveApiBaseUrl();
    hydrateAppWorkspace(this);
    const session = wx.getStorageSync('platformSession');
    if (sessionValid(session)) this.globalData.session = session;
    else wx.removeStorageSync('platformSession');
  },

  clearSession() {
    this.globalData.session = null;
    this.globalData.identities = [];
    clearWorkspaceState();
    wx.removeStorageSync('platformSession');
  },

  ensureSession() {
    if (sessionValid(this.globalData.session)) return Promise.resolve(this.globalData.session);
    this.clearSession();
    if (this._sessionPromise) return this._sessionPromise;
    this._sessionPromise = new Promise((resolve, reject) => {
      wx.login({
        success: ({ code }) => {
          if (!code) {
            reject(new Error('微信登录未返回有效凭证，请重试'));
            return;
          }
          createSession(code).then((session) => {
            this.globalData.session = session;
            wx.setStorageSync('platformSession', session);
            resolve(session);
          }).catch(reject);
        },
        fail: () => reject(new Error('微信登录已取消或暂时不可用，请重试')),
      });
    }).finally(() => { this._sessionPromise = null; });
    return this._sessionPromise;
  },
});
