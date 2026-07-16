import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bootstrapAdmin,
  countActiveOwners,
  completeMediaUpload,
  createMediaUpload,
  createRecruitmentPost,
  createAdminAccount,
  createAdminSession,
  createDatabase,
  createSession,
  createUserForProvider,
  findAdminByLogin,
  findAdminById,
  findAdminSession,
  findRoleProfileForUser,
  findSessionUser,
  getApplicantJobSeekingInformation,
  mapApplicantJobSeekingInformation,
  getRecruiterInformation,
  mapRecruiterInformation,
  getRecruitmentPost,
  grantReviewer,
  listRecruitmentPosts,
  listAdminAccounts,
  listUsers,
  getUser,
  createManagedUser,
  updateManagedUser,
  updateRoleProfile,
  createIdentity,
  updateIdentityForResubmit,
  identityFromRow,
  identityRow,
  normalizeRow,
  listIdentityRows,
  summaryFromRow,
  profileFromRow,
  reviewRows,
  decideReview,
  disableUser,
  listMarketRecruitmentPosts,
  mapMarketRecruitmentPosts,
  getMarketRecruitmentPost,
  listMarketJobSeekingInformation,
  mapMarketJobSeekingInformation,
  getMarketJobSeekingInformation,
  getPublicRecruitmentImage,
  setMarketVisibility,
  setFavorite,
  listFavorites,
  createMarketReport,
  createMarketUserBlock,
  listMarketUserBlocks,
  deleteMarketUserBlock,
  listMarketReports,
  listAdminMarketContent,
  listAdminAuditLogs,
  decideMarketContent,
  resolveMarketReport,
  recordContactView,
  recordAdminAudit,
  revokeAdminSession,
  touchAdminLogin,
  updateRecruitmentPost,
  updateAdminLogin,
  upsertApplicantJobSeekingInformation,
  upsertRecruiterInformation,
  renewMarketPublication,
  verifyPassword,
} from './db.js';
import { createWeChatExchange, createWeChatPhoneExchange } from './wechat.js';
import {
  startConversation, listConversations, getConversation, listMessages, sendMessage,
  markConversationRead, endConversation, createApplication, listApplicationsForApplicant,
  listApplicationsForRecruiter, updateApplicationStatus, createInterview, listInterviews,
  respondInterview, cancelInterview,
} from './collaboration.js';
import {
  createRateLimiter, httpError, send, sendBinary, sendError, readJson,
  assertRequired, assertMaxLengths, assertPhone, normalizedPhone, assertCoordinates, text, tokenHash, isoAfter,
} from './http.js';
import {
  roles, statusValues, adminRoles, imageTypes, maxImageBytes,
  assertJobSeekingInformation, assertRecruiterInformation, assertImageKeys, assertRecruitmentPost,
  assertManagedUser, assertMarketTarget, assertConversationTarget, assertApplicationCreate,
  adminMarketContentQuery, assertMarketModerationDecision,
  marketMapQuery, marketListQuery, validateProfile,
  multipartFile, detectImageContentType, readBuffer,
} from './domain/validators.js';
import { handleRequest } from './routes/index.js';

function authenticate(request, db) {
  const header = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw httpError(401, 'UNAUTHORIZED', '需要登录');
  const user = findSessionUser(db, tokenHash(match[1]));
  if (!user || user.status !== 'active') throw httpError(401, 'UNAUTHORIZED', '登录已失效');
  return user;
}

function adminAccount(admin) {
  return {
    id: admin.user_id,
    loginName: admin.login_name,
    status: admin.status,
    role: admin.role,
    ...(admin.last_login_at ? { lastLoginAt: admin.last_login_at } : {}),
  };
}

function adminBearer(request) {
  const header = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw httpError(401, 'UNAUTHORIZED', '需要管理员登录');
  return match[1];
}

function authenticateAdmin(request, db) {
  const admin = findAdminSession(db, tokenHash(adminBearer(request)));
  if (!admin || admin.status !== 'active') throw httpError(401, 'UNAUTHORIZED', '管理员登录已失效');
  return admin;
}

function requireAdminRole(admin, allowedRoles) {
  if (!allowedRoles.includes(admin.role)) throw httpError(403, 'FORBIDDEN', '没有管理员权限');
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertAdminAccountMutation(db, actor, target, changes) {
  if (actor.role !== 'owner') {
    if (target.role === 'owner') throw httpError(403, 'OWNER_PROTECTED', '非所有者不能操作所有者账号');
    if (hasOwn(changes, 'role')) throw httpError(403, 'FORBIDDEN', '只有所有者可以修改管理员角色');
  }
  const disablesOwner = target.role === 'owner' && target.status === 'active'
    && ((hasOwn(changes, 'status') && changes.status === 'disabled')
      || (hasOwn(changes, 'role') && changes.role !== 'owner'));
  if (disablesOwner && countActiveOwners(db) <= 1) {
    throw httpError(409, 'LAST_OWNER_PROTECTED', '必须保留至少一个启用的所有者账号');
  }
}

export function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const bootstrap = options.bootstrapAdmin || {
    loginName: process.env.ADMIN_BOOTSTRAP_LOGIN_NAME,
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  };
  if (process.env.NODE_ENV === 'production' && bootstrap.password) {
    throw new Error('管理员 bootstrap 在 production 环境被禁止');
  }
  bootstrapAdmin(db, bootstrap);
  const exchange = options.wechatExchange || createWeChatExchange(options.wechat || {});
  const exchangePhone = options.wechatPhoneExchange || createWeChatPhoneExchange(options.wechat || {});
  const sessionTtlMs = options.sessionTtlMs || 7 * 24 * 60 * 60 * 1000;
  const adminSessionTtlMs = options.adminSessionTtlMs || 8 * 60 * 60 * 1000;
  const mediaRoot = options.mediaRoot || process.env.MEDIA_ROOT || join(process.cwd(), 'media');
  const consumeRateLimit = createRateLimiter();

  const deps = {
    db, exchange, exchangePhone, sessionTtlMs, adminSessionTtlMs, mediaRoot, consumeRateLimit,
    send, sendBinary, sendError, readJson, httpError, assertRequired, assertMaxLengths, assertPhone,
    normalizedPhone, assertCoordinates, text, tokenHash, isoAfter,
    authenticate, authenticateAdmin, requireAdminRole, adminBearer, adminAccount,
    validateProfile, createIdentity, updateIdentityForResubmit, identityFromRow, identityRow, normalizeRow, listIdentityRows, summaryFromRow, profileFromRow,
    assertJobSeekingInformation, assertRecruiterInformation, assertImageKeys, assertRecruitmentPost, assertManagedUser, assertMarketTarget,
    assertConversationTarget, assertApplicationCreate,
    adminMarketContentQuery, assertMarketModerationDecision, marketMapQuery, marketListQuery,
    mapApplicantJobSeekingInformation, mapRecruiterInformation, multipartFile, detectImageContentType, readBuffer,
    decideReview, reviewRows, assertAdminAccountMutation, hasOwn,
    randomBytes, mkdir, readFile, writeFile, join,
    createUserForProvider, createSession, findSessionUser, findRoleProfileForUser, updateRoleProfile, grantReviewer,
    getApplicantJobSeekingInformation, upsertApplicantJobSeekingInformation, getRecruiterInformation, upsertRecruiterInformation,
    createMediaUpload, completeMediaUpload, listRecruitmentPosts, createRecruitmentPost, getRecruitmentPost, updateRecruitmentPost,
    listUsers, getUser, createManagedUser, updateManagedUser, disableUser,
    listMarketRecruitmentPosts, mapMarketRecruitmentPosts, getMarketRecruitmentPost, listMarketJobSeekingInformation, mapMarketJobSeekingInformation, getMarketJobSeekingInformation, getPublicRecruitmentImage,
    setMarketVisibility, renewMarketPublication, setFavorite, listFavorites, createMarketReport, createMarketUserBlock, listMarketUserBlocks, deleteMarketUserBlock,
    listMarketReports, listAdminMarketContent, listAdminAuditLogs, decideMarketContent, resolveMarketReport, recordContactView, recordAdminAudit,
    findAdminByLogin, findAdminById, findAdminSession, listAdminAccounts, createAdminAccount, updateAdminLogin, touchAdminLogin, createAdminSession, revokeAdminSession, verifyPassword, countActiveOwners,
    startConversation, listConversations, getConversation, listMessages, sendMessage, markConversationRead, endConversation,
    createApplication, listApplicationsForApplicant, listApplicationsForRecruiter, updateApplicationStatus, createInterview, listInterviews, respondInterview, cancelInterview,
    maxImageBytes, imageTypes, roles, statusValues, adminRoles,
  };

  const handler = async (request, response) => handleRequest(request, response, deps);
  handler.db = db;
  handler.grantReviewer = (userId) => grantReviewer(db, userId);
  handler.close = () => db.close();
  return handler;
}

