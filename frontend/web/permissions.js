(function expose(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AdminPermissions = api;
}(typeof window === 'undefined' ? null : window, () => {
  const modulesByRole = {
    owner: ['review', 'users', 'moderation', 'reports', 'admins'],
    admin: ['users', 'admins'],
    reviewer: ['review'],
    operator: ['moderation', 'reports'],
  };

  const allowedModules = (role) => modulesByRole[role] ? [...modulesByRole[role]] : [];
  const canAccess = (role, moduleName) => allowedModules(role).includes(moduleName);
  const defaultModule = (role) => allowedModules(role)[0] || null;
  const canManageUsers = (role) => role === 'owner' || role === 'admin';
  const canManageAdmins = (role) => role === 'owner' || role === 'admin';
  const canAssignAdminRoles = (role) => role === 'owner';
  const canManageAdminAccount = (role, targetRole) => role === 'owner' || (role === 'admin' && targetRole !== 'owner');

  return { allowedModules, canAccess, canAssignAdminRoles, canManageAdminAccount, canManageAdmins, canManageUsers, defaultModule };
}));
