import { httpError } from '../http.js';

/**
 * Stable HTTP status by domain error code.
 * Prefer throwing httpError (with status) from domain code; this mapper
 * also accepts code-only errors and string sentinel messages.
 */
export const DOMAIN_CODE_STATUS = Object.freeze({
  APPROVED_IDENTITY_REQUIRED: 403,
  IDENTITY_REQUIRED: 403,
  FORBIDDEN: 403,
  BLOCKED: 403,
  CONVERSATION_BLOCKED: 403,
  CONVERSATION_INACTIVE: 403,
  OWNER_PROTECTED: 403,
  UNAUTHORIZED: 401,
  TARGET_UNAVAILABLE: 404,
  INVALID_TARGET: 404,
  CONVERSATION_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  INTERVIEW_NOT_FOUND: 404,
  IDENTITY_NOT_FOUND: 404,
  POST_NOT_FOUND: 404,
  INFORMATION_NOT_FOUND: 404,
  MARKET_NOT_FOUND: 404,
  REPORT_NOT_FOUND: 404,
  BLOCK_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  ADMIN_NOT_FOUND: 404,
  MEDIA_NOT_FOUND: 404,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INVALID_TRANSITION: 422,
  INVALID_MAP_VIEWPORT: 422,
  INVALID_BLOCK_TARGET: 422,
  INVALID_IMAGE_CONTENT: 422,
  INVALID_UPLOAD: 422,
  INVALID_IMAGE_REFERENCES: 422,
  PHONE_IMMUTABLE: 409,
  IDENTITY_EXISTS: 409,
  PHONE_ROLE_BOUND: 409,
  INVALID_IDENTITY_STATE: 409,
  LAST_OWNER_PROTECTED: 409,
  INVALID_MARKET_TRANSITION: 409,
  EMAIL_EXISTS: 409,
  ADMIN_EXISTS: 409,
  RATE_LIMITED: 429,
  CONTACT_RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
});

const MESSAGE_TO_ERROR = Object.freeze({
  COUNTERPART_IDENTITY_REQUIRED: {
    status: 403,
    code: 'APPROVED_IDENTITY_REQUIRED',
    message: '需要对应已审核通过的身份',
  },
  INVALID_IMAGE_REFERENCES: {
    status: 422,
    code: 'INVALID_IMAGE_REFERENCES',
    message: '图片上传引用无效或已过期，请重新上传',
  },
});

/**
 * Normalize a domain/runtime error into an httpError when possible.
 * Returns the same error if already has status+code, or if unmapped.
 */
export function normalizeDomainError(error, extraCodeStatus = {}) {
  if (!error) return error;
  if (Number.isInteger(error.status) && error.code) return error;

  const messageMap = MESSAGE_TO_ERROR[error.message];
  if (messageMap) {
    return httpError(messageMap.status, messageMap.code, messageMap.message);
  }

  if (error.message === 'INVALID_MARKET_TRANSITION') {
    return httpError(
      409,
      'INVALID_MARKET_TRANSITION',
      `当前内容状态 ${error.currentStatus} 不允许该操作`,
    );
  }

  const status = { ...DOMAIN_CODE_STATUS, ...extraCodeStatus }[error.code];
  if (status) return httpError(status, error.code, error.message);
  return error;
}

/** Rethrow after normalizeDomainError — for route try/catch blocks. */
export function rethrowDomainError(error, extraCodeStatus = {}) {
  throw normalizeDomainError(error, extraCodeStatus);
}
