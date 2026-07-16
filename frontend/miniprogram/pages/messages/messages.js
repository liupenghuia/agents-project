const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');
const { getActiveRole, setActiveRole } = require('../../utils/workspace');
const navigation = require('../../utils/navigation');

Page({
  data: { role: 'applicant', items: [], loading: true, error: '' },
  onLoad(options) {
    const role = setActiveRole(options.role || getActiveRole() || 'applicant') || 'applicant';
    this.setData({ role });
  },
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
  openApplications() { navigation.openApplications(this.data.role); },
  openInterviews() { navigation.openInterviews(this.data.role); },
  openMyCenter() { navigation.openMainTab('my', { role: this.data.role }); },
  retry() { this.load(); },
});

