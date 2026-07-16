import { rethrowDomainError } from '../domain/errors.js';
import { assertConversationTarget, assertApplicationCreate } from '../domain/validators.js';
import {
  startConversation, listConversations, getConversation, listMessages, sendMessage,
  markConversationRead, endConversation, createApplication, listApplicationsForApplicant,
  listApplicationsForRecruiter, updateApplicationStatus, createInterview, listInterviews,
  respondInterview, cancelInterview,
} from '../collaboration.js';

/** @param {any} ctx */
export async function tryHandleCollaboration(ctx) {
  const {
    request, response, path, body,
    db, consumeRateLimit,
    send, httpError, text,
    authenticate,
  } = ctx;

  if (request.method === 'POST' && path === '/me/conversations') {
    const user = authenticate(request, db);
    if (!consumeRateLimit(`conversation-start:${user.id}`, 20, 24 * 60 * 60 * 1000)) {
      throw httpError(429, 'RATE_LIMITED', '发起沟通过于频繁，请稍后再试');
    }
    try {
      send(response, 201, { data: startConversation(db, user.id, assertConversationTarget(body)) });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'GET' && path === '/me/conversations') {
    const user = authenticate(request, db);
    send(response, 200, { data: listConversations(db, user.id) });
    return true;
  }

  const conversationPath = /^\/me\/conversations\/([^/]+)$/u.exec(path);
  const conversationMessagesPath = /^\/me\/conversations\/([^/]+)\/messages$/u.exec(path);
  const conversationReadPath = /^\/me\/conversations\/([^/]+)\/read$/u.exec(path);
  const conversationEndPath = /^\/me\/conversations\/([^/]+)\/end$/u.exec(path);

  if (request.method === 'GET' && conversationPath) {
    const user = authenticate(request, db);
    const item = getConversation(db, user.id, conversationPath[1]);
    if (!item) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
    send(response, 200, { data: item });
    return true;
  }

  if (request.method === 'GET' && conversationMessagesPath) {
    const user = authenticate(request, db);
    const items = listMessages(db, user.id, conversationMessagesPath[1]);
    if (!items) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
    send(response, 200, { data: items });
    return true;
  }

  if (request.method === 'POST' && conversationMessagesPath) {
    const user = authenticate(request, db);
    if (!consumeRateLimit(`message-send:${user.id}`, 60, 60 * 60 * 1000)) {
      throw httpError(429, 'RATE_LIMITED', '消息发送过于频繁，请稍后再试');
    }
    try {
      const message = sendMessage(db, user.id, conversationMessagesPath[1], {
        body: body.body,
        clientRequestId: text(body.clientRequestId) || null,
      });
      if (!message) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
      send(response, 201, { data: message });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'POST' && conversationReadPath) {
    const user = authenticate(request, db);
    if (!markConversationRead(db, user.id, conversationReadPath[1])) {
      throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
    }
    send(response, 204, null);
    return true;
  }

  if (request.method === 'POST' && conversationEndPath) {
    const user = authenticate(request, db);
    const item = endConversation(db, user.id, conversationEndPath[1]);
    if (!item) throw httpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在');
    send(response, 200, { data: item });
    return true;
  }

  if (request.method === 'POST' && path === '/me/applications') {
    const user = authenticate(request, db);
    if (!consumeRateLimit(`application-create:${user.id}`, 20, 24 * 60 * 60 * 1000)) {
      throw httpError(429, 'RATE_LIMITED', '投递过于频繁，请稍后再试');
    }
    try {
      send(response, 201, { data: createApplication(db, user.id, assertApplicationCreate(body)) });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'GET' && path === '/me/applications') {
    const user = authenticate(request, db);
    send(response, 200, { data: listApplicationsForApplicant(db, user.id) });
    return true;
  }

  if (request.method === 'GET' && path === '/me/recruitment-applications') {
    const user = authenticate(request, db);
    try {
      send(response, 200, { data: listApplicationsForRecruiter(db, user.id) });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  const applicationPath = /^\/me\/applications\/([^/]+)$/u.exec(path);
  const applicationWithdrawPath = /^\/me\/applications\/([^/]+)\/withdraw$/u.exec(path);

  if (request.method === 'PATCH' && applicationPath) {
    const user = authenticate(request, db);
    try {
      const item = updateApplicationStatus(db, user.id, applicationPath[1], text(body.status));
      if (!item) throw httpError(404, 'APPLICATION_NOT_FOUND', '投递不存在');
      send(response, 200, { data: item });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'POST' && applicationWithdrawPath) {
    const user = authenticate(request, db);
    try {
      const item = updateApplicationStatus(db, user.id, applicationWithdrawPath[1], 'withdrawn');
      if (!item) throw httpError(404, 'APPLICATION_NOT_FOUND', '投递不存在');
      send(response, 200, { data: item });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'POST' && path === '/me/interviews') {
    const user = authenticate(request, db);
    try {
      send(response, 201, { data: createInterview(db, user.id, body) });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'GET' && path === '/me/interviews') {
    const user = authenticate(request, db);
    send(response, 200, { data: listInterviews(db, user.id) });
    return true;
  }

  const interviewRespondPath = /^\/me\/interviews\/([^/]+)\/respond$/u.exec(path);
  const interviewCancelPath = /^\/me\/interviews\/([^/]+)\/cancel$/u.exec(path);

  if (request.method === 'POST' && interviewRespondPath) {
    const user = authenticate(request, db);
    try {
      const item = respondInterview(db, user.id, interviewRespondPath[1], text(body.decision));
      if (!item) throw httpError(404, 'INTERVIEW_NOT_FOUND', '面试不存在');
      send(response, 200, { data: item });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  if (request.method === 'POST' && interviewCancelPath) {
    const user = authenticate(request, db);
    try {
      const item = cancelInterview(db, user.id, interviewCancelPath[1], text(body.reason));
      if (!item) throw httpError(404, 'INTERVIEW_NOT_FOUND', '面试不存在');
      send(response, 200, { data: item });
      return true;
    } catch (error) {
      rethrowDomainError(error);
    }
  }

  return false;
}
