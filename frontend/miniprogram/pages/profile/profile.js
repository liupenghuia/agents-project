const api = require('../../services/api');

Page({
  data: { role: 'applicant', identity: null, form: {}, loading: true, saving: false, error: '', saved: false },
  onLoad(options) { this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' }); this.load(); },
  load() {
    this.setData({ loading: true, error: '' });
    api.listIdentities().then((items) => {
      const identity = (items || []).find((item) => item.role === this.data.role);
      if (!identity) throw new Error('当前身份不存在');
      return api.getIdentity(identity.id);
    }).then((identity) => this.setData({ identity, form: { ...(identity.profile || {}) }, loading: false }))
      .catch((error) => this.setData({ loading: false, error: error.message }));
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, error: '', saved: false }); },
  save() {
    if (this.data.saving || !this.data.identity) return;
    this.setData({ saving: true, error: '', saved: false });
    api.updateIdentityProfile(this.data.identity.id, this.data.form)
      .then((identity) => this.setData({ identity, form: { ...(identity.profile || {}) }, saving: false, saved: true }))
      .catch((error) => this.setData({ saving: false, error: error.message }));
  },
  retry() { this.load(); },
});
