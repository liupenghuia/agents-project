import { now } from '../time.js';
import { publicApplicantPredicate, publicRecruitmentPredicate } from '../visibility.js';
import { assertMarketViewer } from './access.js';

const mapGridSize = (zoom) => Math.max(0.01, 360 / (2 ** (zoom + 3)));

function projectedCell(latitude, longitude, zoom) {
  const size = mapGridSize(zoom);
  const latitudeIndex = Math.floor((latitude + 90) / size);
  const longitudeIndex = Math.floor((longitude + 180) / size);
  return {
    key: `${latitudeIndex}:${longitudeIndex}`,
    latitude: Number((((latitudeIndex + 0.5) * size) - 90).toFixed(6)),
    longitude: Number((((longitudeIndex + 0.5) * size) - 180).toFixed(6)),
  };
}

function aggregateMarketMap(rows, zoom, limit, mapSingle) {
  const cells = new Map();
  rows.forEach((row) => {
    const projection = projectedCell(row.latitude, row.longitude, zoom);
    const cell = cells.get(projection.key) || { ...projection, rows: [] };
    cell.rows.push(row);
    cells.set(projection.key, cell);
  });
  const items = Array.from(cells.values()).slice(0, limit).map((cell) => {
    if (cell.rows.length > 1) {
      return { cluster: true, count: cell.rows.length, latitude: cell.latitude, longitude: cell.longitude };
    }
    return { ...mapSingle(cell.rows[0]), cluster: false, latitude: cell.latitude, longitude: cell.longitude };
  });
  return { items, zoom, nextCursor: null };
}

export function mapMarketRecruitmentPosts(db, userId, bounds, { zoom, limit = 50, jobType = '', salaryRange = '', location = '', publishedFrom = null, publishedTo = null } = {}) {
  assertMarketViewer(db, userId, 'applicant');
  const timestamp = now();
  const rows = db.prepare(`SELECT rp.id, rp.job_type, rp.salary_range, rp.settlement_method, rp.location_text,
      rp.latitude, rp.longitude, rp.status, rp.published_at, rp.created_at
    FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    WHERE ${publicRecruitmentPredicate('rp')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND rp.latitude BETWEEN ? AND ? AND rp.longitude BETWEEN ? AND ?
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.salary_range LIKE ?)
      AND (? = '' OR rp.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) >= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) <= ?)
    ORDER BY COALESCE(rp.published_at, rp.created_at) DESC LIMIT 1000`)
    .all(timestamp, userId, bounds.south, bounds.north, bounds.west, bounds.east,
      jobType, `%${jobType}%`, salaryRange, `%${salaryRange}%`, location, `%${location}%`,
      publishedFrom, publishedFrom, publishedTo, publishedTo);
  return aggregateMarketMap(rows, zoom, limit, (row) => ({
    id: row.id, jobType: row.job_type, salaryRange: row.salary_range,
    settlementMethod: row.settlement_method, locationText: row.location_text,
    publishedAt: row.published_at || row.created_at, status: row.status,
  }));
}

export function mapMarketJobSeekingInformation(db, userId, bounds, {
  zoom, limit = 50, jobTypeName = '', expectedSalary = '', workMethod = '', location = '', publishedFrom = null, publishedTo = null,
} = {}) {
  assertMarketViewer(db, userId, 'recruiter');
  const timestamp = now();
  const rows = db.prepare(`SELECT i.role_profile_id, i.job_type_name, i.expected_salary, i.work_method, i.location_text,
      i.latitude, i.longitude, i.visibility_status, i.published_at, i.created_at
    FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    WHERE ${publicApplicantPredicate('i')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND i.latitude BETWEEN ? AND ? AND i.longitude BETWEEN ? AND ?
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.expected_salary LIKE ?)
      AND (? = '' OR i.work_method = ?)
      AND (? = '' OR i.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) >= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) <= ?)
    ORDER BY COALESCE(i.published_at, i.created_at) DESC LIMIT 1000`)
    .all(timestamp, userId, bounds.south, bounds.north, bounds.west, bounds.east,
      jobTypeName, `%${jobTypeName}%`, expectedSalary, `%${expectedSalary}%`,
      workMethod, workMethod, location, `%${location}%`,
      publishedFrom, publishedFrom, publishedTo, publishedTo);
  return aggregateMarketMap(rows, zoom, limit, (row) => ({
    id: row.role_profile_id, jobTypeName: row.job_type_name, expectedSalary: row.expected_salary,
    workMethod: row.work_method, locationText: row.location_text,
    publishedAt: row.published_at || row.created_at, status: row.visibility_status,
  }));
}
