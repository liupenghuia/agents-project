/** @param {any} ctx */
export async function tryHandleAdmin(ctx) {
  const d = ctx;
  const {
    request, response, path, url, body, uploadPath, publicMediaPath,
    db, exchange, exchangePhone, sessionTtlMs, adminSessionTtlMs, mediaRoot, consumeRateLimit,
    send, sendBinary, httpError, assertRequired, assertMaxLengths, text, tokenHash, isoAfter,
    authenticate, authenticateAdmin, requireAdminRole, adminBearer, adminAccount,
    validateProfile, createIdentity, updateIdentityForResubmit, listIdentityRows, identityFromRow, normalizeRow, identityRow,
    assertJobSeekingInformation, assertRecruiterInformation, assertRecruitmentPost, assertManagedUser, assertMarketTarget,
    adminMarketContentQuery, assertMarketModerationDecision, marketMapQuery, marketListQuery,
    mapApplicantJobSeekingInformation, mapRecruiterInformation, multipartFile, detectImageContentType, readBuffer,
    decideReview, reviewRows, assertAdminAccountMutation,
    randomBytes, mkdir, readFile, writeFile, join,
    createUserForProvider, createSession, findRoleProfileForUser, updateRoleProfile,
    getApplicantJobSeekingInformation, upsertApplicantJobSeekingInformation, getRecruiterInformation, upsertRecruiterInformation,
    createMediaUpload, completeMediaUpload, listRecruitmentPosts, createRecruitmentPost, getRecruitmentPost, updateRecruitmentPost,
    listUsers, getUser, createManagedUser, updateManagedUser, disableUser,
    listMarketRecruitmentPosts, mapMarketRecruitmentPosts, getMarketRecruitmentPost, listMarketJobSeekingInformation, mapMarketJobSeekingInformation, getMarketJobSeekingInformation, getPublicRecruitmentImage,
    setMarketVisibility, renewMarketPublication, setFavorite, listFavorites, createMarketReport, createMarketUserBlock, listMarketUserBlocks, deleteMarketUserBlock,
    listMarketReports, listAdminMarketContent, listAdminAuditLogs, decideMarketContent, resolveMarketReport, recordContactView, recordAdminAudit,
    findAdminByLogin, findAdminSession, listAdminAccounts, createAdminAccount, updateAdminLogin, touchAdminLogin, createAdminSession, revokeAdminSession, verifyPassword, countActiveOwners,
    startConversation, listConversations, getConversation, listMessages, sendMessage, markConversationRead, endConversation,
    createApplication, listApplicationsForApplicant, listApplicationsForRecruiter, updateApplicationStatus, createInterview, listInterviews, respondInterview, cancelInterview,
    maxImageBytes, imageTypes, adminRoles, hasOwn, findAdminById,
  } = d;

      const adminAccountPath = /^\/admin\/accounts\/([^/]+)$/u.exec(path);
      if (request.method === 'POST' && path === '/admin/auth/login') {
        if (!consumeRateLimit(`admin-login:${request.socket.remoteAddress}`, 10, 15 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试');
        assertRequired(body, ['loginName', 'password']);
        assertMaxLengths(body, { loginName: 120, password: 256 });
        const admin = findAdminByLogin(db, text(body.loginName));
        if (!admin || admin.status !== 'active' || !verifyPassword(text(body.password), admin.password_hash)) {
          throw httpError(401, 'UNAUTHORIZED', '管理员账号或密码错误');
        }
        touchAdminLogin(db, admin.user_id);
        recordAdminAudit(db, admin.user_id, 'admin.login.succeeded', 'admin_account', admin.user_id);
        const token = randomBytes(32).toString('base64url');
        createAdminSession(db, admin.user_id, tokenHash(token), isoAfter(adminSessionTtlMs));
        const current = findAdminSession(db, tokenHash(token));
        send(response, 200, { data: { token, expiresAt: isoAfter(adminSessionTtlMs), admin: adminAccount(current) } }); return true;
      }

      if (request.method === 'POST' && path === '/admin/auth/logout') {
        const token = adminBearer(request);
        revokeAdminSession(db, tokenHash(token));
        send(response, 204, null); return true;
      }

      if (request.method === 'GET' && path === '/admin/auth/me') {
        send(response, 200, { data: adminAccount(authenticateAdmin(request, db)) }); return true;
      }

      if (request.method === 'GET' && path === '/admin/accounts') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        send(response, 200, { data: listAdminAccounts(db) }); return true;
      }

      if (request.method === 'POST' && path === '/admin/accounts') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        assertRequired(body, ['loginName', 'password', 'role']);
        if (!adminRoles.has(text(body.role))) throw httpError(422, 'VALIDATION_ERROR', '管理员角色无效');
        if (admin.role !== 'owner' && text(body.role) === 'owner') throw httpError(403, 'OWNER_PROTECTED', '非所有者不能创建所有者账号');
        if (text(body.loginName).length > 120) throw httpError(422, 'VALIDATION_ERROR', '管理员账号长度无效');
        if (text(body.password).length < 12 || text(body.password).length > 256) throw httpError(422, 'VALIDATION_ERROR', '管理员密码长度必须为 12 到 256 位');
        try {
          send(response, 201, { data: createAdminAccount(db, { loginName: text(body.loginName), password: text(body.password), role: text(body.role), createdBy: admin.user_id }) }); return true;
        } catch (error) {
          if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'ADMIN_EXISTS', '管理员账号已存在');
          throw error;
        }
      }

      if (request.method === 'PATCH' && adminAccountPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        if (!['password', 'status', 'role'].some((field) => hasOwn(body, field))) throw httpError(422, 'VALIDATION_ERROR', '至少需要修改一个管理员字段');
        if (hasOwn(body, 'status') && !['active', 'disabled'].includes(text(body.status))) throw httpError(422, 'VALIDATION_ERROR', '管理员状态无效');
        if (hasOwn(body, 'role') && !adminRoles.has(text(body.role))) throw httpError(422, 'VALIDATION_ERROR', '管理员角色无效');
        if (hasOwn(body, 'password') && (text(body.password).length < 12 || text(body.password).length > 256)) throw httpError(422, 'VALIDATION_ERROR', '管理员密码长度必须为 12 到 256 位');
        const target = findAdminById(db, adminAccountPath[1]);
        if (!target) throw httpError(404, 'ADMIN_NOT_FOUND', '管理员不存在');
        const changes = {
          ...(hasOwn(body, 'password') ? { password: text(body.password) } : {}),
          ...(hasOwn(body, 'status') ? { status: text(body.status) } : {}),
          ...(hasOwn(body, 'role') ? { role: text(body.role) } : {}),
        };
        assertAdminAccountMutation(db, admin, target, changes);
        const updated = updateAdminLogin(db, adminAccountPath[1], changes, admin.user_id);
        send(response, 200, { data: updated }); return true;
      }

      if (request.method === 'GET' && path === '/admin/audit-logs') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner']);
        const limit = Number(url.searchParams.get('limit') || 100);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw httpError(422, 'VALIDATION_ERROR', '审计日志数量限制无效');
        send(response, 200, { data: listAdminAuditLogs(db, limit) }); return true;
      }


  return false;
}
