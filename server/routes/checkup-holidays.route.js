/**
 * /api/admin/checkup-holidays — the national and festival holidays on which health check-ups
 * cannot be booked (Sundays are closed in code). Admin and team only. Add next year's list here
 * when the Government of India publishes it; a holiday is switched off, never hard-deleted.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { clearHolidayCache } from '../services/checkup-calendar.service.js';

const router = express.Router();
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['national', 'festival', 'other'];
const guard = [authUser, requireRole(['admin', 'team'])];
const sel = { type: postgresSequelize.QueryTypes.SELECT };
const COLUMNS = `id, to_char(holiday_date, 'YYYY-MM-DD') AS date, name, kind, provisional, source, is_active AS "isActive", updated_at AS "updatedAt"`;

router.get('/', ...guard, async (req, res) => {
  const year = /^\d{4}$/.test(String(req.query.year || '')) ? Number(req.query.year) : null;
  try {
    const rows = await postgresSequelize.query(
      `SELECT ${COLUMNS} FROM health_checkup_holidays
        WHERE (:year::int IS NULL OR extract(year FROM holiday_date) = :year::int) ORDER BY holiday_date`,
      { ...sel, replacements: { year } });
    return res.json({ success: true, sundaysClosed: true, holidays: rows });
  } catch (error) {
    console.error('[checkup-holidays] list', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load holidays' });
  }
});

router.post('/', ...guard, async (req, res) => {
  const { date, name, kind = 'festival', provisional = false, source = null } = req.body || {};
  if (!ISO.test(String(date)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
  if (typeof name !== 'string' || !name.trim() || name.length > 120) return res.status(400).json({ success: false, message: 'name is required (up to 120 characters)' });
  if (!KINDS.includes(kind)) return res.status(400).json({ success: false, message: `kind must be one of ${KINDS.join(', ')}` });
  try {
    const [row] = await postgresSequelize.query(
      `INSERT INTO health_checkup_holidays (holiday_date, name, kind, provisional, source, created_by)
       VALUES (:date, :name, :kind, :provisional, :source, :userId)
       ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, provisional = EXCLUDED.provisional,
         source = EXCLUDED.source, is_active = true, updated_at = now()
       RETURNING ${COLUMNS}`,
      { ...sel, replacements: { date, name: name.trim(), kind, provisional: provisional === true, source: source ? String(source).slice(0, 300) : null, userId: req.user.id } });
    clearHolidayCache();
    return res.status(201).json({ success: true, holiday: row });
  } catch (error) {
    console.error('[checkup-holidays] save', error.message);
    return res.status(500).json({ success: false, message: 'Unable to save holiday' });
  }
});

// Switch a holiday off (or back on with { isActive: true }); rows are kept for the record.
router.patch('/:id', ...guard, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid id' });
  if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be true or false' });
  try {
    const [row] = await postgresSequelize.query(
      `UPDATE health_checkup_holidays SET is_active = :active, updated_at = now() WHERE id = :id RETURNING ${COLUMNS}`,
      { ...sel, replacements: { id, active: req.body.isActive } });
    if (!row) return res.status(404).json({ success: false, message: 'Holiday not found' });
    clearHolidayCache();
    return res.json({ success: true, holiday: row });
  } catch (error) {
    console.error('[checkup-holidays] update', error.message);
    return res.status(500).json({ success: false, message: 'Unable to update holiday' });
  }
});

export default router;
