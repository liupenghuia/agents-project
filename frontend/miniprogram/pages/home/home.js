const { listIdentities } = require('../../services/api');

const statusText = { pending_review: '待人工审核', approved: '审核通过', changes_requested: '需修改资料' };

Page({
  data: { loading: true, error: '', identities: [], approvedIdentities: [], statusText },

  onLoad() { this.load(); },
  onShow() { if (!this.data.loading) this.load(); },

  load() {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(() => listIdentities()).then((identities) => {
      getApp().globalData.identities = identities || [];
      const list = identities || [];
      this.setData({ identities: list, approvedIdentities: list.filter((identity) => identity.reviewStatus === 'approved'), loading: false });
    }).catch((error) => this.setData({ loading: false, error: error.message }));
  },

  chooseRole(event) {
    const role = event.currentTarget.dataset.role;
    wx.navigateTo({ url: `/pages/register/register?role=${role}` });
  },

  enterRole(event) {
    wx.navigateTo({ url: `/pages/role-home/role-home?role=${event.currentTarget.dataset.role}&identityId=${event.currentTarget.dataset.id}` });
  },

  createOtherRole() {
    const role = this.data.identities.some((identity) => identity.role === 'recruiter') ? 'applicant' : 'recruiter';
    wx.navigateTo({ url: `/pages/register/register?role=${role}` });
  },

  viewIdentities() { wx.navigateTo({ url: '/pages/identities/identities' }); },
  retry() { this.load(); },
});
