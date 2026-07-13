const { listIdentities } = require('../../services/api');

const statusText = { pending_review: '待人工审核', approved: '审核通过', changes_requested: '拒绝/需修改' };
const roleText = { recruiter: '招人方', applicant: '应聘方' };

Page({
  data: { loading: true, error: '', identities: [], focusId: '', statusText, roleText },
  onLoad(options) { this.setData({ focusId: options.identityId || '', role: options.role || '' }); this.load(); },
  onShow() { if (!this.data.loading) this.load(); },
  load() {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(listIdentities).then((identities) => this.setData({ identities: identities || [], loading: false })).catch((error) => this.setData({ loading: false, error: error.message }));
  },
  startOtherRole() {
    const role = this.data.identities.some((identity) => identity.role === 'recruiter') ? 'applicant' : 'recruiter';
    wx.navigateTo({ url: `/pages/register/register?role=${role}` });
  },
  edit(event) { wx.navigateTo({ url: `/pages/register/register?role=${event.currentTarget.dataset.role}&identityId=${event.currentTarget.dataset.id}` }); },
  home() { wx.reLaunch({ url: '/pages/home/home' }); },
  retry() { this.load(); },
});
