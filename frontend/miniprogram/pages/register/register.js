const { createIdentity, exchangePhone, getIdentity, resubmitIdentity } = require('../../services/api');
const { validateRegistration } = require('../../utils/registration');

Page({
  data: { role: 'recruiter', editingId: '', form: {}, loading: false, submitting: false, phoneAuthorizing: false, phoneAuthorized: false, agreed: false, error: '', fromChanges: false, organizationTypeLabel: '' },
  onLoad(options) {
    const role = options.role === 'applicant' ? 'applicant' : 'recruiter';
    const editingId = options.identityId || '';
    this.setData({ role, editingId, fromChanges: Boolean(editingId) });
    if (editingId) this.loadIdentity(editingId);
  },
  loadIdentity(identityId) {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(() => getIdentity(identityId)).then((identity) => {
      if (identity.role !== this.data.role) throw new Error('身份类型与当前表单不一致');
      const form = identity.profile || {};
      const typeLabels = { company: '企业', individual: '个体', other: '个人/其他' };
      this.setData({ loading: false, form, phoneAuthorized: true, agreed: true, organizationTypeLabel: typeLabels[form.organizationType] || '' });
    }).catch((error) => this.setData({ loading: false, error: error.message }));
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, error: '' }); },
  pickType(event) {
    const values = ['company', 'individual', 'other'];
    const labels = ['企业', '个体', '个人/其他'];
    this.setData({ 'form.organizationType': values[event.detail.value], organizationTypeLabel: labels[event.detail.value], error: '' });
  },
  toggleAgreement(event) {
    const value = event.detail && event.detail.value;
    const agreed = Array.isArray(value) ? value.includes('agree') : Boolean(value);
    this.setData({ agreed, error: '' });
  },
  preparePhoneAuth() {
    if (this.data.phoneAuthorizing) return;
    this.setData({ phoneAuthorizing: true, error: '' });
    this.phoneAuthTimer = setTimeout(() => this.setData({ phoneAuthorizing: false }), 3000);
  },
  getPhone(event) {
    clearTimeout(this.phoneAuthTimer);
    this.setData({ phoneAuthorizing: false });
    if (event.detail && event.detail.phoneNumber) {
      this.setData({ 'form.contactPhone': event.detail.phoneNumber, phoneAuthorized: true, error: '' });
      return;
    }
    if (event.detail && event.detail.code) {
      this.setData({ phoneAuthorizing: true, error: '' });
      exchangePhone(event.detail.code).then((phone) => {
        this.setData({ 'form.contactPhone': phone.purePhoneNumber || phone.phoneNumber, phoneAuthorized: true, error: '' });
      }).catch((err) => {
        this.setData({ error: err.message || '手机号获取失败，请手动填写手机号' });
      }).finally(() => this.setData({ phoneAuthorizing: false }));
      return;
    }
    this.setData({ error: '未获取到手机号，请手动填写或稍后重新授权' });
  },
  onUnload() { clearTimeout(this.phoneAuthTimer); },
  validate() {
    return validateRegistration(this.data.role, this.data.form, this.data.agreed);
  },
  submit() {
    if (this.data.loading || this.data.submitting) return;
    const error = this.validate();
    if (error) { this.setData({ error }); return; }
    if (!this.data.phoneAuthorized) { this.setData({ error: '请先完成微信手机号授权' }); return; }
    this.setData({ submitting: true, error: '' });
    const action = this.data.editingId ? resubmitIdentity(this.data.editingId, this.data.form) : createIdentity(this.data.role, this.data.form);
    action.then((identity) => {
      wx.redirectTo({ url: `/pages/identities/identities?identityId=${identity.id}` });
    }).catch((err) => this.setData({ submitting: false, error: err.code === 'PHONE_ROLE_BOUND' ? '该手机号已绑定其他角色，不能注册另一种角色' : err.statusCode === 409 ? '这个身份已经提交过了，请在身份页查看审核状态' : err.message }));
  },
});
