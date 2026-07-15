const { listIdentities } = require('../../services/api');

Page({
  data: { message: '正在恢复你的工作区' },

  onLoad() {
    getApp().ensureSession()
      .then(() => listIdentities())
      .then((identities) => {
        const list = identities || [];
        getApp().globalData.identities = list;
        const approved = list.find((identity) => identity.reviewStatus === 'approved');
        if (approved) {
          wx.reLaunch({ url: `/pages/role-home/role-home?role=${approved.role}&identityId=${approved.id}` });
          return;
        }
        if (list.length) {
          wx.reLaunch({ url: '/pages/identities/identities' });
          return;
        }
        wx.reLaunch({ url: '/pages/home/home' });
      })
      .catch((error) => this.setData({ message: error.message || '连接失败，请重试', error: true }));
  },

  retry() { this.setData({ error: false, message: '正在恢复你的工作区' }); this.onLoad(); },
});
