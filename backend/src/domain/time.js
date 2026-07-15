export const now = () => new Date().toISOString();
export const PUBLICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function defaultExpiresAt(fromIso = now()) {
  return new Date(new Date(fromIso).getTime() + PUBLICATION_TTL_MS).toISOString();
}

export function isPublicationActive(expiresAt, timestamp = now()) {
  return !expiresAt || expiresAt > timestamp;
}

export function notExpiredSql(alias) {
  return `(${alias}.expires_at IS NULL OR ${alias}.expires_at > ?)`;
}
