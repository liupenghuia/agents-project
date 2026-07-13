const fields = {
  recruiter: ['organizationName', 'organizationType', 'contactName', 'contactPhone', 'region', 'industryOrJobDirection'],
  applicant: ['displayName', 'contactPhone', 'region', 'desiredJob', 'experienceSummary', 'preferredRegionOrTime'],
};

function validateRegistration(role, form, agreed) {
  if (!agreed) return '请先阅读并同意用户协议和隐私政策';
  const missing = fields[role].find((field) => !String(form[field] || '').trim());
  if (missing) return '请完整填写带有 * 的资料';
  if (!/^\+?[0-9 -]{5,32}$/.test(form.contactPhone.trim())) return '请填写有效的手机号';
  return '';
}

module.exports = { fields, validateRegistration };
