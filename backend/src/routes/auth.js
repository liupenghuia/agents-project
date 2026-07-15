/** @param {any} ctx */
export async function tryHandleAuth(ctx) {
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

      if (request.method === 'GET' && path === '/health') {
        send(response, 200, { data: { status: 'ok', service: 'recruitment-backend' } }); return true;
      }

      if (request.method === 'GET' && publicMediaPath) {
        const image = getPublicRecruitmentImage(db, publicMediaPath[1]);
        if (!image) throw httpError(404, 'MEDIA_NOT_FOUND', '图片不存在');
        try {
          sendBinary(response, 200, image.content_type, await readFile(join(mediaRoot, image.object_key))); return true;
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
        send(response, 200, { data: { userId: user.id, sessionToken, expiresAt: isoAfter(sessionTtlMs) } }); return true;
      }

      if (request.method === 'POST' && path === '/auth/wechat/phone') {
        authenticate(request, db);
        assertRequired(body, ['code']);
        assertMaxLengths(body, { code: 512 });
        send(response, 200, { data: await exchangePhone(text(body.code)) }); return true;
      }

  return false;
}
