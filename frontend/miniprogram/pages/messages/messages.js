const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');

Page({
  data: { role: 'applicant', items: [], loading: true, error: '' },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); },
  onShow() { this.load(); },
  load() {
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => api.listConversations(),
      mapSuccess: (items) => ({ items: items || [] }),
    }).catch(() => {});
  },
  open(event) {
    wx.navigateTo({ url: `/pages/conversation/conversation?id=${event.currentTarget.dataset.id}&role=${this.data.role}` });
  },
  openApplications() { wx.navigateTo({ url: `/pages/applications/applications?role=${this.data.role}` }); },
  openInterviews() { wx.navigateTo({ url: `/pages/interviews/interviews?role=${this.data.role}` }); },
  openMyCenter() { wx.redirectTo({ url: `/pages/my-center/my-center?role=${this.data.role}` }); },
  retry() { this.load(); },
});
