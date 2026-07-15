import { randomUUID } from 'node:crypto';
import { now } from './time.js';
import { isBlockedEitherWay, isPubliclyActionablePublication } from './visibility.js';

function withTransaction(db, work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore nested rollback errors */ }
    throw error;
  }
}
const APPLICATION_STATUSES = new Set(['submitted', 'viewed', 'contacted', 'interviewing', 'hired', 'rejected', 'withdrawn', 'closed']);
const APPLICATION_TERMINAL = new Set(['hired', 'rejected', 'withdrawn', 'closed']);
const RECRUITER_APPLICATION_TRANSITIONS = {
  submitted: ['viewed', 'contacted', 'interviewing', 'hired', 'rejected', 'closed'],
  viewed: ['contacted', 'interviewing', 'hired', 'rejected', 'closed'],
  contacted: ['interviewing', 'hired', 'rejected', 'closed'],
  interviewing: ['hired', 'rejected', 'closed'],
};
const INTERVIEW_STATUSES = new Set(['invited', 'accepted', 'declined', 'cancelled', 'completed']);

function httpLike(message, code = 'COLLABORATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function ensureCollaborationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      initiator_user_id TEXT NOT NULL REFERENCES users(id),
      peer_user_id TEXT NOT NULL REFERENCES users(id),
      related_target_type TEXT NOT NULL CHECK (related_target_type IN ('recruitment_post', 'applicant_information')),
      related_target_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'ended', 'blocked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(initiator_user_id, peer_user_id, related_target_type, related_target_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_reads (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      last_read_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      client_request_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency_idx
      ON messages(conversation_id, sender_user_id, client_request_id)
      WHERE client_request_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      applicant_user_id TEXT NOT NULL REFERENCES users(id),
      recruitment_post_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('submitted', 'viewed', 'contacted', 'interviewing', 'hired', 'rejected', 'withdrawn', 'closed')),
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(applicant_user_id, recruitment_post_id)
    );
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      application_id TEXT REFERENCES applications(id),
      recruiter_user_id TEXT NOT NULL REFERENCES users(id),
      applicant_user_id TEXT NOT NULL REFERENCES users(id),
      scheduled_at TEXT NOT NULL,
      location_text TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('invited', 'accepted', 'declined', 'cancelled', 'completed')),
      cancel_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collaboration_audits (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations(initiator_user_id, peer_user_id, updated_at);
    CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS applications_applicant_idx ON applications(applicant_user_id, updated_at);
    CREATE INDEX IF NOT EXISTS applications_post_idx ON applications(recruitment_post_id, updated_at);
    CREATE INDEX IF NOT EXISTS interviews_user_idx ON interviews(recruiter_user_id, applicant_user_id, updated_at);
  `);
}

function audit(db, actorUserId, action, targetType, targetId, details = {}) {
  db.prepare(`INSERT INTO collaboration_audits(id, actor_user_id, action, target_type, target_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), actorUserId, action, targetType, targetId, JSON.stringify(details), now());
}

function approvedRole(db, userId, role) {
  return db.prepare(`SELECT * FROM role_profiles WHERE user_id = ? AND role = ? AND review_status = 'approved'`).get(userId, role) || null;
}

function resolveTargetOwner(db, targetType, targetId) {
  if (targetType === 'recruitment_post') {
    return db.prepare(`SELECT role.user_id AS userId, post.status, post.expires_at AS expiresAt
      FROM recruitment_posts post
      JOIN role_profiles role ON role.id = post.recruiter_role_profile_id AND role.review_status = 'approved'
      WHERE post.id = ?`).get(targetId) || null;
  }
  return db.prepare(`SELECT role.user_id AS userId, information.visibility_status AS status, information.expires_at AS expiresAt
    FROM applicant_job_seeking_information information
    JOIN role_profiles role ON role.id = information.role_profile_id AND role.review_status = 'approved'
    WHERE information.role_profile_id = ?`).get(targetId) || null;
}

function targetPublic(owner) {
  return isPubliclyActionablePublication(owner);
}

function conversationFromRow(db, row, viewerId) {
  if (!row) return null;
  const otherUserId = row.initiator_user_id === viewerId ? row.peer_user_id : row.initiator_user_id;
  const other = db.prepare('SELECT id, name FROM users WHERE id = ?').get(otherUserId);
  const lastMessage = db.prepare(`SELECT id, body, sender_user_id, created_at FROM messages
    WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`).get(row.id);
  const read = db.prepare('SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND user_id = ?').get(row.id, viewerId);
  const unreadCount = db.prepare(`SELECT COUNT(*) AS count FROM messages
    WHERE conversation_id = ? AND sender_user_id != ? AND created_at > ?`)
    .get(row.id, viewerId, read?.last_read_at || '1970-01-01T00:00:00.000Z').count;
  return {
    id: row.id,
    status: row.status,
    relatedTargetType: row.related_target_type,
    relatedTargetId: row.related_target_id,
    peer: { userId: otherUserId, displayName: other?.name || '对方用户' },
    lastMessage: lastMessage ? {
      id: lastMessage.id,
      body: lastMessage.body,
      senderUserId: lastMessage.sender_user_id,
      createdAt: lastMessage.created_at,
    } : null,
    unreadCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireConversationParticipant(db, conversationId, userId) {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!row || (row.initiator_user_id !== userId && row.peer_user_id !== userId)) return null;
  return row;
}

export function startConversation(db, userId, { targetType, targetId, body, clientRequestId }) {
  if (!approvedRole(db, userId, targetType === 'recruitment_post' ? 'applicant' : 'recruiter')) {
    throw httpLike('需要对应已审核通过的身份', 'APPROVED_IDENTITY_REQUIRED');
  }
  const owner = resolveTargetOwner(db, targetType, targetId);
  if (!targetPublic(owner)) throw httpLike('目标信息不可用', 'TARGET_UNAVAILABLE');
  if (owner.userId === userId) throw httpLike('不能与自己发起沟通', 'INVALID_TARGET');
  if (isBlockedEitherWay(db, userId, owner.userId)) throw httpLike('双方存在拉黑关系，无法沟通', 'BLOCKED');
  return withTransaction(db, () => {
    const timestamp = now();
    let conversation = db.prepare(`SELECT * FROM conversations
      WHERE initiator_user_id = ? AND peer_user_id = ? AND related_target_type = ? AND related_target_id = ?`)
      .get(userId, owner.userId, targetType, targetId);
    if (!conversation) {
      conversation = db.prepare(`SELECT * FROM conversations
        WHERE initiator_user_id = ? AND peer_user_id = ? AND related_target_type = ? AND related_target_id = ?`)
        .get(owner.userId, userId, targetType, targetId);
    }
    if (!conversation) {
      const id = randomUUID();
      db.prepare(`INSERT INTO conversations(id, initiator_user_id, peer_user_id, related_target_type, related_target_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`).run(id, userId, owner.userId, targetType, targetId, timestamp, timestamp);
      conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
      audit(db, userId, 'conversation.started', 'conversation', id, { targetType, targetId });
    }
    if (conversation.status === 'blocked') throw httpLike('会话已因拉黑停止', 'CONVERSATION_BLOCKED');
    if (conversation.status === 'ended') {
      db.prepare(`UPDATE conversations SET status = 'active', updated_at = ? WHERE id = ?`).run(timestamp, conversation.id);
      conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation.id);
    }
    if (body) sendMessage(db, userId, conversation.id, { body, clientRequestId }, { skipTransaction: true });
    return conversationFromRow(db, conversation, userId);
  });
}

export function listConversations(db, userId) {
  const rows = db.prepare(`SELECT * FROM conversations
    WHERE initiator_user_id = ? OR peer_user_id = ?
    ORDER BY updated_at DESC`).all(userId, userId);
  return rows.map((row) => conversationFromRow(db, row, userId));
}

export function getConversation(db, userId, conversationId) {
  const row = requireConversationParticipant(db, conversationId, userId);
  return conversationFromRow(db, row, userId);
}

export function listMessages(db, userId, conversationId, { limit = 50 } = {}) {
  if (!requireConversationParticipant(db, conversationId, userId)) return null;
  const pageSize = Math.min(Math.max(limit, 1), 100);
  return db.prepare(`SELECT id, conversation_id, sender_user_id, body, client_request_id, created_at
    FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`)
    .all(conversationId, pageSize)
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderUserId: row.sender_user_id,
      body: row.body,
      clientRequestId: row.client_request_id || null,
      createdAt: row.created_at,
      mine: row.sender_user_id === userId,
    }));
}

export function sendMessage(db, userId, conversationId, { body, clientRequestId }, options = {}) {
  const run = () => {
    const conversation = requireConversationParticipant(db, conversationId, userId);
    if (!conversation) return null;
    if (conversation.status !== 'active') throw httpLike('会话已结束或被阻止', 'CONVERSATION_INACTIVE');
    const peerId = conversation.initiator_user_id === userId ? conversation.peer_user_id : conversation.initiator_user_id;
    if (isBlockedEitherWay(db, userId, peerId)) {
      db.prepare(`UPDATE conversations SET status = 'blocked', updated_at = ? WHERE id = ?`).run(now(), conversationId);
      throw httpLike('双方存在拉黑关系，无法发送消息', 'BLOCKED');
    }
    const text = String(body || '').trim();
    if (!text || text.length > 1000) throw httpLike('消息内容无效', 'VALIDATION_ERROR');
    if (clientRequestId) {
      const existing = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? AND sender_user_id = ? AND client_request_id = ?`)
        .get(conversationId, userId, clientRequestId);
      if (existing) {
        return {
          id: existing.id, conversationId, senderUserId: existing.sender_user_id, body: existing.body,
          clientRequestId: existing.client_request_id, createdAt: existing.created_at, mine: true,
        };
      }
    }
    const timestamp = now();
    const id = randomUUID();
    db.prepare(`INSERT INTO messages(id, conversation_id, sender_user_id, body, client_request_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, conversationId, userId, text, clientRequestId || null, timestamp);
    db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(timestamp, conversationId);
    db.prepare(`INSERT INTO conversation_reads(conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
      ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
      .run(conversationId, userId, timestamp);
    audit(db, userId, 'message.sent', 'message', id, { conversationId });
    return {
      id, conversationId, senderUserId: userId, body: text, clientRequestId: clientRequestId || null, createdAt: timestamp, mine: true,
    };
  };
  return options.skipTransaction ? run() : withTransaction(db, run);
}

export function markConversationRead(db, userId, conversationId) {
  if (!requireConversationParticipant(db, conversationId, userId)) return false;
  db.prepare(`INSERT INTO conversation_reads(conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
    .run(conversationId, userId, now());
  return true;
}

export function endConversation(db, userId, conversationId) {
  const conversation = requireConversationParticipant(db, conversationId, userId);
  if (!conversation) return null;
  const timestamp = now();
  db.prepare(`UPDATE conversations SET status = 'ended', updated_at = ? WHERE id = ?`).run(timestamp, conversationId);
  audit(db, userId, 'conversation.ended', 'conversation', conversationId, {});
  return conversationFromRow(db, db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId), userId);
}

function applicationFromRow(db, row, viewerId) {
  if (!row) return null;
  const post = db.prepare(`SELECT post.id, post.job_type, post.salary_range, post.status, post.expires_at, role.user_id AS recruiterUserId
    FROM recruitment_posts post
    JOIN role_profiles role ON role.id = post.recruiter_role_profile_id
    WHERE post.id = ?`).get(row.recruitment_post_id);
  return {
    id: row.id,
    recruitmentPostId: row.recruitment_post_id,
    applicantUserId: row.applicant_user_id,
    status: row.status,
    note: row.note || '',
    jobType: post?.job_type || '',
    salaryRange: post?.salary_range || '',
    postStatus: post?.status || 'disabled',
    recruiterUserId: post?.recruiterUserId || null,
    mineAsApplicant: row.applicant_user_id === viewerId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createApplication(db, userId, { recruitmentPostId, note = '' }) {
  if (!approvedRole(db, userId, 'applicant')) throw httpLike('需要已审核的应聘身份', 'APPROVED_IDENTITY_REQUIRED');
  const owner = resolveTargetOwner(db, 'recruitment_post', recruitmentPostId);
  if (!targetPublic(owner)) throw httpLike('招聘信息不可用', 'TARGET_UNAVAILABLE');
  if (owner.userId === userId) throw httpLike('不能投递自己的招聘', 'INVALID_TARGET');
  if (isBlockedEitherWay(db, userId, owner.userId)) throw httpLike('双方存在拉黑关系，无法投递', 'BLOCKED');
  const existing = db.prepare('SELECT * FROM applications WHERE applicant_user_id = ? AND recruitment_post_id = ?')
    .get(userId, recruitmentPostId);
  if (existing) return applicationFromRow(db, existing, userId);
  return withTransaction(db, () => {
    const timestamp = now();
    const id = randomUUID();
    db.prepare(`INSERT INTO applications(id, applicant_user_id, recruitment_post_id, status, note, created_at, updated_at)
      VALUES (?, ?, ?, 'submitted', ?, ?, ?)`).run(id, userId, recruitmentPostId, String(note || '').slice(0, 500), timestamp, timestamp);
    audit(db, userId, 'application.submitted', 'application', id, { recruitmentPostId });
    return applicationFromRow(db, db.prepare('SELECT * FROM applications WHERE id = ?').get(id), userId);
  });
}

export function listApplicationsForApplicant(db, userId) {
  return db.prepare('SELECT * FROM applications WHERE applicant_user_id = ? ORDER BY updated_at DESC')
    .all(userId).map((row) => applicationFromRow(db, row, userId));
}

export function listApplicationsForRecruiter(db, userId) {
  if (!approvedRole(db, userId, 'recruiter')) throw httpLike('需要已审核的招聘身份', 'APPROVED_IDENTITY_REQUIRED');
  const rows = db.prepare(`SELECT application.* FROM applications application
    JOIN recruitment_posts post ON post.id = application.recruitment_post_id
    JOIN role_profiles role ON role.id = post.recruiter_role_profile_id
    WHERE role.user_id = ?
    ORDER BY application.updated_at DESC`).all(userId);
  return rows.map((row) => applicationFromRow(db, row, userId));
}

export function updateApplicationStatus(db, userId, applicationId, status) {
  if (!APPLICATION_STATUSES.has(status)) throw httpLike('投递状态无效', 'VALIDATION_ERROR');
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
  if (!row) return null;
  const mapped = applicationFromRow(db, row, userId);
  if (status === 'withdrawn') {
    if (row.applicant_user_id !== userId) throw httpLike('只能撤回自己的投递', 'FORBIDDEN');
    if (APPLICATION_TERMINAL.has(row.status) || !['submitted', 'viewed'].includes(row.status)) {
      throw httpLike('当前状态不可撤回', 'INVALID_TRANSITION');
    }
  } else {
    if (mapped.recruiterUserId !== userId) throw httpLike('只能处理自己收到的投递', 'FORBIDDEN');
    const allowed = RECRUITER_APPLICATION_TRANSITIONS[row.status] || [];
    if (!allowed.includes(status)) throw httpLike('当前状态不允许该更新', 'INVALID_TRANSITION');
  }
  const timestamp = now();
  db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, applicationId);
  audit(db, userId, 'application.status_updated', 'application', applicationId, { from: row.status, to: status });
  return applicationFromRow(db, db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId), userId);
}

function interviewFromRow(row, viewerId) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id || null,
    recruiterUserId: row.recruiter_user_id,
    applicantUserId: row.applicant_user_id,
    scheduledAt: row.scheduled_at,
    locationText: row.location_text,
    status: row.status,
    cancelReason: row.cancel_reason || '',
    mineAsRecruiter: row.recruiter_user_id === viewerId,
    mineAsApplicant: row.applicant_user_id === viewerId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createInterview(db, userId, { applicationId = null, applicantUserId, scheduledAt, locationText }) {
  if (!approvedRole(db, userId, 'recruiter')) throw httpLike('需要已审核的招聘身份', 'APPROVED_IDENTITY_REQUIRED');
  if (!approvedRole(db, applicantUserId, 'applicant')) throw httpLike('对方需要已审核的应聘身份', 'APPROVED_IDENTITY_REQUIRED');
  if (isBlockedEitherWay(db, userId, applicantUserId)) throw httpLike('双方存在拉黑关系，无法邀请', 'BLOCKED');
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) throw httpLike('面试时间无效', 'VALIDATION_ERROR');
  const place = String(locationText || '').trim();
  if (!place || place.length > 200) throw httpLike('面试地点无效', 'VALIDATION_ERROR');
  if (applicationId) {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!application || application.applicant_user_id !== applicantUserId) throw httpLike('投递记录无效', 'VALIDATION_ERROR');
    const mapped = applicationFromRow(db, application, userId);
    if (mapped.recruiterUserId !== userId) throw httpLike('只能基于自己的招聘发起邀请', 'FORBIDDEN');
  }
  return withTransaction(db, () => {
    const timestamp = now();
    const id = randomUUID();
    db.prepare(`INSERT INTO interviews(id, application_id, recruiter_user_id, applicant_user_id, scheduled_at, location_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)`).run(id, applicationId, userId, applicantUserId, new Date(scheduledAt).toISOString(), place, timestamp, timestamp);
    if (applicationId) {
      db.prepare(`UPDATE applications SET status = 'interviewing', updated_at = ? WHERE id = ? AND status NOT IN ('hired','rejected','withdrawn','closed')`)
        .run(timestamp, applicationId);
    }
    audit(db, userId, 'interview.invited', 'interview', id, { applicantUserId, applicationId });
    return interviewFromRow(db.prepare('SELECT * FROM interviews WHERE id = ?').get(id), userId);
  });
}

export function listInterviews(db, userId) {
  return db.prepare(`SELECT * FROM interviews
    WHERE recruiter_user_id = ? OR applicant_user_id = ?
    ORDER BY scheduled_at DESC`).all(userId, userId).map((row) => interviewFromRow(row, userId));
}

export function respondInterview(db, userId, interviewId, decision) {
  const row = db.prepare('SELECT * FROM interviews WHERE id = ?').get(interviewId);
  if (!row) return null;
  if (row.applicant_user_id !== userId) throw httpLike('只能由求职者接受或拒绝邀请', 'FORBIDDEN');
  if (row.status !== 'invited') throw httpLike('当前面试状态不可响应', 'INVALID_TRANSITION');
  if (!['accept', 'decline'].includes(decision)) throw httpLike('响应决定无效', 'VALIDATION_ERROR');
  const status = decision === 'accept' ? 'accepted' : 'declined';
  const timestamp = now();
  db.prepare('UPDATE interviews SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, interviewId);
  audit(db, userId, 'interview.responded', 'interview', interviewId, { decision });
  return interviewFromRow(db.prepare('SELECT * FROM interviews WHERE id = ?').get(interviewId), userId);
}

export function cancelInterview(db, userId, interviewId, reason) {
  const row = db.prepare('SELECT * FROM interviews WHERE id = ?').get(interviewId);
  if (!row) return null;
  if (row.recruiter_user_id !== userId && row.applicant_user_id !== userId) throw httpLike('无权取消该面试', 'FORBIDDEN');
  if (!['invited', 'accepted'].includes(row.status)) throw httpLike('当前面试状态不可取消', 'INVALID_TRANSITION');
  const cancelReason = String(reason || '').trim();
  if (!cancelReason || cancelReason.length > 500) throw httpLike('取消原因必填', 'VALIDATION_ERROR');
  const timestamp = now();
  db.prepare('UPDATE interviews SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?')
    .run('cancelled', cancelReason, timestamp, interviewId);
  audit(db, userId, 'interview.cancelled', 'interview', interviewId, { reason: cancelReason });
  return interviewFromRow(db.prepare('SELECT * FROM interviews WHERE id = ?').get(interviewId), userId);
}
