function normalized(value) { return String(value || '').trim().toLowerCase(); }

function salaryNumbers(value) {
  return (String(value || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

function matchMarketItem(item, preference) {
  if (!item || !preference) return { score: 0, reasons: [] };
  const reasons = [];
  const desiredJob = normalized(preference.jobTypeName || preference.desiredJob);
  const targetJob = normalized(item.jobType || item.jobTypeName);
  if (desiredJob && targetJob && (targetJob.includes(desiredJob) || desiredJob.includes(targetJob))) reasons.push('工种相符');
  const preferredLocation = normalized(preference.locationText || preference.region);
  const targetLocation = normalized(item.locationText || item.region);
  if (preferredLocation && targetLocation && (targetLocation.includes(preferredLocation) || preferredLocation.includes(targetLocation))) reasons.push('位置相近');
  if (preference.workMethod && item.settlementMethod && (preference.workMethod === item.settlementMethod || (preference.workMethod === 'monthly_settlement' && item.settlementMethod.includes('月结')))) reasons.push('工作方式匹配');
  const expected = salaryNumbers(preference.expectedSalary);
  const offered = salaryNumbers(item.salaryRange);
  if (expected.length && offered.length && Math.max(...expected) >= Math.min(...offered) && Math.min(...expected) <= Math.max(...offered)) reasons.push('薪资范围接近');
  return { score: Math.min(100, reasons.length * 25), reasons };
}

module.exports = { matchMarketItem };
