function coordinatesValid(form) {
  return Number.isFinite(Number(form.latitude)) && Number(form.latitude) >= -90 && Number(form.latitude) <= 90
    && Number.isFinite(Number(form.longitude)) && Number(form.longitude) >= -180 && Number(form.longitude) <= 180;
}

function validateApplicantInformation(form) {
  if (!form.jobTypeName || !form.age || !form.expectedSalary || !form.workMethod || !form.locationText) return '请完整填写工种、年龄、薪资、工作方式和位置';
  const age = Number(form.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) return '年龄必须填写 1 到 120 的整数';
  if (!coordinatesValid(form)) return '请选择并确认工作位置';
  return '';
}

function validateRecruiterInformation(form) {
  if (!form.detailedAddress) return '请填写精确到楼栋的详细地址';
  return coordinatesValid(form) ? '' : '请先获取并确认位置';
}

function validateRecruitmentPost(form, imageCount) {
  if (!form.jobType || !form.salaryRange || !form.settlementMethod || !form.locationText) return '请完整填写工种、薪资、结算方式和位置';
  if (!coordinatesValid(form)) return '请先获取并确认位置';
  return imageCount > 6 ? '最多上传 6 张图片' : '';
}

function sensitiveContentHints(form = {}) {
  const text = Object.values(form).filter((value) => typeof value === 'string').join(' ');
  const hints = [];
  if (/(?:微信|wx|wechat)\s*[:：]?\s*[a-zA-Z0-9_-]{4,}/i.test(text) || /1[3-9]\d{9}/.test(text)) {
    hints.push('检测到疑似联系方式，请勿在公开字段中填写手机号或微信号');
  }
  if (/(号楼|单元|室|栋)/.test(text) && text.length > 8) {
    hints.push('位置描述尽量使用区域级信息，楼栋级地址仅在发布者位置信息中保存');
  }
  return hints;
}

module.exports = { validateApplicantInformation, validateRecruiterInformation, validateRecruitmentPost, sensitiveContentHints };
