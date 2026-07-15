export async function handleRequest(request, response, deps) {
  const {
    db, exchange, exchangePhone, sessionTtlMs, adminSessionTtlMs, mediaRoot, consumeRateLimit,
    send, sendBinary, sendError, readJson, httpError, assertRequired, assertMaxLengths, assertPhone,
    normalizedPhone, assertCoordinates, text, tokenHash, isoAfter,
    authenticate, authenticateAdmin, requireAdminRole, adminBearer, adminAccount,
    validateProfile, createIdentity, updateIdentityForResubmit, identityFromRow, identityRow, normalizeRow, listIdentityRows, summaryFromRow, profileFromRow,
    assertJobSeekingInformation, assertRecruiterInformation, assertImageKeys, assertRecruitmentPost, assertManagedUser, assertMarketTarget,
    adminMarketContentQuery, assertMarketModerationDecision, marketMapQuery, marketListQuery,
    mapApplicantJobSeekingInformation, mapRecruiterInformation, multipartFile, detectImageContentType, readBuffer,
    decideReview, reviewRows, assertAdminAccountMutation, hasOwn,
    randomBytes, mkdir, readFile, writeFile, join,
    // db ops
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
  } = deps;

    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'content-type, authorization');
    response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (request.method === 'OPTIONS') return send(response, 204, {});
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const uploadPath = /^\/me\/recruitment-posts\/image-upload\/([^/]+)$/u.exec(path);
      const publicMediaPath = /^\/market\/media\/([^/]+)$/u.exec(path);
      const body = ['POST', 'PUT', 'PATCH'].includes(request.method) && !uploadPath ? await readJson(request) : {};

      if (request.method === 'GET' && path === '/health') {
        return send(response, 200, { data: { status: 'ok', service: 'recruitment-backend' } });
      }

      if (request.method === 'GET' && publicMediaPath) {
        const image = getPublicRecruitmentImage(db, publicMediaPath[1]);
        if (!image) throw httpError(404, 'MEDIA_NOT_FOUND', '图片不存在');
        try {
          return sendBinary(response, 200, image.content_type, await readFile(join(mediaRoot, image.object_key)));
        } catch (error) {
          if (error.code === 'ENOENT') throw httpError(404, 'MEDIA_NOT_FOUND', '图片不存在');
          throw error;
        }
      }

      if (request.method === 'POST' && path === '/auth/wechat/session') {
        if (!consumeRateLimit(`wechat-session:${request.socket.remoteAddress}`, 60, 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '登录请求过于频繁，请稍后再试');
        assertRequired(body, ['code']);
        assertMaxLengths(body, { code: 512 });
        const provider = await exchange(text(body.code));
        const user = createUserForProvider(db, provider.providerSubject, provider.unionId);
        const sessionToken = randomBytes(32).toString('base64url');
        createSession(db, user.id, tokenHash(sessionToken), isoAfter(sessionTtlMs));
        return send(response, 200, { data: { userId: user.id, sessionToken, expiresAt: isoAfter(sessionTtlMs) } });
      }

      if (request.method === 'POST' && path === '/auth/wechat/phone') {
        authenticate(request, db);
        assertRequired(body, ['code']);
        assertMaxLengths(body, { code: 512 });
        return send(response, 200, { data: await exchangePhone(text(body.code)) });
      }

      if (request.method === 'POST' && path === '/me/recruitment-posts/image-upload-url') {
        const user = authenticate(request, db);
        if (!findRoleProfileForUser(db, user.id, 'recruiter')) throw httpError(403, 'IDENTITY_REQUIRED', '需要先创建招人身份');
        assertRequired(body, ['fileName', 'contentType', 'byteSize']);
        assertMaxLengths(body, { fileName: 255, contentType: 64 });
        const contentType = text(body.contentType);
        const byteSize = Number(body.byteSize);
        if (!imageTypes.has(contentType) || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > maxImageBytes) {
          throw httpError(422, 'VALIDATION_ERROR', '图片类型或大小无效');
        }
        const objectKey = `${user.id}-${randomBytes(16).toString('hex')}`;
        const expiresAt = isoAfter(15 * 60 * 1000);
        createMediaUpload(db, user.id, { objectKey, contentType, byteSize, expiresAt });
        return send(response, 200, { data: { objectKey, uploadUrl: `/me/recruitment-posts/image-upload/${objectKey}`, expiresAt } });
      }

      if (request.method === 'POST' && uploadPath) {
        const user = authenticate(request, db);
        const contentType = text(request.headers['content-type']);
        const file = multipartFile(await readBuffer(request), contentType);
        const detectedContentType = detectImageContentType(file);
        if (!detectedContentType) throw httpError(422, 'INVALID_IMAGE_CONTENT', '图片内容格式无效');
        const upload = completeMediaUpload(db, user.id, uploadPath[1], file.length, detectedContentType);
        if (!upload) throw httpError(422, 'INVALID_UPLOAD', '上传引用无效、已过期、类型不符或图片过大');
        await mkdir(mediaRoot, { recursive: true });
        await writeFile(join(mediaRoot, upload.object_key), file);
        return send(response, 200, { data: { objectKey: upload.object_key, contentType: upload.content_type, byteSize: file.length } });
      }

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
        return send(response, 200, { data: { token, expiresAt: isoAfter(adminSessionTtlMs), admin: adminAccount(current) } });
      }

      if (request.method === 'POST' && path === '/admin/auth/logout') {
        const token = adminBearer(request);
        revokeAdminSession(db, tokenHash(token));
        return send(response, 204, null);
      }

      if (request.method === 'GET' && path === '/admin/auth/me') {
        return send(response, 200, { data: adminAccount(authenticateAdmin(request, db)) });
      }

      if (request.method === 'GET' && path === '/admin/accounts') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        return send(response, 200, { data: listAdminAccounts(db) });
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
          return send(response, 201, { data: createAdminAccount(db, { loginName: text(body.loginName), password: text(body.password), role: text(body.role), createdBy: admin.user_id }) });
        } catch (error) {
          if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'ADMIN_EXISTS', '管理员账号已存在');
          throw error;
        }
      }

      const adminAccountPath = /^\/admin\/accounts\/([^/]+)$/u.exec(path);
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
        return send(response, 200, { data: updated });
      }

      if (request.method === 'GET' && path === '/admin/audit-logs') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner']);
        const limit = Number(url.searchParams.get('limit') || 100);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw httpError(422, 'VALIDATION_ERROR', '审计日志数量限制无效');
        return send(response, 200, { data: listAdminAuditLogs(db, limit) });
      }

      const userPath = /^\/users\/([^/]+)$/u.exec(path);
      if (request.method === 'GET' && path === '/users') {
        requireAdminRole(authenticateAdmin(request, db), ['owner', 'admin']);
        return send(response, 200, { data: listUsers(db) });
      }
      if (request.method === 'POST' && path === '/users') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        try {
          const user = createManagedUser(db, assertManagedUser(body));
          recordAdminAudit(db, admin.user_id, 'user.created', 'user', user.id, { email: user.email, name: user.name });
          return send(response, 201, { data: user });
        }
        catch (error) { if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'EMAIL_EXISTS', '邮箱已存在'); throw error; }
      }
      if (request.method === 'GET' && userPath) {
        requireAdminRole(authenticateAdmin(request, db), ['owner', 'admin']);
        const user = getUser(db, userPath[1]); if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
        return send(response, 200, { data: user });
      }
      if (request.method === 'PATCH' && userPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        try {
          const changes = assertManagedUser(body, true);
          if (!Object.keys(changes).length) throw httpError(422, 'VALIDATION_ERROR', '至少需要修改一个用户字段');
          const user = updateManagedUser(db, userPath[1], changes);
          if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
          recordAdminAudit(db, admin.user_id, 'user.updated', 'user', user.id, { changedFields: Object.keys(changes) });
          return send(response, 200, { data: user });
        }
        catch (error) { if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'EMAIL_EXISTS', '邮箱已存在'); throw error; }
      }
      if (request.method === 'DELETE' && userPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        const user = disableUser(db, userPath[1]); if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
        recordAdminAudit(db, admin.user_id, 'user.disabled', 'user', user.id);
        return send(response, 204, null);
      }

      const identityPath = /^\/me\/identities\/([^/]+)$/u.exec(path);
      const profilePath = /^\/me\/identities\/([^/]+)\/profile$/u.exec(path);
      const resubmitPath = /^\/me\/identities\/([^/]+)\/resubmit$/u.exec(path);
      const reviewDecisionPath = /^\/admin\/identity-reviews\/([^/]+)\/decision$/u.exec(path);
      const recruitmentPostPath = /^\/me\/recruitment-posts\/([^/]+)$/u.exec(path);
      const marketRecruitmentPath = /^\/market\/recruitment-posts\/([^/]+)$/u.exec(path);
      const marketApplicantPath = /^\/market\/job-seeking-information\/([^/]+)$/u.exec(path);
      const favoriteRecruitmentPath = /^\/me\/favorites\/recruitment-posts\/([^/]+)$/u.exec(path);
      const favoriteApplicantPath = /^\/me\/favorites\/job-seeking-information\/([^/]+)$/u.exec(path);
      const marketBlockPath = /^\/me\/market-user-blocks\/([^/]+)$/u.exec(path);
      const disablePostPath = /^\/me\/recruitment-posts\/([^/]+)\/disable$/u.exec(path);
      const adminMarketContentDecisionPath = /^\/admin\/market-content\/(recruitment_post|applicant_information)\/([^/]+)\/decision$/u.exec(path);

      if (request.method === 'GET' && path === '/me/applicant/job-seeking-information') {
        const user = authenticate(request, db);
        const information = getApplicantJobSeekingInformation(db, user.id);
        return send(response, 200, { data: information && mapApplicantJobSeekingInformation(information) });
      }
      if (request.method === 'PUT' && path === '/me/applicant/job-seeking-information') {
        const user = authenticate(request, db);
        return send(response, 200, { data: mapApplicantJobSeekingInformation(upsertApplicantJobSeekingInformation(db, user.id, assertJobSeekingInformation(body))) });
      }
      if (request.method === 'GET' && path === '/me/recruiter/information') {
        const user = authenticate(request, db);
        const information = getRecruiterInformation(db, user.id);
        return send(response, 200, { data: information && mapRecruiterInformation(information) });
      }
      if (request.method === 'PUT' && path === '/me/recruiter/information') {
        const user = authenticate(request, db);
        return send(response, 200, { data: mapRecruiterInformation(upsertRecruiterInformation(db, user.id, assertRecruiterInformation(body))) });
      }
      if (request.method === 'GET' && path === '/me/recruitment-posts') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listRecruitmentPosts(db, user.id) });
      }
      if (request.method === 'POST' && path === '/me/recruitment-posts') {
        const user = authenticate(request, db);
        return send(response, 201, { data: createRecruitmentPost(db, user.id, assertRecruitmentPost(body)) });
      }
      if (request.method === 'GET' && recruitmentPostPath) {
        const user = authenticate(request, db);
        const post = getRecruitmentPost(db, user.id, recruitmentPostPath[1]);
        if (!post) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        return send(response, 200, { data: post });
      }
      if (request.method === 'PATCH' && recruitmentPostPath) {
        const user = authenticate(request, db);
        const current = getRecruitmentPost(db, user.id, recruitmentPostPath[1]);
        if (!current) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        const next = assertRecruitmentPost({
          ...current,
          ...body,
          imageKeys: body.imageKeys || current.images.map((image) => image.objectKey),
        });
        return send(response, 200, { data: updateRecruitmentPost(db, user.id, recruitmentPostPath[1], next) });
      }

      if (request.method === 'POST' && disablePostPath) {
        const user = authenticate(request, db); if (!setMarketVisibility(db, user.id, 'recruitment_post', disablePostPath[1], false)) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); return send(response, 204, null);
      }
      const renewPostPath = /^\/me\/recruitment-posts\/([^/]+)\/renew$/u.exec(path);
      if (request.method === 'POST' && renewPostPath) {
        const user = authenticate(request, db);
        const post = renewMarketPublication(db, user.id, 'recruitment_post', renewPostPath[1]);
        if (!post) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        return send(response, 200, { data: post });
      }
      if (request.method === 'POST' && path === '/me/applicant/job-seeking-information/disable') {
        const user = authenticate(request, db); if (!setMarketVisibility(db, user.id, 'applicant_information', '', false)) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); return send(response, 204, null);
      }
      if (request.method === 'POST' && path === '/me/applicant/job-seeking-information/renew') {
        const user = authenticate(request, db);
        const information = renewMarketPublication(db, user.id, 'applicant_information');
        if (!information) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在');
        return send(response, 200, { data: mapApplicantJobSeekingInformation(information) });
      }
      if (request.method === 'GET' && path === '/market/recruitment-posts') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listMarketRecruitmentPosts(db, user.id, {
          ...marketListQuery(url),
          jobType: text(url.searchParams.get('jobType')),
          salaryRange: text(url.searchParams.get('salaryRange')),
          settlementMethod: text(url.searchParams.get('settlementMethod')),
          location: text(url.searchParams.get('location')),
        }) });
      }
      if (request.method === 'GET' && path === '/market/recruitment-posts/map') {
        const user = authenticate(request, db);
        const mapQuery = marketMapQuery(url);
        const listFilters = marketListQuery(url);
        return send(response, 200, { data: mapMarketRecruitmentPosts(db, user.id, mapQuery.bounds, {
          zoom: mapQuery.zoom, limit: mapQuery.limit, jobType: text(url.searchParams.get('jobType')),
          salaryRange: text(url.searchParams.get('salaryRange')), location: text(url.searchParams.get('location')),
          publishedFrom: listFilters.publishedFrom, publishedTo: listFilters.publishedTo,
        }) });
      }
      if (request.method === 'GET' && marketRecruitmentPath) {
        const user = authenticate(request, db); const item = getMarketRecruitmentPost(db, user.id, marketRecruitmentPath[1]); if (!item) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); if (!recordContactView(db, user.id, 'recruitment_post', marketRecruitmentPath[1])) throw httpError(429, 'CONTACT_RATE_LIMITED', '联系方式查看次数过多，请稍后再试'); return send(response, 200, { data: item });
      }
      if (request.method === 'GET' && path === '/market/job-seeking-information') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listMarketJobSeekingInformation(db, user.id, {
          ...marketListQuery(url),
          jobTypeName: text(url.searchParams.get('jobTypeName')),
          expectedSalary: text(url.searchParams.get('expectedSalary')),
          workMethod: text(url.searchParams.get('workMethod')),
          location: text(url.searchParams.get('location')),
        }) });
      }
      if (request.method === 'GET' && path === '/market/job-seeking-information/map') {
        const user = authenticate(request, db);
        const mapQuery = marketMapQuery(url);
        const listFilters = marketListQuery(url);
        return send(response, 200, { data: mapMarketJobSeekingInformation(db, user.id, mapQuery.bounds, {
          zoom: mapQuery.zoom, limit: mapQuery.limit, jobTypeName: text(url.searchParams.get('jobTypeName')),
          expectedSalary: text(url.searchParams.get('expectedSalary')), workMethod: text(url.searchParams.get('workMethod')),
          location: text(url.searchParams.get('location')),
          publishedFrom: listFilters.publishedFrom, publishedTo: listFilters.publishedTo,
        }) });
      }
      if (request.method === 'GET' && marketApplicantPath) {
        const user = authenticate(request, db); const item = getMarketJobSeekingInformation(db, user.id, marketApplicantPath[1]); if (!item) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); if (!recordContactView(db, user.id, 'applicant_information', marketApplicantPath[1])) throw httpError(429, 'CONTACT_RATE_LIMITED', '联系方式查看次数过多，请稍后再试'); return send(response, 200, { data: item });
      }
      if (request.method === 'GET' && path === '/me/favorites/recruitment-posts') { const user = authenticate(request, db); return send(response, 200, { data: listFavorites(db, user.id, 'recruitment') }); }
      if (request.method === 'PUT' && favoriteRecruitmentPath) { const user = authenticate(request, db); if (!setFavorite(db, user.id, 'recruitment', favoriteRecruitmentPath[1], true)) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); return send(response, 204, null); }
      if (request.method === 'DELETE' && favoriteRecruitmentPath) { const user = authenticate(request, db); setFavorite(db, user.id, 'recruitment', favoriteRecruitmentPath[1], false); return send(response, 204, null); }
      if (request.method === 'GET' && path === '/me/favorites/job-seeking-information') { const user = authenticate(request, db); return send(response, 200, { data: listFavorites(db, user.id, 'applicant') }); }
      if (request.method === 'PUT' && favoriteApplicantPath) { const user = authenticate(request, db); if (!setFavorite(db, user.id, 'applicant', favoriteApplicantPath[1], true)) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); return send(response, 204, null); }
      if (request.method === 'DELETE' && favoriteApplicantPath) { const user = authenticate(request, db); setFavorite(db, user.id, 'applicant', favoriteApplicantPath[1], false); return send(response, 204, null); }
      if (request.method === 'POST' && path === '/me/market-reports') { const user = authenticate(request, db); const report = createMarketReport(db, user.id, assertMarketTarget(body)); if (!report) throw httpError(404, 'MARKET_NOT_FOUND', '举报对象不存在'); return send(response, 201, { data: report }); }
      if (request.method === 'GET' && path === '/me/market-user-blocks') { const user = authenticate(request, db); return send(response, 200, { data: listMarketUserBlocks(db, user.id) }); }
      if (request.method === 'POST' && path === '/me/market-user-blocks') {
        const user = authenticate(request, db);
        if (!['recruitment_post', 'applicant_information'].includes(text(body.targetType)) || !text(body.targetId)) throw httpError(422, 'VALIDATION_ERROR', '拉黑对象无效');
        const block = createMarketUserBlock(db, user.id, text(body.targetType), text(body.targetId));
        if (!block) throw httpError(422, 'INVALID_BLOCK_TARGET', '不能拉黑自己或不存在的对象');
        return send(response, 201, { data: block });
      }
      if (request.method === 'DELETE' && marketBlockPath) { const user = authenticate(request, db); if (!deleteMarketUserBlock(db, user.id, marketBlockPath[1])) throw httpError(404, 'BLOCK_NOT_FOUND', '拉黑记录不存在'); return send(response, 204, null); }
      if (request.method === 'GET' && path === '/admin/market-content') { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); return send(response, 200, { data: listAdminMarketContent(db, adminMarketContentQuery(url)) }); }
      if (request.method === 'POST' && adminMarketContentDecisionPath) { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); const input = assertMarketModerationDecision(body); const item = decideMarketContent(db, admin.user_id, adminMarketContentDecisionPath[1], adminMarketContentDecisionPath[2], input.decision, input.reason); if (!item) throw httpError(404, 'MARKET_NOT_FOUND', '市场内容不存在'); return send(response, 200, { data: item }); }
      if (request.method === 'GET' && path === '/admin/market-reports') { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); const status = url.searchParams.get('status'); if (status && !['open', 'resolved', 'rejected'].includes(status)) throw httpError(422, 'VALIDATION_ERROR', '举报状态无效'); return send(response, 200, { data: listMarketReports(db, status) }); }
      const marketReportDecisionPath = /^\/admin\/market-reports\/([^/]+)\/decision$/u.exec(path);
      if (request.method === 'POST' && marketReportDecisionPath) { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); if (!['resolved', 'rejected'].includes(text(body.decision))) throw httpError(422, 'VALIDATION_ERROR', '处理决定无效'); const report = resolveMarketReport(db, admin.user_id, marketReportDecisionPath[1], text(body.decision)); if (!report) throw httpError(404, 'REPORT_NOT_FOUND', '举报不存在'); return send(response, 200, { data: report }); }

      if (request.method === 'GET' && path === '/me/identities') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listIdentityRows(db, user.id).map(summaryFromRow) });
      }
      if (request.method === 'POST' && (path === '/me/identities/recruiter' || path === '/me/identities/applicant')) {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`identity-create:${user.id}`, 10, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '身份提交过于频繁，请稍后再试');
        const role = path.endsWith('/recruiter') ? 'recruiter' : 'applicant';
        return send(response, 201, { data: createIdentity(db, user.id, role, validateProfile(role, body)) });
      }
      if (request.method === 'GET' && identityPath) {
        const user = authenticate(request, db);
        const row = normalizeRow(identityRow(db, identityPath[1]));
        if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
        return send(response, 200, { data: identityFromRow(row) });
      }
      if (request.method === 'PATCH' && profilePath) {
        const user = authenticate(request, db);
        const row = normalizeRow(identityRow(db, profilePath[1]));
        if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
        const profile = validateProfile(row.role, body);
        if (normalizedPhone(profile.contactPhone) !== normalizedPhone(row.contact_phone)) {
          throw httpError(409, 'PHONE_IMMUTABLE', '手机号已绑定角色，不能修改');
        }
        if (!updateRoleProfile(db, user.id, profilePath[1], row.role, profile)) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
        return send(response, 200, { data: identityFromRow(normalizeRow(identityRow(db, profilePath[1]))) });
      }
      if (request.method === 'POST' && resubmitPath) {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`identity-resubmit:${user.id}`, 10, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '重新提交过于频繁，请稍后再试');
        const row = normalizeRow(identityRow(db, resubmitPath[1]));
        if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
        if (!body.profile || typeof body.profile !== 'object') throw httpError(422, 'VALIDATION_ERROR', '缺少 profile');
        return send(response, 200, { data: updateIdentityForResubmit(db, user.id, resubmitPath[1], validateProfile(row.role, body.profile)) });
      }
      if (request.method === 'GET' && path === '/admin/identity-reviews') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'reviewer']);
        const status = url.searchParams.get('status') || null;
        if (status && !statusValues.has(status)) throw httpError(422, 'VALIDATION_ERROR', '审核状态无效');
        return send(response, 200, { data: reviewRows(db, status).map(identityFromRow) });
      }
      if (request.method === 'POST' && reviewDecisionPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'reviewer']);
        if (!consumeRateLimit(`identity-review:${admin.user_id}`, 120, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '审核操作过于频繁，请稍后再试');
        assertMaxLengths(body, { reason: 1000 });
        return send(response, 200, { data: decideReview(db, admin.user_id, reviewDecisionPath[1], body.decision, body.reason) });
      }
      if (request.method === 'POST' && path === '/me/conversations') {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`conversation-start:${user.id}`, 20, 24 * 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '发起沟通过于频繁，请稍后再试');
        if (!['recruitment_post', 'applicant_information'].includes(text(body.targetType)) || !text(body.targetId)) {
          throw httpError(422, 'VALIDATION_ERROR', '沟通目标无效');
        }
        try {
          return send(response, 201, { data: startConversation(db, user.id, {
            targetType: text(body.targetType), targetId: text(body.targetId),
            body: body.body, clientRequestId: text(body.clientRequestId) || null,
          }) });
        } catch (error) {
          if (error.code === 'APPROVED_IDENTITY_REQUIRED') throw httpError(403, error.code, error.message);
          if (error.code === 'BLOCKED' || error.code === 'CONVERSATION_BLOCKED') throw httpError(403, error.code, error.message);
          if (error.code === 'TARGET_UNAVAILABLE' || error.code === 'INVALID_TARGET') throw httpError(404, error.code, error.message);
          if (error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'GET' && path === '/me/conversations') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listConversations(db, user.id) });
      }
      const conversationPath = /^\/me\/conversations\/([^/]+)$/u.exec(path);
      const conversationMessagesPath = /^\/me\/conversations\/([^/]+)\/messages$/u.exec(path);
      const conversationReadPath = /^\/me\/conversations\/([^/]+)\/read$/u.exec(path);
      const conversationEndPath = /^\/me\/conversations\/([^/]+)\/end$/u.exec(path);
      if (request.method === 'GET' && conversationPath) {
        const user = authenticate(request, db);
        const item = getConversation(db, user.id, conversationPath[1]);
        if (!item) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        return send(response, 200, { data: item });
      }
      if (request.method === 'GET' && conversationMessagesPath) {
        const user = authenticate(request, db);
        const items = listMessages(db, user.id, conversationMessagesPath[1]);
        if (!items) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        return send(response, 200, { data: items });
      }
      if (request.method === 'POST' && conversationMessagesPath) {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`message-send:${user.id}`, 60, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '消息发送过于频繁，请稍后再试');
        try {
          const message = sendMessage(db, user.id, conversationMessagesPath[1], {
            body: body.body, clientRequestId: text(body.clientRequestId) || null,
          });
          if (!message) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
          return send(response, 201, { data: message });
        } catch (error) {
          if (error.code === 'BLOCKED' || error.code === 'CONVERSATION_INACTIVE') throw httpError(403, error.code, error.message);
          if (error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && conversationReadPath) {
        const user = authenticate(request, db);
        if (!markConversationRead(db, user.id, conversationReadPath[1])) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        return send(response, 204, null);
      }
      if (request.method === 'POST' && conversationEndPath) {
        const user = authenticate(request, db);
        const item = endConversation(db, user.id, conversationEndPath[1]);
        if (!item) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        return send(response, 200, { data: item });
      }
      if (request.method === 'POST' && path === '/me/applications') {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`application-create:${user.id}`, 20, 24 * 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '投递过于频繁，请稍后再试');
        try {
          return send(response, 201, { data: createApplication(db, user.id, {
            recruitmentPostId: text(body.recruitmentPostId), note: text(body.note),
          }) });
        } catch (error) {
          if (error.code === 'APPROVED_IDENTITY_REQUIRED' || error.code === 'BLOCKED') throw httpError(403, error.code, error.message);
          if (error.code === 'TARGET_UNAVAILABLE' || error.code === 'INVALID_TARGET') throw httpError(404, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'GET' && path === '/me/applications') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listApplicationsForApplicant(db, user.id) });
      }
      if (request.method === 'GET' && path === '/me/recruitment-applications') {
        const user = authenticate(request, db);
        try {
          return send(response, 200, { data: listApplicationsForRecruiter(db, user.id) });
        } catch (error) {
          if (error.code === 'APPROVED_IDENTITY_REQUIRED') throw httpError(403, error.code, error.message);
          throw error;
        }
      }
      const applicationPath = /^\/me\/applications\/([^/]+)$/u.exec(path);
      const applicationWithdrawPath = /^\/me\/applications\/([^/]+)\/withdraw$/u.exec(path);
      if (request.method === 'PATCH' && applicationPath) {
        const user = authenticate(request, db);
        try {
          const item = updateApplicationStatus(db, user.id, applicationPath[1], text(body.status));
          if (!item) throw httpError(404, 'APPLICATION_NOT_FOUND', '投递不存在');
          return send(response, 200, { data: item });
        } catch (error) {
          if (error.code === 'FORBIDDEN') throw httpError(403, error.code, error.message);
          if (error.code === 'INVALID_TRANSITION' || error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && applicationWithdrawPath) {
        const user = authenticate(request, db);
        try {
          const item = updateApplicationStatus(db, user.id, applicationWithdrawPath[1], 'withdrawn');
          if (!item) throw httpError(404, 'APPLICATION_NOT_FOUND', '投递不存在');
          return send(response, 200, { data: item });
        } catch (error) {
          if (error.code === 'FORBIDDEN') throw httpError(403, error.code, error.message);
          if (error.code === 'INVALID_TRANSITION') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && path === '/me/interviews') {
        const user = authenticate(request, db);
        try {
          return send(response, 201, { data: createInterview(db, user.id, {
            applicationId: text(body.applicationId) || null,
            applicantUserId: text(body.applicantUserId),
            scheduledAt: text(body.scheduledAt),
            locationText: text(body.locationText),
          }) });
        } catch (error) {
          if (error.code === 'APPROVED_IDENTITY_REQUIRED' || error.code === 'BLOCKED' || error.code === 'FORBIDDEN') {
            throw httpError(403, error.code, error.message);
          }
          if (error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'GET' && path === '/me/interviews') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listInterviews(db, user.id) });
      }
      const interviewRespondPath = /^\/me\/interviews\/([^/]+)\/respond$/u.exec(path);
      const interviewCancelPath = /^\/me\/interviews\/([^/]+)\/cancel$/u.exec(path);
      if (request.method === 'POST' && interviewRespondPath) {
        const user = authenticate(request, db);
        try {
          const item = respondInterview(db, user.id, interviewRespondPath[1], text(body.decision));
          if (!item) throw httpError(404, 'INTERVIEW_NOT_FOUND', '面试不存在');
          return send(response, 200, { data: item });
        } catch (error) {
          if (error.code === 'FORBIDDEN') throw httpError(403, error.code, error.message);
          if (error.code === 'INVALID_TRANSITION' || error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && interviewCancelPath) {
        const user = authenticate(request, db);
        try {
          const item = cancelInterview(db, user.id, interviewCancelPath[1], text(body.reason));
          if (!item) throw httpError(404, 'INTERVIEW_NOT_FOUND', '面试不存在');
          return send(response, 200, { data: item });
        } catch (error) {
          if (error.code === 'FORBIDDEN') throw httpError(403, error.code, error.message);
          if (error.code === 'INVALID_TRANSITION' || error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }

      throw httpError(404, 'NOT_FOUND', '请求地址不存在');
    } catch (error) {
      if (error.message === 'COUNTERPART_IDENTITY_REQUIRED') {
        error.status = 403;
        error.code = 'APPROVED_IDENTITY_REQUIRED';
        error.message = '需要对应已审核通过的身份';
      }
      if (error.message === 'INVALID_IMAGE_REFERENCES') {
        error.status = 422;
        error.code = 'INVALID_IMAGE_REFERENCES';
        error.message = '图片上传引用无效或已过期，请重新上传';
      }
      if (error.message === 'INVALID_MARKET_TRANSITION') {
        error.status = 409;
        error.code = 'INVALID_MARKET_TRANSITION';
        error.message = `当前内容状态 ${error.currentStatus} 不允许该操作`;
      }
      sendError(response, error);
    }
  };

  
