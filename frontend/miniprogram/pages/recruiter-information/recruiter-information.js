const { getRecruiterInformation, saveRecruiterInformation } = require('../../services/api');
const { validateRecruiterInformation } = require('../../utils/information');

Page({
  data: { loading: true, saving: false, error: '', saved: false, form: {} },

  onLoad() { this.load(); },

  load() {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(getRecruiterInformation).then((information) => {
      this.setData({ loading: false, form: information || {} });
    }).catch((error) => this.setData({ loading: false, error: error.message }));
  },

  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, error: '', saved: false }); },

  chooseLocation() {
    wx.chooseLocation({
      success: (location) => this.setData({ 'form.latitude': location.latitude, 'form.longitude': location.longitude, 'form.locationText': location.name || location.address, error: '', saved: false }),
      fail: () => this.setData({ error: '定位未完成，请允许定位权限后重试' }),
    });
  },

  validate() {
    return validateRecruiterInformation(this.data.form);
  },

  submit() {
    if (this.data.saving) return;
    const error = this.validate();
    if (error) { this.setData({ error }); return; }
    this.setData({ saving: true, error: '', saved: false });
    saveRecruiterInformation(this.data.form).then((information) => this.setData({ saving: false, saved: true, form: information }))
      .catch((requestError) => this.setData({ saving: false, error: requestError.message }));
  },

  retry() { this.load(); },
});
