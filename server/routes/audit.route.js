/**
 * Audit Module (Upgrade Plan Track A, Phase A1)
 *
 * Exposes the audit trail that `audit.middleware.js` already writes on
 * every request via AuditLog.logEvent() — until now that data was
 * write-only, with no API for a compliance officer to search or export it.
 * This route adds read access only; it introduces no new write path.
 *
 * audit_logs has no tenant_id/organization_id column (see
 * models/auditLog.model.intelligent.js), so there is no per-tenant RLS
 * boundary to enforce here. Access is gated at this route layer instead —
 * admin/hospital-admin roles only, never general staff.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import AuditLog from '../models/auditLog.model.intelligent.js';

const router = express.Router();

const ADMIN_ROLES = ['admin', 'hospital', 'system_admin'];

function parseFilters(query) {
  const where = {};
  const passthrough = ['userId', 'userType', 'userEmail', 'action', 'resourceType', 'resourceId', 'status', 'sessionId', 'search'];
  for (const key of passthrough) {
    if (query[key] !== undefined && query[key] !== '') where[key] = query[key];
  }
  if (query.isPHI !== undefined) where.isPHI = query.isPHI === 'true';
  if (query.isPII !== undefined) where.isPII = query.isPII === 'true';
  if (query.dateFrom) where.dateFrom = new Date(query.dateFrom);
  if (query.dateTo) where.dateTo = new Date(query.dateTo);
  return where;
}

function toCsvRow(values) {
  return values
    .map((value) => {
      const str = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    })
    .join(',');
}

// GET /api/audit/logs — search + paginate
router.get('/logs', authUser, requireRole(ADMIN_ROLES), async (req, res) => {
  try {
    const where = parseFilters(req.query);
    const limit = req.query.limit;
    const offset = req.query.offset;

    const [rows, total] = await Promise.all([
      AuditLog.findAll({ where, limit, offset }),
      AuditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        limit: Math.min(parseInt(limit, 10) || 50, 500),
        offset: Math.max(parseInt(offset, 10) || 0, 0),
      },
    });
  } catch (err) {
    console.error('[AuditModule] GET /logs failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
});

// GET /api/audit/logs/export — CSV export of the same filtered set
router.get('/logs/export', authUser, requireRole(ADMIN_ROLES), async (req, res) => {
  try {
    const where = parseFilters(req.query);
    const rows = await AuditLog.findAll({ where, limit: req.query.limit || 5000, offset: 0 });

    const columns = [
      'id', 'timestamp', 'user_id', 'user_type', 'user_email', 'action',
      'resource_type', 'resource_id', 'status', 'status_code', 'endpoint',
      'method', 'ip_address', 'is_phi', 'is_pii', 'error_message',
    ];
    const lines = [toCsvRow(columns)];
    for (const row of rows) {
      lines.push(toCsvRow(columns.map((col) => row[col])));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[AuditModule] GET /logs/export failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to export audit logs' });
  }
});

// GET /api/audit/logs/:id — single record
router.get('/logs/:id', authUser, requireRole(ADMIN_ROLES), async (req, res) => {
  try {
    const record = await AuditLog.findByPk(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Audit log not found' });
    res.json({ success: true, data: record });
  } catch (err) {
    console.error('[AuditModule] GET /logs/:id failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
  }
});

// GET /api/audit/summary — counts by action/resource_type/status for a date range
router.get('/summary', authUser, requireRole(ADMIN_ROLES), async (req, res) => {
  try {
    const where = parseFilters(req.query);
    const [total, failed, phiAccess] = await Promise.all([
      AuditLog.count({ where }),
      AuditLog.count({ where: { ...where, status: 'FAILURE' } }),
      AuditLog.count({ where: { ...where, isPHI: true } }),
    ]);
    res.json({ success: true, data: { total, failed, phiAccess } });
  } catch (err) {
    console.error('[AuditModule] GET /summary failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to summarize audit logs' });
  }
});

export default router;
