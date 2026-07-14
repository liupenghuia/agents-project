const { resolveApiBaseUrl } = require('../config');

function queryString(query = {}) {
  return Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

function apiBaseUrl() {
  const app = getApp();
  return app && app.globalData.apiBaseUrl || resolveApiBaseUrl();
}

function resolveMediaUrl(url) {
  const value = String(url || '');
  if (!value || /^https?:\/\//i.test(value)) return value;
  return `${apiBaseUrl()}${value.startsWith('/') ? value : `/${value}`}`;
}

function requestError(statusCode, payload) {
  const error = payload && payload.error;
  const result = new Error(error && error.message ? error.message : '服务暂时不可用，请稍后重试');
  result.code = error && error.code;
  result.statusCode = statusCode;
  if (statusCode === 401) {
    const app = getApp();
    if (app && app.clearSession) app.clearSession();
  }
  return result;
}

function request(path, options = {}) {
  const app = getApp();
  const session = app && app.globalData.session;
  const header = { 'content-type': 'application/json', ...(options.header || {}) };
  if (session && session.sessionToken) header.Authorization = `Bearer ${session.sessionToken}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl()}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: 10000,
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data.data);
          return;
        }
        reject(requestError(statusCode, data));
      },
      fail: ({ errMsg }) => {
        const err = new Error(errMsg && errMsg.includes('timeout') ? '请求超时，请检查网络后重试' : '网络连接失败，请检查网络后重试');
        err.code = 'NETWORK_ERROR';
        reject(err);
      },
    });
  });
}

function uploadFile(path, filePath, name = 'file', formData = {}) {
  const app = getApp();
  const session = app && app.globalData.session;
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${apiBaseUrl()}${path}`,
      filePath,
      name,
      formData,
      header: session && session.sessionToken ? { Authorization: `Bearer ${session.sessionToken}` } : {},
      timeout: 30000,
      success: ({ statusCode, data }) => {
        let payload = {};
        try { payload = JSON.parse(data || '{}'); } catch (error) { reject(new Error('上传响应格式无效')); return; }
        if (statusCode >= 200 && statusCode < 300) { resolve(payload.data); return; }
        reject(requestError(statusCode, payload));
      },
      fail: () => reject(new Error('图片上传失败，请检查网络后重试')),
    });
  });
}

const createSession = (code) => request('/auth/wechat/session', { method: 'POST', data: { code } });
const exchangePhone = (code) => request('/auth/wechat/phone', { method: 'POST', data: { code } });
const listIdentities = () => request('/me/identities');
const getIdentity = (id) => request(`/me/identities/${id}`);
const createIdentity = (role, data) => request(`/me/identities/${role}`, { method: 'POST', data });
const resubmitIdentity = (id, profile) => request(`/me/identities/${id}/resubmit`, { method: 'POST', data: { profile } });
const getApplicantJobSeekingInformation = () => request('/me/applicant/job-seeking-information');
const saveApplicantJobSeekingInformation = (data) => request('/me/applicant/job-seeking-information', { method: 'PUT', data });
const disableApplicantJobSeekingInformation = () => request('/me/applicant/job-seeking-information/disable', { method: 'POST' });
const getRecruiterInformation = () => request('/me/recruiter/information');
const saveRecruiterInformation = (data) => request('/me/recruiter/information', { method: 'PUT', data });
const createImageUploadUrl = (data) => request('/me/recruitment-posts/image-upload-url', { method: 'POST', data });
const uploadRecruitmentImage = (uploadUrl, filePath) => uploadFile(uploadUrl, filePath);
const listRecruitmentPosts = () => request('/me/recruitment-posts');
const createRecruitmentPost = (data) => request('/me/recruitment-posts', { method: 'POST', data });
const getRecruitmentPost = (id) => request(`/me/recruitment-posts/${id}`);
const updateRecruitmentPost = (id, data) => request(`/me/recruitment-posts/${id}`, { method: 'PATCH', data });
const disableRecruitmentPost = (id) => request(`/me/recruitment-posts/${id}/disable`, { method: 'POST' });
const listMarketRecruitmentPosts = (query = {}) => request(`/market/recruitment-posts?${queryString(query)}`);
const mapMarketRecruitmentPosts = (query) => request(`/market/recruitment-posts/map?${queryString(query)}`);
const getMarketRecruitmentPost = (id) => request(`/market/recruitment-posts/${id}`);
const listMarketJobSeekingInformation = (query = {}) => request(`/market/job-seeking-information?${queryString(query)}`);
const mapMarketJobSeekingInformation = (query) => request(`/market/job-seeking-information/map?${queryString(query)}`);
const getMarketJobSeekingInformation = (id) => request(`/market/job-seeking-information/${id}`);
const listRecruitmentFavorites = () => request('/me/favorites/recruitment-posts');
const favoriteRecruitmentPost = (id) => request(`/me/favorites/recruitment-posts/${id}`, { method: 'PUT' });
const unfavoriteRecruitmentPost = (id) => request(`/me/favorites/recruitment-posts/${id}`, { method: 'DELETE' });
const listJobSeekingFavorites = () => request('/me/favorites/job-seeking-information');
const favoriteJobSeekingInformation = (id) => request(`/me/favorites/job-seeking-information/${id}`, { method: 'PUT' });
const unfavoriteJobSeekingInformation = (id) => request(`/me/favorites/job-seeking-information/${id}`, { method: 'DELETE' });
const createMarketReport = (data) => request('/me/market-reports', { method: 'POST', data });

module.exports = {
  createSession, exchangePhone, listIdentities, getIdentity, createIdentity, resubmitIdentity,
  getApplicantJobSeekingInformation, saveApplicantJobSeekingInformation, disableApplicantJobSeekingInformation,
  getRecruiterInformation, saveRecruiterInformation, createImageUploadUrl, uploadRecruitmentImage,
  listRecruitmentPosts, createRecruitmentPost, getRecruitmentPost, updateRecruitmentPost, disableRecruitmentPost,
  listMarketRecruitmentPosts, mapMarketRecruitmentPosts, getMarketRecruitmentPost,
  listMarketJobSeekingInformation, mapMarketJobSeekingInformation, getMarketJobSeekingInformation,
  listRecruitmentFavorites, favoriteRecruitmentPost, unfavoriteRecruitmentPost, listJobSeekingFavorites,
  favoriteJobSeekingInformation, unfavoriteJobSeekingInformation, createMarketReport,
  resolveMediaUrl,
};
