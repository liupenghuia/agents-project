const { createSession } = require('./services/api');

App({
  globalData: {
    session: null,
    identities: [],
  },

  onLaunch() {
    const session = wx.getStorageSync('platformSession');
    if (session && session.sessionToken && new Date(session.expiresAt).getTime() > Date.now()) {
      this.globalData.session = session;
    }
  },

  ensureSession() {
    if (this.globalData.session) return Promise.resolve(this.globalData.session);
    return new Promise((resolve, reject) => {
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
    });
  },
});
