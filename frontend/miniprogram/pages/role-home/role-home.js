const { getApplicantJobSeekingInformation, listRecruitmentPosts } = require('../../services/api');
const { labels } = require('../../utils/market-status');

Page({
  data: { role: 'recruiter', identityId: '', publications: [], publicationsLoading: false, publicationsError: '' },
  onLoad(options) {
    this.setData({ role: options.role === 'applicant' ? 'applicant' : 'recruiter', identityId: options.identityId || '' });
  },
  onShow() { this.loadPublications(); },
  loadPublications() {
    if (this.data.publicationsLoading) return;
    const action = this.data.role === 'recruiter'
      ? listRecruitmentPosts
      : () => getApplicantJobSeekingInformation().then((item) => item ? [item] : []);
    this.setData({ publicationsLoading: true, publicationsError: '' });
    action().then((items) => this.setData({ publications: (items || []).map((item) => ({
      ...item, publicationId: item.id || item.roleProfileId, statusLabel: labels[item.status] || '未发布',
    })), publicationsLoading: false }))
      .catch((error) => this.setData({ publications: [], publicationsLoading: false, publicationsError: error.message }));
  },
  openApplicantInformation() { wx.navigateTo({ url: '/pages/applicant-information/applicant-information' }); },
  openRecruiterInformation() { wx.navigateTo({ url: '/pages/recruiter-information/recruiter-information' }); },
  openRecruitmentPost(event) {
    const postId = event && event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/recruitment-post/recruitment-post${postId ? `?postId=${postId}` : ''}` });
  },
  openPublication(event) {
    if (this.data.role === 'applicant') this.openApplicantInformation();
    else this.openRecruitmentPost(event);
  },
  openMarket() { wx.navigateTo({ url: `/pages/market/market?role=${this.data.role}` }); },
  backHome() { wx.reLaunch({ url: '/pages/home/home' }); },
});
