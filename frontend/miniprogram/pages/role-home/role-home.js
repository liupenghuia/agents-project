Page({
  data: { role: 'recruiter', identityId: '' },
  onLoad(options) {
    this.setData({ role: options.role === 'applicant' ? 'applicant' : 'recruiter', identityId: options.identityId || '' });
  },
  backHome() { wx.reLaunch({ url: '/pages/home/home' }); },
});
