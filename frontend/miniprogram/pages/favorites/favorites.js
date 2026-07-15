const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');

function actionsForRole(role) {
  return role === 'applicant'
    ? { list: api.listRecruitmentFavorites, remove: api.unfavoriteRecruitmentPost }
    : { list: api.listJobSeekingFavorites, remove: api.unfavoriteJobSeekingInformation };
}

Page({
  data: { role: 'applicant', items: [], loading: true, submitting: false, removingId: '', error: '' },
  onLoad(options) {
    this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' });
    this.load();
  },
  load() {
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => actionsForRole(this.data.role).list(),
      mapSuccess: (items) => ({ items: items || [] }),
    }).catch(() => {});
  },
  remove(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.submitting) return;
    wx.showModal({ title: '取消收藏', content: '确认从收藏中移除这条信息？', success: (result) => {
      if (!result.confirm) return;
      this.setData({ removingId: id });
      runRequest({
        getState: () => this.data,
        setState: (patch) => this.setData(patch),
        mode: 'submit',
        request: () => actionsForRole(this.data.role).remove(id),
        mapSuccess: () => ({
          items: this.data.items.filter((item) => item.id !== id),
          removingId: '',
        }),
      }).catch(() => this.setData({ removingId: '' }));
    } });
  },
  open(event) { wx.navigateTo({ url: `/pages/market-detail/market-detail?role=${this.data.role}&id=${event.currentTarget.dataset.id}` }); },
  retry() { this.load(); },
});
