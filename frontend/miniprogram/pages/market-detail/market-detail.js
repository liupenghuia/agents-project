const api = require('../../services/api');
const { normalizeMarketItem } = require('../../utils/market-list');
const { runRequest } = require('../../utils/request-state');

Page({
  data: { role: 'applicant', id: '', item: null, loading: true, submitting: false, actionLoading: false, reporting: false, error: '', reportReason: '' },
  onLoad(options) {
    this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant', id: options.id || '' });
    this.load();
  },
  load() {
    const action = this.data.role === 'applicant' ? api.getMarketRecruitmentPost : api.getMarketJobSeekingInformation;
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => action(this.data.id),
      mapSuccess: (item) => ({ item: normalizeMarketItem(item, api.resolveMediaUrl) }),
    }).catch(() => {});
  },
  favorite() {
    if (!this.data.item || this.data.submitting) return;
    const next = !this.data.item.isFavorited;
    const action = this.data.role === 'applicant'
      ? (next ? api.favoriteRecruitmentPost : api.unfavoriteRecruitmentPost)
      : (next ? api.favoriteJobSeekingInformation : api.unfavoriteJobSeekingInformation);
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData({ ...patch, actionLoading: patch.submitting }),
      mode: 'submit',
      request: () => action(this.data.item.id),
      mapSuccess: () => ({ item: { ...this.data.item, isFavorited: next } }),
    }).then(() => wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'success' })).catch(() => {});
  },
  report() { this.setData({ reporting: true, reportReason: '', error: '' }); },
  inputReport(event) { this.setData({ reportReason: event.detail.value }); },
  cancelReport() { this.setData({ reporting: false }); },
  submitReport() {
    const reason = String(this.data.reportReason || '').trim();
    if (!reason) { this.setData({ error: '请填写举报原因' }); return; }
    const targetType = this.data.role === 'applicant' ? 'recruitment_post' : 'applicant_information';
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData({ ...patch, actionLoading: patch.submitting }),
      mode: 'submit',
      request: () => api.createMarketReport({ targetType, targetId: this.data.id, reason }),
      mapSuccess: () => ({ reporting: false }),
    }).then(() => wx.showToast({ title: '举报已提交', icon: 'success' })).catch(() => {});
  },
  block() {
    wx.showModal({ title: '拉黑发布者', content: '拉黑后，对方的信息将从你的地图、列表和收藏中隐藏。', success: (result) => {
      if (!result.confirm || this.data.submitting) return;
      const targetType = this.data.role === 'applicant' ? 'recruitment_post' : 'applicant_information';
      runRequest({
        getState: () => this.data,
        setState: (patch) => this.setData({ ...patch, actionLoading: patch.submitting }),
        mode: 'submit',
        request: () => api.createMarketUserBlock({ targetType, targetId: this.data.id }),
        mapSuccess: () => ({}),
      }).then(() => {
        wx.showToast({ title: '已拉黑', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 400);
      }).catch(() => {});
    } });
  },
  call() {
    if (!this.data.item || !this.data.item.contactPhone) { this.setData({ error: '当前信息没有可用联系方式' }); return; }
    wx.makePhoneCall({ phoneNumber: this.data.item.contactPhone, fail: () => this.setData({ error: '未能发起电话，请稍后重试' }) });
  },
  message() {
    if (!this.data.item || this.data.submitting) return;
    const targetType = this.data.role === 'applicant' ? 'recruitment_post' : 'applicant_information';
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData({ ...patch, actionLoading: patch.submitting }),
      mode: 'submit',
      request: () => api.startConversation({
        targetType,
        targetId: this.data.id,
        body: '你好，我对这条信息感兴趣',
        clientRequestId: `start-${this.data.id}-${Date.now()}`,
      }),
      mapSuccess: () => ({}),
    }).then((conversation) => {
      if (!conversation) return;
      wx.navigateTo({ url: `/pages/conversation/conversation?id=${conversation.id}&role=${this.data.role}` });
    }).catch(() => {});
  },
  apply() {
    if (this.data.role !== 'applicant' || !this.data.item || this.data.submitting) return;
    wx.showModal({
      title: '确认投递',
      content: '将向招聘方表达兴趣。对方可查看你的公开资料摘要，不会看到精确地址以外的内部信息。',
      success: (result) => {
        if (!result.confirm) return;
        runRequest({
          getState: () => this.data,
          setState: (patch) => this.setData({ ...patch, actionLoading: patch.submitting }),
          mode: 'submit',
          request: () => api.createApplication({ recruitmentPostId: this.data.id, note: '希望进一步了解' }),
          mapSuccess: () => ({}),
        }).then(() => wx.showToast({ title: '投递成功', icon: 'success' })).catch(() => {});
      },
    });
  },
  retry() { this.load(); },
});
