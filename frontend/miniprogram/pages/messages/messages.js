const api = require('../../services/api');

Page({
  data: { role: 'applicant', items: [], loading: true, error: '' },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); },
  onShow() { this.load(); },
  load() {
    this.setData({ loading: true, error: '' });
    api.listConversations().then((items) => this.setData({ items: items || [], loading: false }))
      .catch((error) => this.setData({ loading: false, error: error.message }));
  },
  open(event) {
    wx.navigateTo({ url: `/pages/conversation/conversation?id=${event.currentTarget.dataset.id}&role=${this.data.role}` });
  },
  openApplications() { wx.navigateTo({ url: `/pages/applications/applications?role=${this.data.role}` }); },
  openInterviews() { wx.navigateTo({ url: `/pages/interviews/interviews?role=${this.data.role}` }); },
  openMyCenter() { wx.redirectTo({ url: `/pages/my-center/my-center?role=${this.data.role}` }); },
  retry() { this.load(); },
});
