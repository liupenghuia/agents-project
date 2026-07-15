/** @param {any} ctx */
export async function tryHandleCollaboration(ctx) {
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

      if (request.method === 'POST' && path === '/me/conversations') {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`conversation-start:${user.id}`, 20, 24 * 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '发起沟通过于频繁，请稍后再试');
        if (!['recruitment_post', 'applicant_information'].includes(text(body.targetType)) || !text(body.targetId)) {
          throw httpError(422, 'VALIDATION_ERROR', '沟通目标无效');
        }
        try {
          send(response, 201, { data: startConversation(db, user.id, {
            targetType: text(body.targetType), targetId: text(body.targetId),
            body: body.body, clientRequestId: text(body.clientRequestId) || null,
          }) }); return true;
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
        send(response, 200, { data: listConversations(db, user.id) }); return true;
      }
      const conversationPath = /^\/me\/conversations\/([^/]+)$/u.exec(path);
      const conversationMessagesPath = /^\/me\/conversations\/([^/]+)\/messages$/u.exec(path);
      const conversationReadPath = /^\/me\/conversations\/([^/]+)\/read$/u.exec(path);
      const conversationEndPath = /^\/me\/conversations\/([^/]+)\/end$/u.exec(path);
      if (request.method === 'GET' && conversationPath) {
        const user = authenticate(request, db);
        const item = getConversation(db, user.id, conversationPath[1]);
        if (!item) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        send(response, 200, { data: item }); return true;
      }
      if (request.method === 'GET' && conversationMessagesPath) {
        const user = authenticate(request, db);
        const items = listMessages(db, user.id, conversationMessagesPath[1]);
        if (!items) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        send(response, 200, { data: items }); return true;
      }
      if (request.method === 'POST' && conversationMessagesPath) {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`message-send:${user.id}`, 60, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '消息发送过于频繁，请稍后再试');
        try {
          const message = sendMessage(db, user.id, conversationMessagesPath[1], {
            body: body.body, clientRequestId: text(body.clientRequestId) || null,
          });
          if (!message) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
          send(response, 201, { data: message }); return true;
        } catch (error) {
          if (error.code === 'BLOCKED' || error.code === 'CONVERSATION_INACTIVE') throw httpError(403, error.code, error.message);
          if (error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && conversationReadPath) {
        const user = authenticate(request, db);
        if (!markConversationRead(db, user.id, conversationReadPath[1])) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        send(response, 204, null); return true;
      }
      if (request.method === 'POST' && conversationEndPath) {
        const user = authenticate(request, db);
        const item = endConversation(db, user.id, conversationEndPath[1]);
        if (!item) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
        send(response, 200, { data: item }); return true;
      }
      if (request.method === 'POST' && path === '/me/applications') {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`application-create:${user.id}`, 20, 24 * 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '投递过于频繁，请稍后再试');
        try {
          send(response, 201, { data: createApplication(db, user.id, {
            recruitmentPostId: text(body.recruitmentPostId), note: text(body.note),
          }) }); return true;
        } catch (error) {
          if (error.code === 'APPROVED_IDENTITY_REQUIRED' || error.code === 'BLOCKED') throw httpError(403, error.code, error.message);
          if (error.code === 'TARGET_UNAVAILABLE' || error.code === 'INVALID_TARGET') throw httpError(404, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'GET' && path === '/me/applications') {
        const user = authenticate(request, db);
        send(response, 200, { data: listApplicationsForApplicant(db, user.id) }); return true;
      }
      if (request.method === 'GET' && path === '/me/recruitment-applications') {
        const user = authenticate(request, db);
        try {
          send(response, 200, { data: listApplicationsForRecruiter(db, user.id) }); return true;
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
          send(response, 200, { data: item }); return true;
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
          send(response, 200, { data: item }); return true;
        } catch (error) {
          if (error.code === 'FORBIDDEN') throw httpError(403, error.code, error.message);
          if (error.code === 'INVALID_TRANSITION') throw httpError(422, error.code, error.message);
          throw error;
        }
      }
      if (request.method === 'POST' && path === '/me/interviews') {
        const user = authenticate(request, db);
        try {
          send(response, 201, { data: createInterview(db, user.id, {
            applicationId: text(body.applicationId) || null,
            applicantUserId: text(body.applicantUserId),
            scheduledAt: text(body.scheduledAt),
            locationText: text(body.locationText),
          }) }); return true;
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
        send(response, 200, { data: listInterviews(db, user.id) }); return true;
      }
      const interviewRespondPath = /^\/me\/interviews\/([^/]+)\/respond$/u.exec(path);
      const interviewCancelPath = /^\/me\/interviews\/([^/]+)\/cancel$/u.exec(path);
      if (request.method === 'POST' && interviewRespondPath) {
        const user = authenticate(request, db);
        try {
          const item = respondInterview(db, user.id, interviewRespondPath[1], text(body.decision));
          if (!item) throw httpError(404, 'INTERVIEW_NOT_FOUND', '面试不存在');
          send(response, 200, { data: item }); return true;
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
          send(response, 200, { data: item }); return true;
        } catch (error) {
          if (error.code === 'FORBIDDEN') throw httpError(403, error.code, error.message);
          if (error.code === 'INVALID_TRANSITION' || error.code === 'VALIDATION_ERROR') throw httpError(422, error.code, error.message);
          throw error;
        }
      }

  return false;
}
