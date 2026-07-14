const api = require('../../services/api');

Page({
  data: { role: 'applicant', items: [], selected: null, loading: false, error: '', keyword: '' },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); this.load(); },
  onShow() { if (this.data.role) this.load(); },
  input(event) { this.setData({ keyword: event.detail.value }); },
  load() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    const action = this.data.role === 'applicant' ? api.listMarketRecruitmentPosts : api.listMarketJobSeekingInformation;
    action({ keyword: this.data.keyword }).then((result) => this.setData({ items: result.items || [] })).catch((error) => this.setData({ error: error.message })).finally(() => this.setData({ loading: false }));
  },
  open(event) {
    const id = event.currentTarget.dataset.id;
    const action = this.data.role === 'applicant' ? api.getMarketRecruitmentPost : api.getMarketJobSeekingInformation;
    this.setData({ loading: true, error: '' });
    action(id).then((selected) => this.setData({ selected })).catch((error) => this.setData({ error: error.message })).finally(() => this.setData({ loading: false }));
  },
  closeDetail() { this.setData({ selected: null }); },
  favorite() {
    const item = this.data.selected; if (!item || this.data.loading) return;
    const isRecruitment = this.data.role === 'applicant';
    const action = isRecruitment ? api.favoriteRecruitmentPost : api.favoriteJobSeekingInformation;
    action(item.id).then(() => wx.showToast({ title: '已收藏', icon: 'success' })).catch((error) => this.setData({ error: error.message }));
  },
  report() {
    const item = this.data.selected; if (!item) return;
    wx.showModal({ title: '举报信息', editable: true, placeholderText: '请填写举报原因', success: (result) => {
      if (!result.confirm || !result.content.trim()) return;
      api.createMarketReport({ targetType: this.data.role === 'applicant' ? 'recruitment_post' : 'applicant_information', targetId: item.id, reason: result.content.trim() }).then(() => wx.showToast({ title: '举报已提交', icon: 'success' })).catch((error) => this.setData({ error: error.message }));
    } });
  },
  openFavorites() { wx.navigateTo({ url: `/pages/favorites/favorites?role=${this.data.role}` }); },
});
