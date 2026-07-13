const BASE_URL = 'http://localhost:3000';

function request(path, options = {}) {
  const app = getApp();
  const session = app && app.globalData.session;
  const header = { 'content-type': 'application/json', ...(options.header || {}) };
  if (session && session.sessionToken) header.Authorization = `Bearer ${session.sessionToken}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: 10000,
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data.data);
          return;
        }
        const error = data && data.error;
        const err = new Error(error && error.message ? error.message : '服务暂时不可用，请稍后重试');
        err.code = error && error.code;
        err.statusCode = statusCode;
        reject(err);
      },
      fail: ({ errMsg }) => {
        const err = new Error(errMsg && errMsg.includes('timeout') ? '请求超时，请检查网络后重试' : '网络连接失败，请检查网络后重试');
        err.code = 'NETWORK_ERROR';
        reject(err);
      },
    });
  });
}

const createSession = (code) => request('/auth/wechat/session', { method: 'POST', data: { code } });
const exchangePhone = (code) => request('/auth/wechat/phone', { method: 'POST', data: { code } });
const listIdentities = () => request('/me/identities');
const createIdentity = (role, data) => request(`/me/identities/${role}`, { method: 'POST', data });
const resubmitIdentity = (id, profile) => request(`/me/identities/${id}/resubmit`, { method: 'POST', data: { profile } });

module.exports = { createSession, exchangePhone, listIdentities, createIdentity, resubmitIdentity };
