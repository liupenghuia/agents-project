import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createRateLimiter, httpError, send, sendBinary, sendError, readJson,
  assertRequired, assertMaxLengths, assertPhone, normalizedPhone, assertCoordinates, text, tokenHash, isoAfter,
} from './http.js';
import {
  authenticate, authenticateAdmin, requireAdminRole, adminBearer, adminAccount,
  assertAdminAccountMutation, hasOwn,
} from './domain/request-auth.js';

/**
 * Composition-root dependency bag for HTTP handlers.
 * Domain stores are imported directly by route modules; deps only carry
 * shared infrastructure (db, auth, rate limit, http helpers, media, wechat).
 */
export function createDeps({
  db,
  exchange,
  exchangePhone,
  sessionTtlMs,
  adminSessionTtlMs,
  mediaRoot,
  consumeRateLimit = createRateLimiter(),
} = {}) {
  return {
    db,
    exchange,
    exchangePhone,
    sessionTtlMs,
    adminSessionTtlMs,
    mediaRoot,
    consumeRateLimit,

    send,
    sendBinary,
    sendError,
    readJson,
    httpError,
    assertRequired,
    assertMaxLengths,
    assertPhone,
    normalizedPhone,
    assertCoordinates,
    text,
    tokenHash,
    isoAfter,

    authenticate,
    authenticateAdmin,
    requireAdminRole,
    adminBearer,
    adminAccount,
    assertAdminAccountMutation,
    hasOwn,

    randomBytes,
    mkdir,
    readFile,
    writeFile,
    join,
  };
}
