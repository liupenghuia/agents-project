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
const updateIdentityProfile = (id, profile) => request(`/me/identities/${id}/profile`, { method: 'PATCH', data: profile });
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
const renewRecruitmentPost = (id) => request(`/me/recruitment-posts/${id}/renew`, { method: 'POST' });
const renewApplicantJobSeekingInformation = () => request('/me/applicant/job-seeking-information/renew', { method: 'POST' });
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
const listMarketUserBlocks = () => request('/me/market-user-blocks');
const createMarketUserBlock = (data) => request('/me/market-user-blocks', { method: 'POST', data });
const deleteMarketUserBlock = (id) => request(`/me/market-user-blocks/${id}`, { method: 'DELETE' });
const startConversation = (data) => request('/me/conversations', { method: 'POST', data });
const listConversations = () => request('/me/conversations');
const getConversation = (id) => request(`/me/conversations/${id}`);
const listConversationMessages = (id) => request(`/me/conversations/${id}/messages`);
const sendConversationMessage = (id, data) => request(`/me/conversations/${id}/messages`, { method: 'POST', data });
const markConversationRead = (id) => request(`/me/conversations/${id}/read`, { method: 'POST' });
const endConversation = (id) => request(`/me/conversations/${id}/end`, { method: 'POST' });
const createApplication = (data) => request('/me/applications', { method: 'POST', data });
const listMyApplications = () => request('/me/applications');
const listRecruitmentApplications = () => request('/me/recruitment-applications');
const updateApplicationStatus = (id, status) => request(`/me/applications/${id}`, { method: 'PATCH', data: { status } });
const withdrawApplication = (id) => request(`/me/applications/${id}/withdraw`, { method: 'POST' });
const createInterview = (data) => request('/me/interviews', { method: 'POST', data });
const listInterviews = () => request('/me/interviews');
const respondInterview = (id, decision) => request(`/me/interviews/${id}/respond`, { method: 'POST', data: { decision } });
const cancelInterview = (id, reason) => request(`/me/interviews/${id}/cancel`, { method: 'POST', data: { reason } });

module.exports = {
  createSession, exchangePhone, listIdentities, getIdentity, updateIdentityProfile, createIdentity, resubmitIdentity,
  getApplicantJobSeekingInformation, saveApplicantJobSeekingInformation, disableApplicantJobSeekingInformation,
  getRecruiterInformation, saveRecruiterInformation, createImageUploadUrl, uploadRecruitmentImage,
  listRecruitmentPosts, createRecruitmentPost, getRecruitmentPost, updateRecruitmentPost, disableRecruitmentPost, renewRecruitmentPost,
  renewApplicantJobSeekingInformation,
  listMarketRecruitmentPosts, mapMarketRecruitmentPosts, getMarketRecruitmentPost,
  listMarketJobSeekingInformation, mapMarketJobSeekingInformation, getMarketJobSeekingInformation,
  listRecruitmentFavorites, favoriteRecruitmentPost, unfavoriteRecruitmentPost, listJobSeekingFavorites,
  favoriteJobSeekingInformation, unfavoriteJobSeekingInformation, createMarketReport,
  listMarketUserBlocks, createMarketUserBlock, deleteMarketUserBlock,
  startConversation, listConversations, getConversation, listConversationMessages, sendConversationMessage,
  markConversationRead, endConversation, createApplication, listMyApplications, listRecruitmentApplications,
  updateApplicationStatus, withdrawApplication, createInterview, listInterviews, respondInterview, cancelInterview,
  resolveMediaUrl,
};
