const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');

Page({
  data: {
    role: 'applicant', identities: [], blocks: [], loading: true, submitting: false, error: '',
    status: { pending_review: '待审核', approved: '审核通过', changes_requested: '需修改' },
  },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); this.load(); },
  onShow() { if (!this.data.loading) this.load(); },
  load() {
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => Promise.all([api.listIdentities(), api.listMarketUserBlocks()]),
      mapSuccess: ([identities, blocks]) => ({ identities: identities || [], blocks: blocks || [] }),
    }).catch(() => {});
  },
  openProfile() { wx.navigateTo({ url: `/pages/profile/profile?role=${this.data.role}` }); },
  openFavorites() { wx.redirectTo({ url: `/pages/favorites/favorites?role=${this.data.role}` }); },
  openMessages() { wx.navigateTo({ url: `/pages/messages/messages?role=${this.data.role}` }); },
  openApplications() { wx.navigateTo({ url: `/pages/applications/applications?role=${this.data.role}` }); },
  openInterviews() { wx.navigateTo({ url: `/pages/interviews/interviews?role=${this.data.role}` }); },
  openMarket() { wx.redirectTo({ url: `/pages/market/market?role=${this.data.role}&mode=map` }); },
  openList() { wx.redirectTo({ url: `/pages/market/market?role=${this.data.role}&mode=list` }); },
  openPrivacy() { wx.showModal({ title: '隐私政策', content: '我们仅在提供身份审核、市场信息和联系方式访问时处理必要信息。地图仅展示区域级位置。', showCancel: false }); },
  openAgreement() { wx.showModal({ title: '用户协议', content: '请遵守平台规则，不发布虚假、违法或侵害他人权益的信息。', showCancel: false }); },
  unblock(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.submitting) return;
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'submit',
      request: () => api.deleteMarketUserBlock(id),
      mapSuccess: () => ({ blocks: this.data.blocks.filter((item) => item.blockId !== id) }),
    }).catch(() => {});
  },
  retry() { this.load(); },
});
