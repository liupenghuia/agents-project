const assert = require('assert');
const {
  validateApplicantInformation, validateRecruiterInformation, validateRecruitmentPost, sensitiveContentHints,
} = require('../utils/information');

const applicant = { jobTypeName: '前端开发', age: 28, expectedSalary: '15K-20K', workMethod: 'monthly_settlement', locationText: '上海', latitude: 31, longitude: 121 };
const recruiter = { detailedAddress: '3 栋 502 室', latitude: 31, longitude: 121 };
const post = { jobType: '服务员', salaryRange: '5K-8K', settlementMethod: '月结', locationText: '上海', latitude: 31, longitude: 121 };

assert.strictEqual(validateApplicantInformation(applicant), '');
assert.strictEqual(validateApplicantInformation({ ...applicant, age: 121 }), '年龄必须填写 1 到 120 的整数');
assert.strictEqual(validateApplicantInformation({ ...applicant, longitude: undefined }), '请选择并确认工作位置');
assert.strictEqual(validateRecruiterInformation(recruiter), '');
assert.strictEqual(validateRecruiterInformation({ ...recruiter, detailedAddress: '' }), '请填写精确到楼栋的详细地址');
assert.strictEqual(validateRecruitmentPost(post, 6), '');
assert.strictEqual(validateRecruitmentPost(post, 7), '最多上传 6 张图片');
assert.ok(sensitiveContentHints({ settlementMethod: '微信:wx12345' }).some((item) => item.includes('联系方式')));
assert.ok(sensitiveContentHints({ locationText: '浦东新区 3 号楼 502 室' }).some((item) => item.includes('区域级')));
console.log('information validation tests passed');
