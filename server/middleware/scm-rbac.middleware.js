/**
 * SCM role-based access — roles: admin, buyer, approver, stores, viewer
 */
const ROLE_PERMISSIONS = {
  admin: ['*'],
  buyer: ['read', 'create_po', 'create_indent', 'create_item', 'create_vendor', 'ai'],
  approver: ['read', 'approve_po', 'approve_invoice', 'approve_indent', 'ai'],
  stores: ['read', 'grn', 'post_grn', 'cycle_count', 'inventory', 'cold_chain', 'controlled', 'ai'],
  viewer: ['read', 'ai'],
};

const actionMap = {
  'GET': 'read',
  'POST': 'create',
  'PATCH': 'approve',
  'DELETE': 'delete',
};

export const scmRoleFromUser = (user) => {
  const r = user?.scmRole || user?.role;
  if (r === 'scm') return 'admin';
  if (['admin', 'buyer', 'approver', 'stores', 'viewer'].includes(r)) return r;
  return 'admin';
};

export const requireScmPermission = (permission) => (req, res, next) => {
  const role = scmRoleFromUser(req.scmUser);
  const allowed = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
  if (allowed.includes('*') || allowed.includes(permission)) return next();
  return res.status(403).json({ success: false, message: `SCM role '${role}' cannot perform: ${permission}` });
};

export const scmPermissionForPath = (method, path) => {
  if (path.includes('/login')) return null;
  if (path.includes('/ai/')) return 'ai';
  if (path.includes('/approvals') && method === 'PATCH') return 'approve_po';
  if (path.includes('/grns') && method === 'PATCH') return 'post_grn';
  if (path.includes('/grn')) return 'grn';
  if (path.includes('/orders') && method === 'PATCH') return 'approve_po';
  if (path.includes('/orders') && method === 'POST') return 'create_po';
  if (path.includes('/indents') && path.includes('approve')) return 'approve_indent';
  if (path.includes('/indents')) return 'create_indent';
  if (path.includes('/ap/invoices') && method === 'PATCH') return 'approve_invoice';
  if (path.includes('/cycle-counts')) return 'cycle_count';
  if (path.includes('/inventory')) return 'inventory';
  if (path.includes('/cold-chain')) return 'cold_chain';
  if (path.includes('/controlled')) return 'controlled';
  if (method === 'GET') return 'read';
  return 'create';
};

export const scmRbacGuard = (req, res, next) => {
  const perm = scmPermissionForPath(req.method, req.path);
  if (!perm) return next();
  return requireScmPermission(perm)(req, res, next);
};
