const api = require('../../services/api');

const recruiterStatuses = [
  { value: 'viewed', label: '已查看' },
  { value: 'contacted', label: '已联系' },
  { value: 'interviewing', label: '面试中' },
  { value: 'hired', label: '已录用' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'closed', label: '已结束' },
];

Page({
  data: { role: 'applicant', items: [], loading: true, error: '', actionId: '', recruiterStatuses },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); this.load(); },
  onShow() { if (!this.data.loading) this.load(); },
  load() {
    this.setData({ loading: true, error: '' });
    const action = this.data.role === 'recruiter' ? api.listRecruitmentApplications : api.listMyApplications;
    action().then((items) => this.setData({ items: items || [], loading: false }))
      .catch((error) => this.setData({ loading: false, error: error.message }));
  },
  withdraw(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.actionId) return;
    this.setData({ actionId: id, error: '' });
    api.withdrawApplication(id).then(() => this.load()).catch((error) => this.setData({ error: error.message, actionId: '' }));
  },
  updateStatus(event) {
    const id = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    if (!id || !status || this.data.actionId) return;
    this.setData({ actionId: id, error: '' });
    api.updateApplicationStatus(id, status)
      .then(() => this.setData({ actionId: '' }, () => this.load()))
      .catch((error) => this.setData({ error: error.message, actionId: '' }));
  },
  invite(event) {
    const item = this.data.items.find((candidate) => candidate.id === event.currentTarget.dataset.id);
    if (!item) return;
    wx.navigateTo({
      url: `/pages/interviews/interviews?role=recruiter&applicationId=${item.id}&applicantUserId=${item.applicantUserId}`,
    });
  },
  retry() { this.load(); },
});
