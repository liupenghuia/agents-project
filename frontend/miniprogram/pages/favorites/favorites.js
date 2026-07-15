const api = require('../../services/api');

function actionsForRole(role) {
  return role === 'applicant'
    ? { list: api.listRecruitmentFavorites, remove: api.unfavoriteRecruitmentPost }
    : { list: api.listJobSeekingFavorites, remove: api.unfavoriteJobSeekingInformation };
}

Page({
  data: { role: 'applicant', items: [], loading: true, removingId: '', error: '' },
  onLoad(options) {
    this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' });
    this.load();
  },
  load() {
    this.setData({ loading: true, error: '' });
    actionsForRole(this.data.role).list().then((items) => this.setData({ items: items || [], loading: false }))
      .catch((error) => this.setData({ loading: false, error: error.message }));
  },
  remove(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.removingId) return;
    wx.showModal({ title: '取消收藏', content: '确认从收藏中移除这条信息？', success: (result) => {
      if (!result.confirm) return;
      this.setData({ removingId: id, error: '' });
      actionsForRole(this.data.role).remove(id).then(() => {
        this.setData({ items: this.data.items.filter((item) => item.id !== id), removingId: '' });
      }).catch((error) => this.setData({ removingId: '', error: error.message }));
    } });
  },
  open(event) { wx.navigateTo({ url: `/pages/market-detail/market-detail?role=${this.data.role}&id=${event.currentTarget.dataset.id}` }); },
  retry() { this.load(); },
});
