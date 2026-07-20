const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');
const { labels } = require('../../utils/market-status');
const { getActiveRole, setActiveRole } = require('../../utils/workspace');
const navigation = require('../../utils/navigation');

function roleMeta(identities, role) {
  const list = identities || [];
  const approved = list.filter((item) => item.reviewStatus === 'approved');
  const canSwitchRole = approved.length >= 2;
  const otherApproved = approved.find((item) => item.role !== role);
  let roleHint = '当前工作身份';
  if (canSwitchRole) roleHint = '双身份已开通 · 可一键切换';
  else if (list.some((item) => item.reviewStatus === 'pending_review')) roleHint = '有身份正在审核中';
  else if (list.some((item) => item.reviewStatus === 'changes_requested')) roleHint = '有身份需要修改后重提';
  return { canSwitchRole, otherApprovedRole: otherApproved ? otherApproved.role : '', roleHint };
}

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
    canSwitchRole: false,
    otherApprovedRole: '',
    roleHint: '当前工作身份',
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
      mapSuccess: ([identities, blocks, publications]) => {
        const list = identities || [];
        const meta = roleMeta(list, this.data.role);
        return {
          identities: list,
          blocks: blocks || [],
          publications: publications || [],
          publicationsError: '',
          ...meta,
        };
      },
    }).catch(() => {});
  },
  applyRole(role) {
    const next = setActiveRole(role) || role;
    const meta = roleMeta(this.data.identities, next);
    this.setData({ role: next, ...meta });
    this.load();
    wx.showToast({
      title: next === 'recruiter' ? '已切换到招人方' : '已切换到应聘方',
      icon: 'none',
    });
  },
  switchRole() {
    if (!this.data.canSwitchRole || !this.data.otherApprovedRole) {
      wx.showToast({ title: '需要两个已通过的身份才能切换', icon: 'none' });
      return;
    }
    this.applyRole(this.data.otherApprovedRole);
  },
  onIdentityTap(event) {
    const role = event.currentTarget.dataset.role;
    const status = event.currentTarget.dataset.status;
    if (!role) return;
    if (status !== 'approved') {
      wx.showToast({
        title: status === 'pending_review' ? '该身份审核中' : '请先按要求修改后重提',
        icon: 'none',
      });
      return;
    }
    if (role === this.data.role) return;
    this.applyRole(role);
  },
  createOtherRole() {
    const hasRecruiter = this.data.identities.some((item) => item.role === 'recruiter');
    const role = hasRecruiter ? 'applicant' : 'recruiter';
    wx.navigateTo({ url: `/pages/register/register?role=${role}` });
  },
  fetchPublications(role = this.data.role) {
    if (role === 'recruiter') {
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
