import { isPublicationActive } from '../time.js';

export function applicantMarketRow(row, includeContact = false) {
  if (!row) return null;
  const active = isPublicationActive(row.expires_at);
  const result = {
    id: row.role_profile_id, jobTypeName: row.job_type_name, age: row.age, expectedSalary: row.expected_salary,
    workMethod: row.work_method, locationText: row.location_text,
    status: active ? row.visibility_status : 'expired', publishedAt: row.published_at || row.created_at, updatedAt: row.updated_at,
    isFavorited: Boolean(row.is_favorited),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.preferred_work_scope ? { preferredWorkScope: row.preferred_work_scope } : {}),
  };
  if (includeContact && active) {
    result.contactName = row.contact_name;
    result.contactPhone = row.contact_phone;
  }
  return result;
}

export function publicRecruitmentImages(db, postId) {
  return db.prepare(`SELECT id, content_type, sort_order FROM recruitment_post_images
    WHERE recruitment_post_id = ? ORDER BY sort_order`).all(postId).map((image) => ({
    id: image.id,
    url: `/market/media/${image.id}`,
    contentType: image.content_type,
    sortOrder: image.sort_order,
  }));
}

export function recruiterMarketRow(db, row, includeContact = false) {
  if (!row) return null;
  const active = isPublicationActive(row.expires_at);
  const images = publicRecruitmentImages(db, row.id);
  const result = {
    id: row.id, jobType: row.job_type, salaryRange: row.salary_range, settlementMethod: row.settlement_method,
    locationText: row.location_text, status: active ? row.status : 'expired', publishedAt: row.published_at || row.created_at,
    updatedAt: row.updated_at, isFavorited: Boolean(row.is_favorited), images,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(images[0] ? { coverImage: images[0].url } : {}),
  };
  if (includeContact && active) {
    result.contactName = row.contact_name;
    result.contactPhone = row.contact_phone;
  }
  return result;
}
