const { listIdentities } = require('../../services/api');

const statusText = { pending_review: '待人工审核', approved: '审核通过', changes_requested: '需修改资料' };

Page({
  data: { loading: true, error: '', identities: [], statusText },

  onLoad() { this.load(); },
  onShow() { if (!this.data.loading) this.load(); },

  load() {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(() => listIdentities()).then((identities) => {
      getApp().globalData.identities = identities || [];
      this.setData({ identities: identities || [], loading: false });
    }).catch((error) => this.setData({ loading: false, error: error.message }));
  },

  chooseRole(event) {
    const role = event.currentTarget.dataset.role;
    const exists = this.data.identities.some((identity) => identity.role === role);
    if (exists) {
      wx.navigateTo({ url: `/pages/identities/identities?role=${role}` });
      return;
    }
    wx.navigateTo({ url: `/pages/register/register?role=${role}` });
  },

  viewIdentities() { wx.navigateTo({ url: '/pages/identities/identities' }); },
  retry() { this.load(); },
});
