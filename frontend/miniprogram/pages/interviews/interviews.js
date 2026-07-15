const api = require('../../services/api');

Page({
  data: {
    role: 'applicant', items: [], loading: true, error: '', actionId: '',
    form: { scheduledAt: '', locationText: '' }, applicationId: '', applicantUserId: '', creating: false,
  },
  onLoad(options) {
    this.setData({
      role: options.role === 'recruiter' ? 'recruiter' : 'applicant',
      applicationId: options.applicationId || '',
      applicantUserId: options.applicantUserId || '',
    });
    this.load();
  },
  onShow() { if (!this.data.loading) this.load(); },
  load() {
    this.setData({ loading: true, error: '' });
    api.listInterviews().then((items) => this.setData({ items: items || [], loading: false }))
      .catch((error) => this.setData({ loading: false, error: error.message }));
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  create() {
    if (this.data.creating || !this.data.applicantUserId) return;
    this.setData({ creating: true, error: '' });
    api.createInterview({
      applicationId: this.data.applicationId || null,
      applicantUserId: this.data.applicantUserId,
      scheduledAt: this.data.form.scheduledAt,
      locationText: this.data.form.locationText,
    }).then(() => {
      this.setData({ creating: false, form: { scheduledAt: '', locationText: '' } });
      wx.showToast({ title: '已发起邀请', icon: 'success' });
      this.load();
    }).catch((error) => this.setData({ creating: false, error: error.message }));
  },
  respond(event) {
    const id = event.currentTarget.dataset.id;
    const decision = event.currentTarget.dataset.decision;
    if (!id || this.data.actionId) return;
    this.setData({ actionId: id, error: '' });
    api.respondInterview(id, decision)
      .then(() => this.setData({ actionId: '' }, () => this.load()))
      .catch((error) => this.setData({ actionId: '', error: error.message }));
  },
  cancel(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '取消面试', editable: true, placeholderText: '请填写取消原因', success: (result) => {
      if (!result.confirm || !String(result.content || '').trim()) return;
      this.setData({ actionId: id, error: '' });
      api.cancelInterview(id, result.content.trim())
        .then(() => this.setData({ actionId: '' }, () => this.load()))
        .catch((error) => this.setData({ actionId: '', error: error.message }));
    } });
  },
  retry() { this.load(); },
});
