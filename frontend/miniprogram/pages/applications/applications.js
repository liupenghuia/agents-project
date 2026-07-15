const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');

const recruiterStatuses = [
  { value: 'viewed', label: '已查看' },
  { value: 'contacted', label: '已联系' },
  { value: 'interviewing', label: '面试中' },
  { value: 'hired', label: '已录用' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'closed', label: '已结束' },
];

Page({
  data: { role: 'applicant', items: [], loading: true, submitting: false, error: '', actionId: '', recruiterStatuses },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); this.load(); },
  onShow() { if (!this.data.loading) this.load(); },
  load() {
    const action = this.data.role === 'recruiter' ? api.listRecruitmentApplications : api.listMyApplications;
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => action(),
      mapSuccess: (items) => ({ items: items || [], actionId: '' }),
    }).catch(() => {});
  },
  withdraw(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.submitting) return;
    this.setData({ actionId: id });
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'submit',
      request: () => api.withdrawApplication(id),
      mapSuccess: () => ({ actionId: '' }),
    }).then(() => this.load()).catch(() => this.setData({ actionId: '' }));
  },
  updateStatus(event) {
    const id = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    if (!id || !status || this.data.submitting) return;
    this.setData({ actionId: id });
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'submit',
      request: () => api.updateApplicationStatus(id, status),
      mapSuccess: () => ({ actionId: '' }),
    }).then(() => this.load()).catch(() => this.setData({ actionId: '' }));
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
