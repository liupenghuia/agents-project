const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');
const { labels } = require('../../utils/market-status');
const { getActiveRole, setActiveRole } = require('../../utils/workspace');
const navigation = require('../../utils/navigation');

Page({
  data: {
    role: 'applicant',
    identities: [],
    blocks: [],
    publications: [],
    loading: true,
    submitting: false,
    publicationsLoading: false,
    error: '',
    publicationsError: '',
    status: { pending_review: '待审核', approved: '审核通过', changes_requested: '需修改' },
  },
  onLoad(options) {
    const role = setActiveRole(options.role || getActiveRole() || 'applicant') || 'applicant';
    this.setData({ role });
    this.load();
  },
  onShow() {
    const role = getActiveRole() || this.data.role;
    if (role !== this.data.role) {
      this.setData({ role });
      this.load();
      return;
    }
    if (!this.data.loading) this.load();
  },
  load() {
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => Promise.all([
        api.listIdentities(),
        api.listMarketUserBlocks(),
        this.fetchPublications(),
      ]),
      mapSuccess: ([identities, blocks, publications]) => ({
        identities: identities || [],
        blocks: blocks || [],
        publications: publications || [],
        publicationsError: '',
      }),
    }).catch(() => {});
  },
  fetchPublications() {
    if (this.data.role === 'recruiter') {
      return api.listRecruitmentPosts().then((items) => (items || []).map((item) => ({
        ...item,
        publicationId: item.id,
        statusLabel: labels[item.status] || '未发布',
      })));
    }
    return api.getApplicantJobSeekingInformation().then((item) => (item ? [{
      ...item,
      publicationId: item.id || item.roleProfileId || 'applicant-information',
      statusLabel: labels[item.status] || '未发布',
    }] : []));
  },
  openProfile() { navigation.openProfile(this.data.role); },
  openFavorites() { navigation.openFavorites(this.data.role); },
  openMessages() { navigation.openMessages(this.data.role); },
  openApplications() { navigation.openApplications(this.data.role); },
  openInterviews() { navigation.openInterviews(this.data.role); },
  openMarket() { navigation.openMainTab('map', { role: this.data.role }); },
  openList() { navigation.openMainTab('list', { role: this.data.role }); },
  openPublication(event) {
    if (this.data.role === 'applicant') {
      wx.navigateTo({ url: '/pages/applicant-information/applicant-information' });
      return;
    }
    const postId = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/recruitment-post/recruitment-post${postId ? `?postId=${postId}` : ''}` });
  },
  openCreatePublication() {
    if (this.data.role === 'applicant') {
      wx.navigateTo({ url: '/pages/applicant-information/applicant-information' });
      return;
    }
    wx.navigateTo({ url: '/pages/recruitment-post/recruitment-post' });
  },
  openPrivacy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们仅在提供身份审核、市场信息和联系方式访问时处理必要信息。地图仅展示区域级位置，不公开楼栋级详细地址。',
      showCancel: false,
    });
  },
  openAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '请遵守平台规则，不发布虚假、违法或侵害他人权益的信息。',
      showCancel: false,
    });
  },
  unblock(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.submitting) return;
    wx.showModal({
      title: '取消拉黑',
      content: '取消后，对方信息可能重新出现在你的地图、列表和收藏中。',
      success: (result) => {
        if (!result.confirm) return;
        runRequest({
          getState: () => this.data,
          setState: (patch) => this.setData(patch),
          mode: 'submit',
          request: () => api.deleteMarketUserBlock(id),
          mapSuccess: () => ({ blocks: this.data.blocks.filter((item) => item.blockId !== id) }),
        }).catch(() => {});
      },
    });
  },
  retry() { this.load(); },
});
