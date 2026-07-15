import { createHash } from 'node:crypto';

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
export const MAX_BODY_BYTES = 1024 * 1024;

export const text = (value) => String(value ?? '').trim();
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const isoAfter = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();

export function createRateLimiter() {
  const buckets = new Map();
  return (key, maximum, windowMs) => {
    const timestamp = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt <= timestamp) bucket = { count: 0, expiresAt: timestamp + windowMs };
    if (bucket.count >= maximum) return false;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets) {
        if (value.expiresAt <= timestamp) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}

export function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function send(response, status, payload) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

export function sendBinary(response, status, contentType, body) {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
}

export function sendError(response, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  send(response, status, {
    error: { code: error.code || 'INTERNAL_ERROR', message: status === 500 ? '服务暂时不可用' : error.message },
  });
}

export async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw httpError(400, 'INVALID_JSON', '请求 JSON 格式无效');
  }
}

export function assertRequired(body, fields) {
  const missing = fields.find((field) => !text(body[field]));
  if (missing) throw httpError(422, 'VALIDATION_ERROR', `缺少必填字段：${missing}`);
}

export function assertMaxLengths(body, limits) {
  for (const [field, maximum] of Object.entries(limits)) {
    if (body[field] !== undefined && String(body[field]).length > maximum) {
      throw httpError(422, 'VALIDATION_ERROR', `${field} 长度不能超过 ${maximum}`);
    }
  }
}

export function assertPhone(phone) {
  if (!/^\+?[0-9 -]{5,32}$/.test(text(phone))) throw httpError(422, 'VALIDATION_ERROR', '手机号格式无效');
}

export function normalizedPhone(phone) {
  return text(phone).replace(/[\s-]/g, '');
}

export function assertCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw httpError(422, 'VALIDATION_ERROR', '位置坐标无效');
  }
}
