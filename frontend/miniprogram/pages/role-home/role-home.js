Page({
  data: { role: 'recruiter', identityId: '' },
  onLoad(options) {
    this.setData({ role: options.role === 'applicant' ? 'applicant' : 'recruiter', identityId: options.identityId || '' });
  },
  openApplicantInformation() { wx.navigateTo({ url: '/pages/applicant-information/applicant-information' }); },
  openRecruiterInformation() { wx.navigateTo({ url: '/pages/recruiter-information/recruiter-information' }); },
  openRecruitmentPost() { wx.navigateTo({ url: '/pages/recruitment-post/recruitment-post' }); },
  openMarket() { wx.navigateTo({ url: `/pages/market/market?role=${this.data.role}` }); },
  backHome() { wx.reLaunch({ url: '/pages/home/home' }); },
});
