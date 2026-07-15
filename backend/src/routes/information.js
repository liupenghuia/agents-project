/** @param {any} ctx */
export async function tryHandleInformation(ctx) {
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

      const recruitmentPostPath = /^\/me\/recruitment-posts\/([^/]+)$/u.exec(path);
      const disablePostPath = /^\/me\/recruitment-posts\/([^/]+)\/disable$/u.exec(path);
      const renewPostPath = /^\/me\/recruitment-posts\/([^/]+)\/renew$/u.exec(path);
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
        send(response, 200, { data: { objectKey, uploadUrl: `/me/recruitment-posts/image-upload/${objectKey}`, expiresAt } }); return true;
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
        send(response, 200, { data: { objectKey: upload.object_key, contentType: upload.content_type, byteSize: file.length } }); return true;
      }
      if (request.method === 'GET' && path === '/me/applicant/job-seeking-information') {
        const user = authenticate(request, db);
        const information = getApplicantJobSeekingInformation(db, user.id);
        send(response, 200, { data: information && mapApplicantJobSeekingInformation(information) }); return true;
      }
      if (request.method === 'PUT' && path === '/me/applicant/job-seeking-information') {
        const user = authenticate(request, db);
        send(response, 200, { data: mapApplicantJobSeekingInformation(upsertApplicantJobSeekingInformation(db, user.id, assertJobSeekingInformation(body))) }); return true;
      }
      if (request.method === 'GET' && path === '/me/recruiter/information') {
        const user = authenticate(request, db);
        const information = getRecruiterInformation(db, user.id);
        send(response, 200, { data: information && mapRecruiterInformation(information) }); return true;
      }
      if (request.method === 'PUT' && path === '/me/recruiter/information') {
        const user = authenticate(request, db);
        send(response, 200, { data: mapRecruiterInformation(upsertRecruiterInformation(db, user.id, assertRecruiterInformation(body))) }); return true;
      }
      if (request.method === 'GET' && path === '/me/recruitment-posts') {
        const user = authenticate(request, db);
        send(response, 200, { data: listRecruitmentPosts(db, user.id) }); return true;
      }
      if (request.method === 'POST' && path === '/me/recruitment-posts') {
        const user = authenticate(request, db);
        send(response, 201, { data: createRecruitmentPost(db, user.id, assertRecruitmentPost(body)) }); return true;
      }
      if (request.method === 'GET' && recruitmentPostPath) {
        const user = authenticate(request, db);
        const post = getRecruitmentPost(db, user.id, recruitmentPostPath[1]);
        if (!post) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        send(response, 200, { data: post }); return true;
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
        send(response, 200, { data: updateRecruitmentPost(db, user.id, recruitmentPostPath[1], next) }); return true;
      }

      if (request.method === 'POST' && disablePostPath) {
        const user = authenticate(request, db); if (!setMarketVisibility(db, user.id, 'recruitment_post', disablePostPath[1], false)) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); send(response, 204, null); return true;
      }
      if (request.method === 'POST' && renewPostPath) {
        const user = authenticate(request, db);
        const post = renewMarketPublication(db, user.id, 'recruitment_post', renewPostPath[1]);
        if (!post) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        send(response, 200, { data: post }); return true;
      }
      if (request.method === 'POST' && path === '/me/applicant/job-seeking-information/disable') {
        const user = authenticate(request, db); if (!setMarketVisibility(db, user.id, 'applicant_information', '', false)) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); send(response, 204, null); return true;
      }
      if (request.method === 'POST' && path === '/me/applicant/job-seeking-information/renew') {
        const user = authenticate(request, db);
        const information = renewMarketPublication(db, user.id, 'applicant_information');
        if (!information) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在');
        send(response, 200, { data: mapApplicantJobSeekingInformation(information) }); return true;
      }

  return false;
}
