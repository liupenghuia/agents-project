const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');

Page({
  data: {
    role: 'applicant', items: [], loading: true, submitting: false, error: '', actionId: '',
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
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => api.listInterviews(),
      mapSuccess: (items) => ({ items: items || [], actionId: '' }),
    }).catch(() => {});
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  create() {
    if (this.data.submitting || !this.data.applicantUserId) return;
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData({ ...patch, creating: patch.submitting }),
      mode: 'submit',
      request: () => api.createInterview({
        applicationId: this.data.applicationId || null,
        applicantUserId: this.data.applicantUserId,
        scheduledAt: this.data.form.scheduledAt,
        locationText: this.data.form.locationText,
      }),
      mapSuccess: () => ({ form: { scheduledAt: '', locationText: '' } }),
    }).then(() => {
      wx.showToast({ title: '已发起邀请', icon: 'success' });
      this.load();
    }).catch(() => {});
  },
  respond(event) {
    const id = event.currentTarget.dataset.id;
    const decision = event.currentTarget.dataset.decision;
    if (!id || this.data.submitting) return;
    this.setData({ actionId: id });
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'submit',
      request: () => api.respondInterview(id, decision),
      mapSuccess: () => ({ actionId: '' }),
    }).then(() => this.load()).catch(() => this.setData({ actionId: '' }));
  },
  cancel(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '取消面试', editable: true, placeholderText: '请填写取消原因', success: (result) => {
      if (!result.confirm || !String(result.content || '').trim() || this.data.submitting) return;
      this.setData({ actionId: id });
      runRequest({
        getState: () => this.data,
        setState: (patch) => this.setData(patch),
        mode: 'submit',
        request: () => api.cancelInterview(id, result.content.trim()),
        mapSuccess: () => ({ actionId: '' }),
      }).then(() => this.load()).catch(() => this.setData({ actionId: '' }));
    } });
  },
  retry() { this.load(); },
});
