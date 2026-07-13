const { createIdentity, resubmitIdentity } = require('../../services/api');
const { validateRegistration } = require('../../utils/registration');

Page({
  data: { role: 'recruiter', editingId: '', form: {}, submitting: false, agreed: false, error: '', fromChanges: false, organizationTypeLabel: '' },
  onLoad(options) {
    const role = options.role === 'applicant' ? 'applicant' : 'recruiter';
    this.setData({ role, editingId: options.identityId || '', fromChanges: !!options.identityId });
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, error: '' }); },
  pickType(event) {
    const values = ['company', 'individual', 'other'];
    const labels = ['企业', '个体', '个人/其他'];
    this.setData({ 'form.organizationType': values[event.detail.value], organizationTypeLabel: labels[event.detail.value], error: '' });
  },
  toggleAgreement(event) { this.setData({ agreed: event.detail.value.length > 0, error: '' }); },
  getPhone(event) {
    if (event.detail.errMsg && event.detail.errMsg.includes('ok')) this.setData({ 'form.contactPhone': event.detail.phoneNumber, error: '' });
    else this.setData({ error: '未获取到手机号，请手动填写或重新授权' });
  },
  validate() {
    return validateRegistration(this.data.role, this.data.form, this.data.agreed);
  },
  submit() {
    if (this.data.submitting) return;
    const error = this.validate();
    if (error) { this.setData({ error }); return; }
    this.setData({ submitting: true, error: '' });
    const action = this.data.editingId ? resubmitIdentity(this.data.editingId, this.data.form) : createIdentity(this.data.role, this.data.form);
    action.then((identity) => {
      wx.redirectTo({ url: `/pages/identities/identities?identityId=${identity.id}` });
    }).catch((err) => this.setData({ submitting: false, error: err.statusCode === 409 ? '这个身份已经提交过了，请在身份页查看审核状态' : err.message }));
  },
});
