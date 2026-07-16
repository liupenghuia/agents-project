function invalidMarketCursor() {
  const error = new Error('市场列表游标无效');
  error.status = 422;
  error.code = 'INVALID_MARKET_CURSOR';
  return error;
}

export function decodeMarketCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!value || typeof value.publishedAt !== 'string' || !value.publishedAt
      || typeof value.id !== 'string' || !value.id || Number.isNaN(Date.parse(value.publishedAt))) {
      throw invalidMarketCursor();
    }
    return value;
  } catch (error) {
    if (error.code === 'INVALID_MARKET_CURSOR') throw error;
    throw invalidMarketCursor();
  }
}

export function encodeMarketCursor(row, idField) {
  return Buffer.from(JSON.stringify({
    publishedAt: row.published_at || row.created_at,
    id: row[idField],
  })).toString('base64url');
}
