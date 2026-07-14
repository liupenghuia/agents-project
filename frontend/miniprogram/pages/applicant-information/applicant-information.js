const { disableApplicantJobSeekingInformation, getApplicantJobSeekingInformation, saveApplicantJobSeekingInformation } = require('../../services/api');
const { validateApplicantInformation } = require('../../utils/information');
const { ownerStatusView, savedMessage } = require('../../utils/market-status');

const workMethods = ['monthly_settlement', 'indefinite_duration'];
const workMethodLabels = { monthly_settlement: '月结', indefinite_duration: '不定时长' };

Page({
  data: { loading: true, saving: false, disabling: false, error: '', saved: false, savedMessage: '', form: {}, statusView: {}, workMethods, workMethodLabels, workMethodLabel: '' },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(getApplicantJobSeekingInformation).then((information) => {
      this.setData({ loading: false, form: information || {}, statusView: ownerStatusView(information || {}, Boolean(information)), workMethodLabel: information ? workMethodLabels[information.workMethod] : '' });
    }).catch((error) => this.setData({ loading: false, error: error.message }));
  },

  input(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value, error: '', saved: false });
  },

  pickWorkMethod(event) {
    const value = workMethods[event.detail.value];
    this.setData({ 'form.workMethod': value, workMethodLabel: workMethodLabels[value], error: '', saved: false });
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (location) => this.setData({ 'form.locationText': location.name || location.address, 'form.latitude': location.latitude, 'form.longitude': location.longitude, error: '', saved: false }),
      fail: () => this.setData({ error: '定位未完成，请允许定位权限后重试，或稍后再填写位置' }),
    });
  },

  validate() {
    return validateApplicantInformation(this.data.form);
  },

  submit() {
    if (this.data.saving) return;
    const error = this.validate();
    if (error) { this.setData({ error }); return; }
    this.setData({ saving: true, error: '', saved: false, savedMessage: '' });
    saveApplicantJobSeekingInformation({ ...this.data.form, age: Number(this.data.form.age) }).then((information) => {
      this.setData({ saving: false, saved: true, savedMessage: savedMessage(information.status), form: information, statusView: ownerStatusView(information, true) });
    }).catch((requestError) => this.setData({ saving: false, error: requestError.message }));
  },

  disable() {
    if (this.data.disabling || this.data.saving || this.data.form.status !== 'published') return;
    wx.showModal({ title: '下架求职信息', content: '下架后不会出现在公开列表和地图中，可以修改后重新提交。', success: (result) => {
      if (!result.confirm) return;
      this.setData({ disabling: true, error: '', saved: false });
      disableApplicantJobSeekingInformation().then(() => {
        const form = { ...this.data.form, status: 'disabled', disabledAt: new Date().toISOString(), moderationReason: '', moderatedAt: '' };
        this.setData({ disabling: false, form, statusView: ownerStatusView(form, true) });
        wx.showToast({ title: '已下架', icon: 'success' });
      }).catch((error) => this.setData({ disabling: false, error: error.message }));
    } });
  },

  retry() { this.load(); },
});
