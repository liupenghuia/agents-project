const assert = require('assert');
const { validateRegistration } = require('../utils/registration');

const recruiter = { organizationName: '远山科技', organizationType: 'company', contactName: '李明', contactPhone: '13800138000', region: '上海', industryOrJobDirection: '软件开发' };
const applicant = { displayName: '小林', contactPhone: '13800138000', region: '杭州', desiredJob: '产品经理', experienceSummary: '三年相关经验', preferredRegionOrTime: '杭州，工作日' };

assert.strictEqual(validateRegistration('recruiter', recruiter, false), '请先阅读并同意用户协议和隐私政策');
assert.strictEqual(validateRegistration('recruiter', { ...recruiter, contactName: '' }, true), '请完整填写带有 * 的资料');
assert.strictEqual(validateRegistration('applicant', { ...applicant, contactPhone: 'bad' }, true), '请填写有效的手机号');
assert.strictEqual(validateRegistration('recruiter', recruiter, true), '');
assert.strictEqual(validateRegistration('applicant', applicant, true), '');
console.log('registration validation tests passed');
