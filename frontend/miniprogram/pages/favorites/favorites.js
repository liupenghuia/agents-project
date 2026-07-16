const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');
const { getActiveRole, setActiveRole } = require('../../utils/workspace');
const navigation = require('../../utils/navigation');

function actionsForRole(role) {
  return role === 'applicant'
    ? { list: api.listRecruitmentFavorites, remove: api.unfavoriteRecruitmentPost }
    : { list: api.listJobSeekingFavorites, remove: api.unfavoriteJobSeekingInformation };
}

Page({
  data: { role: 'applicant', items: [], loading: true, submitting: false, removingId: '', error: '' },
  onLoad(options) {
    const role = setActiveRole(options.role || getActiveRole() || 'applicant') || 'applicant';
    this.setData({ role });
    this.load();
  },
  load() {
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => actionsForRole(this.data.role).list(),
      mapSuccess: (items) => ({ items: items || [] }),
    }).catch(() => {});
  },
  remove(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.submitting) return;
    wx.showModal({
      title: '取消收藏',
      content: '确认从收藏中移除这条信息？',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ removingId: id });
        runRequest({
          getState: () => this.data,
          setState: (patch) => this.setData(patch),
          mode: 'submit',
          request: () => actionsForRole(this.data.role).remove(id),
          mapSuccess: () => ({
            items: this.data.items.filter((item) => item.id !== id),
            removingId: '',
          }),
        }).catch(() => this.setData({ removingId: '' }));
      },
    });
  },
  open(event) { navigation.openMarketDetail(this.data.role, event.currentTarget.dataset.id); },
  openMarket() { navigation.openMainTab('map', { role: this.data.role }); },
  openList() { navigation.openMainTab('list', { role: this.data.role }); },
  openMyCenter() { navigation.openMainTab('my', { role: this.data.role }); },
  retry() { this.load(); },
});
