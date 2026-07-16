const { getApplicantJobSeekingInformation, listRecruitmentPosts } = require('../../services/api');
const { labels } = require('../../utils/market-status');
const { setActiveRole } = require('../../utils/workspace');
const navigation = require('../../utils/navigation');

Page({
  data: { role: 'recruiter', identityId: '', publications: [], publicationsLoading: false, publicationsError: '' },
  onLoad(options) {
    const role = setActiveRole(options.role === 'applicant' ? 'applicant' : 'recruiter');
    this.setData({ role, identityId: options.identityId || '' });
  },
  onShow() { this.loadPublications(); },
  loadPublications() {
    if (this.data.publicationsLoading) return;
    const action = this.data.role === 'recruiter'
      ? listRecruitmentPosts
      : () => getApplicantJobSeekingInformation().then((item) => (item ? [item] : []));
    this.setData({ publicationsLoading: true, publicationsError: '' });
    action().then((items) => this.setData({
      publications: (items || []).map((item) => ({
        ...item,
        publicationId: item.id || item.roleProfileId,
        statusLabel: labels[item.status] || '未发布',
      })),
      publicationsLoading: false,
    })).catch((error) => this.setData({ publications: [], publicationsLoading: false, publicationsError: error.message }));
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
  openMarket() { navigation.openMainTab('map', { role: this.data.role }); },
  openList() { navigation.openMainTab('list', { role: this.data.role }); },
  openMyCenter() { navigation.openMainTab('my', { role: this.data.role }); },
  openMessages() { navigation.openMessages(this.data.role); },
  enterWorkspace() { navigation.enterApprovedRole(this.data.role, this.data.identityId); },
  backHome() { wx.reLaunch({ url: '/pages/home/home' }); },
});
