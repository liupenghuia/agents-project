/** @param {any} ctx */
export async function tryHandleMarket(ctx) {
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
    maxImageBytes, imageTypes,
  } = d;

      const marketRecruitmentPath = /^\/market\/recruitment-posts\/([^/]+)$/u.exec(path);
      const marketApplicantPath = /^\/market\/job-seeking-information\/([^/]+)$/u.exec(path);
      const favoriteRecruitmentPath = /^\/me\/favorites\/recruitment-posts\/([^/]+)$/u.exec(path);
      const favoriteApplicantPath = /^\/me\/favorites\/job-seeking-information\/([^/]+)$/u.exec(path);
      const marketBlockPath = /^\/me\/market-user-blocks\/([^/]+)$/u.exec(path);
      const adminMarketContentDecisionPath = /^\/admin\/market-content\/(recruitment_post|applicant_information)\/([^/]+)\/decision$/u.exec(path);
      const marketReportDecisionPath = /^\/admin\/market-reports\/([^/]+)\/decision$/u.exec(path);
      if (request.method === 'GET' && path === '/market/recruitment-posts') {
        const user = authenticate(request, db);
        send(response, 200, { data: listMarketRecruitmentPosts(db, user.id, {
          ...marketListQuery(url),
          jobType: text(url.searchParams.get('jobType')),
          salaryRange: text(url.searchParams.get('salaryRange')),
          settlementMethod: text(url.searchParams.get('settlementMethod')),
          location: text(url.searchParams.get('location')),
        }) }); return true;
      }
      if (request.method === 'GET' && path === '/market/recruitment-posts/map') {
        const user = authenticate(request, db);
        const mapQuery = marketMapQuery(url);
        const listFilters = marketListQuery(url);
        send(response, 200, { data: mapMarketRecruitmentPosts(db, user.id, mapQuery.bounds, {
          zoom: mapQuery.zoom, limit: mapQuery.limit, jobType: text(url.searchParams.get('jobType')),
          salaryRange: text(url.searchParams.get('salaryRange')), location: text(url.searchParams.get('location')),
          publishedFrom: listFilters.publishedFrom, publishedTo: listFilters.publishedTo,
        }) }); return true;
      }
      if (request.method === 'GET' && marketRecruitmentPath) {
        const user = authenticate(request, db); const item = getMarketRecruitmentPost(db, user.id, marketRecruitmentPath[1]); if (!item) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); if (!recordContactView(db, user.id, 'recruitment_post', marketRecruitmentPath[1])) throw httpError(429, 'CONTACT_RATE_LIMITED', '联系方式查看次数过多，请稍后再试'); send(response, 200, { data: item }); return true;
      }
      if (request.method === 'GET' && path === '/market/job-seeking-information') {
        const user = authenticate(request, db);
        send(response, 200, { data: listMarketJobSeekingInformation(db, user.id, {
          ...marketListQuery(url),
          jobTypeName: text(url.searchParams.get('jobTypeName')),
          expectedSalary: text(url.searchParams.get('expectedSalary')),
          workMethod: text(url.searchParams.get('workMethod')),
          location: text(url.searchParams.get('location')),
        }) }); return true;
      }
      if (request.method === 'GET' && path === '/market/job-seeking-information/map') {
        const user = authenticate(request, db);
        const mapQuery = marketMapQuery(url);
        const listFilters = marketListQuery(url);
        send(response, 200, { data: mapMarketJobSeekingInformation(db, user.id, mapQuery.bounds, {
          zoom: mapQuery.zoom, limit: mapQuery.limit, jobTypeName: text(url.searchParams.get('jobTypeName')),
          expectedSalary: text(url.searchParams.get('expectedSalary')), workMethod: text(url.searchParams.get('workMethod')),
          location: text(url.searchParams.get('location')),
          publishedFrom: listFilters.publishedFrom, publishedTo: listFilters.publishedTo,
        }) }); return true;
      }
      if (request.method === 'GET' && marketApplicantPath) {
        const user = authenticate(request, db); const item = getMarketJobSeekingInformation(db, user.id, marketApplicantPath[1]); if (!item) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); if (!recordContactView(db, user.id, 'applicant_information', marketApplicantPath[1])) throw httpError(429, 'CONTACT_RATE_LIMITED', '联系方式查看次数过多，请稍后再试'); send(response, 200, { data: item }); return true;
      }
      if (request.method === 'GET' && path === '/me/favorites/recruitment-posts') { const user = authenticate(request, db); send(response, 200, { data: listFavorites(db, user.id, 'recruitment') }); return true; }
      if (request.method === 'PUT' && favoriteRecruitmentPath) { const user = authenticate(request, db); if (!setFavorite(db, user.id, 'recruitment', favoriteRecruitmentPath[1], true)) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); send(response, 204, null); return true; }
      if (request.method === 'DELETE' && favoriteRecruitmentPath) { const user = authenticate(request, db); setFavorite(db, user.id, 'recruitment', favoriteRecruitmentPath[1], false); send(response, 204, null); return true; }
      if (request.method === 'GET' && path === '/me/favorites/job-seeking-information') { const user = authenticate(request, db); send(response, 200, { data: listFavorites(db, user.id, 'applicant') }); return true; }
      if (request.method === 'PUT' && favoriteApplicantPath) { const user = authenticate(request, db); if (!setFavorite(db, user.id, 'applicant', favoriteApplicantPath[1], true)) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); send(response, 204, null); return true; }
      if (request.method === 'DELETE' && favoriteApplicantPath) { const user = authenticate(request, db); setFavorite(db, user.id, 'applicant', favoriteApplicantPath[1], false); send(response, 204, null); return true; }
      if (request.method === 'POST' && path === '/me/market-reports') { const user = authenticate(request, db); const report = createMarketReport(db, user.id, assertMarketTarget(body)); if (!report) throw httpError(404, 'MARKET_NOT_FOUND', '举报对象不存在'); send(response, 201, { data: report }); return true; }
      if (request.method === 'GET' && path === '/me/market-user-blocks') { const user = authenticate(request, db); send(response, 200, { data: listMarketUserBlocks(db, user.id) }); return true; }
      if (request.method === 'POST' && path === '/me/market-user-blocks') {
        const user = authenticate(request, db);
        if (!['recruitment_post', 'applicant_information'].includes(text(body.targetType)) || !text(body.targetId)) throw httpError(422, 'VALIDATION_ERROR', '拉黑对象无效');
        const block = createMarketUserBlock(db, user.id, text(body.targetType), text(body.targetId));
        if (!block) throw httpError(422, 'INVALID_BLOCK_TARGET', '不能拉黑自己或不存在的对象');
        send(response, 201, { data: block }); return true;
      }
      if (request.method === 'DELETE' && marketBlockPath) { const user = authenticate(request, db); if (!deleteMarketUserBlock(db, user.id, marketBlockPath[1])) throw httpError(404, 'BLOCK_NOT_FOUND', '拉黑记录不存在'); send(response, 204, null); return true; }
      if (request.method === 'GET' && path === '/admin/market-content') { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); send(response, 200, { data: listAdminMarketContent(db, adminMarketContentQuery(url)) }); return true; }
      if (request.method === 'POST' && adminMarketContentDecisionPath) { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); const input = assertMarketModerationDecision(body); const item = decideMarketContent(db, admin.user_id, adminMarketContentDecisionPath[1], adminMarketContentDecisionPath[2], input.decision, input.reason); if (!item) throw httpError(404, 'MARKET_NOT_FOUND', '市场内容不存在'); send(response, 200, { data: item }); return true; }
      if (request.method === 'GET' && path === '/admin/market-reports') { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); const status = url.searchParams.get('status'); if (status && !['open', 'resolved', 'rejected'].includes(status)) throw httpError(422, 'VALIDATION_ERROR', '举报状态无效'); send(response, 200, { data: listMarketReports(db, status) }); return true; }
      if (request.method === 'POST' && marketReportDecisionPath) { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); if (!['resolved', 'rejected'].includes(text(body.decision))) throw httpError(422, 'VALIDATION_ERROR', '处理决定无效'); const report = resolveMarketReport(db, admin.user_id, marketReportDecisionPath[1], text(body.decision)); if (!report) throw httpError(404, 'REPORT_NOT_FOUND', '举报不存在'); send(response, 200, { data: report }); return true; }


  return false;
}
