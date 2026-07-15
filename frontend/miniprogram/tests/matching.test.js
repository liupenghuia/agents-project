const assert = require('assert');
const { matchMarketItem } = require('../utils/matching');

const result = matchMarketItem(
  { jobType: '前端开发', salaryRange: '8K-12K', settlementMethod: '月结', locationText: '上海浦东' },
  { jobTypeName: '前端', expectedSalary: '8K-10K', workMethod: 'monthly_settlement', locationText: '浦东' },
);
assert.strictEqual(result.score, 100);
assert.deepStrictEqual(result.reasons, ['工种相符', '位置相近', '工作方式匹配', '薪资范围接近']);
console.log('matching tests passed');
