const assert = require('assert');
const permissions = require('../permissions');

assert.deepStrictEqual(permissions.allowedModules('owner'), ['review', 'users', 'moderation', 'reports', 'admins']);
assert.deepStrictEqual(permissions.allowedModules('reviewer'), ['review']);
assert.strictEqual(permissions.defaultModule('admin'), 'users');
assert.strictEqual(permissions.defaultModule('operator'), 'moderation');
assert.strictEqual(permissions.canAccess('admin', 'review'), false);
assert.strictEqual(permissions.canAccess('admin', 'moderation'), false);
assert.strictEqual(permissions.canAccess('operator', 'moderation'), true);
assert.strictEqual(permissions.canManageUsers('operator'), false);
assert.strictEqual(permissions.canManageAdmins('owner'), true);
assert.strictEqual(permissions.canAssignAdminRoles('admin'), false);
assert.strictEqual(permissions.canAssignAdminRoles('owner'), true);
assert.strictEqual(permissions.canManageAdminAccount('admin', 'owner'), false);
assert.strictEqual(permissions.canManageAdminAccount('admin', 'reviewer'), true);
assert.strictEqual(permissions.defaultModule('unknown'), null);

console.log('web permission tests passed');
