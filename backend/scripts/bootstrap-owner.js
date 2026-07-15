import { createDatabase, bootstrapAdmin, listAdminAccounts } from '../src/db.js';

const loginName = String(process.env.ADMIN_BOOTSTRAP_LOGIN_NAME || '').trim();
const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
const databasePath = process.env.DATABASE_PATH || './recruitment.sqlite';

if (!loginName || password.length < 12) {
  throw new Error('ADMIN_BOOTSTRAP_LOGIN_NAME and ADMIN_BOOTSTRAP_PASSWORD (12+ characters) are required');
}

const db = createDatabase(databasePath);
try {
  if (listAdminAccounts(db).length) throw new Error('An administrator already exists; refusing to replace production access');
  const owner = bootstrapAdmin(db, { loginName, password });
  console.log(`Created production owner: ${owner.loginName}`);
} finally {
  db.close();
}
