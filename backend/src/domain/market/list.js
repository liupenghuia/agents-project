import { now } from '../time.js';
import { publicApplicantPredicate, publicRecruitmentPredicate } from '../visibility.js';
import { assertMarketViewer } from './access.js';
import { decodeMarketCursor, encodeMarketCursor } from './cursor.js';
import { applicantMarketRow, recruiterMarketRow } from './dto.js';

export function listMarketRecruitmentPosts(db, userId, {
  cursor = null, limit = 20, keyword = '', jobType = '', salaryRange = '', settlementMethod = '', location = '', publishedFrom = null, publishedTo = null,
} = {}) {
  const viewer = assertMarketViewer(db, userId, 'applicant');
  const decoded = decodeMarketCursor(cursor);
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const timestamp = now();
  const filterArgs = [timestamp, userId, keyword, `%${keyword}%`, jobType, `%${jobType}%`, salaryRange, `%${salaryRange}%`,
    settlementMethod, settlementMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo];
  const totalCount = db.prepare(`SELECT COUNT(*) AS count
    FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    WHERE ${publicRecruitmentPredicate('rp')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.salary_range LIKE ?)
      AND (? = '' OR rp.settlement_method = ?)
      AND (? = '' OR rp.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) >= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) <= ?)`)
    .get(...filterArgs).count;
  const rows = db.prepare(`SELECT rp.*, r.contact_name, r.contact_phone,
      EXISTS(SELECT 1 FROM applicant_favorites f
        WHERE f.applicant_role_profile_id = ? AND f.recruitment_post_id = rp.id) AS is_favorited
    FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    JOIN recruiter_profiles r ON r.role_profile_id = rp.recruiter_role_profile_id
    WHERE ${publicRecruitmentPredicate('rp')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.salary_range LIKE ?)
      AND (? = '' OR rp.settlement_method = ?)
      AND (? = '' OR rp.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) >= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) <= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) < ?
        OR (COALESCE(rp.published_at, rp.created_at) = ? AND rp.id < ?))
    ORDER BY COALESCE(rp.published_at, rp.created_at) DESC, rp.id DESC LIMIT ?`)
    .all(viewer.id, timestamp, userId, keyword, `%${keyword}%`, jobType, `%${jobType}%`, salaryRange, `%${salaryRange}%`,
      settlementMethod, settlementMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo, decoded?.publishedAt ?? null,
      decoded?.publishedAt ?? null, decoded?.publishedAt ?? null, decoded?.id ?? null, pageSize + 1);
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  return {
    items: items.map((row) => recruiterMarketRow(db, row)),
    totalCount,
    nextCursor: hasMore ? encodeMarketCursor(items.at(-1), 'id') : null,
  };
}

export function getMarketRecruitmentPost(db, userId, postId) {
  const viewer = assertMarketViewer(db, userId, 'applicant');
  const timestamp = now();
  const row = db.prepare(`SELECT rp.*, r.contact_name, r.contact_phone,
      EXISTS(SELECT 1 FROM applicant_favorites f
        WHERE f.applicant_role_profile_id = ? AND f.recruitment_post_id = rp.id) AS is_favorited
    FROM recruitment_posts rp JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id
    JOIN recruiter_profiles r ON r.role_profile_id = rp.recruiter_role_profile_id
    WHERE rp.id = ? AND ${publicRecruitmentPredicate('rp')} AND role.review_status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)`).get(viewer.id, postId, timestamp, userId);
  if (!row) return null;
  return recruiterMarketRow(db, row, true);
}

export function listMarketJobSeekingInformation(db, userId, {
  cursor = null, limit = 20, keyword = '', jobTypeName = '', expectedSalary = '', workMethod = '', location = '', publishedFrom = null, publishedTo = null,
} = {}) {
  const viewer = assertMarketViewer(db, userId, 'recruiter');
  const decoded = decodeMarketCursor(cursor);
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const timestamp = now();
  const filterArgs = [timestamp, userId, keyword, `%${keyword}%`, jobTypeName, `%${jobTypeName}%`, expectedSalary, `%${expectedSalary}%`,
    workMethod, workMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo];
  const totalCount = db.prepare(`SELECT COUNT(*) AS count
    FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    WHERE ${publicApplicantPredicate('i')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.expected_salary LIKE ?)
      AND (? = '' OR i.work_method = ?)
      AND (? = '' OR i.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) >= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) <= ?)`)
    .get(...filterArgs).count;
  const rows = db.prepare(`SELECT i.*, a.display_name AS contact_name, a.contact_phone,
      EXISTS(SELECT 1 FROM recruiter_favorites f
        WHERE f.recruiter_role_profile_id = ? AND f.applicant_information_role_profile_id = i.role_profile_id) AS is_favorited
    FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    JOIN applicant_profiles a ON a.role_profile_id = i.role_profile_id
    WHERE ${publicApplicantPredicate('i')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.expected_salary LIKE ?)
      AND (? = '' OR i.work_method = ?)
      AND (? = '' OR i.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) >= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) <= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) < ?
        OR (COALESCE(i.published_at, i.created_at) = ? AND i.role_profile_id < ?))
    ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.role_profile_id DESC LIMIT ?`)
    .all(viewer.id, timestamp, userId, keyword, `%${keyword}%`, jobTypeName, `%${jobTypeName}%`, expectedSalary, `%${expectedSalary}%`,
      workMethod, workMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo, decoded?.publishedAt ?? null,
      decoded?.publishedAt ?? null, decoded?.publishedAt ?? null, decoded?.id ?? null, pageSize + 1);
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  return {
    items: items.map((row) => applicantMarketRow(row)),
    totalCount,
    nextCursor: hasMore ? encodeMarketCursor(items.at(-1), 'role_profile_id') : null,
  };
}

export function getMarketJobSeekingInformation(db, userId, informationId) {
  const viewer = assertMarketViewer(db, userId, 'recruiter');
  const timestamp = now();
  const row = db.prepare(`SELECT i.*, a.display_name AS contact_name, a.contact_phone,
      EXISTS(SELECT 1 FROM recruiter_favorites f
        WHERE f.recruiter_role_profile_id = ? AND f.applicant_information_role_profile_id = i.role_profile_id) AS is_favorited
    FROM applicant_job_seeking_information i JOIN role_profiles role ON role.id = i.role_profile_id
    JOIN applicant_profiles a ON a.role_profile_id = i.role_profile_id
    WHERE i.role_profile_id = ? AND ${publicApplicantPredicate('i')}
      AND role.review_status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)`)
    .get(viewer.id, informationId, timestamp, userId);
  return applicantMarketRow(row, Boolean(row));
}

export function getPublicRecruitmentImage(db, imageId) {
  const timestamp = now();
  return db.prepare(`SELECT image.object_key, image.content_type
    FROM recruitment_post_images image
    JOIN recruitment_posts post ON post.id = image.recruitment_post_id AND ${publicRecruitmentPredicate('post')}
    JOIN role_profiles role ON role.id = post.recruiter_role_profile_id AND role.review_status = 'approved'
    WHERE image.id = ?`).get(timestamp, imageId) || null;
}
