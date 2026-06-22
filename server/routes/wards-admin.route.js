/** GAP-IPD-001 — Ward master CRUD */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

const router = express.Router();
const orgId = (req) => req.user.organization_id || req.user.tenant_id || req.user.id;

router.get('/', authUser, async (req, res) => {
  const rows = await sequelize.query(
    'SELECT * FROM wards WHERE organization_id = :orgId ORDER BY name',
    { replacements: { orgId: orgId(req) }, type: QueryTypes.SELECT },
  );
  res.json({ success: true, data: rows });
});

router.post('/', authUser, async (req, res) => {
  const { name, wardType, floor, capacity, chargePerDay, genderRestriction } = req.body;
  const [row] = await sequelize.query(
    `INSERT INTO wards (organization_id, name, ward_type, floor, capacity, charge_per_day, gender_restriction, active, created_at, updated_at)
     VALUES (:orgId, :name, :type, :floor, :cap, :charge, :gender, true, NOW(), NOW()) RETURNING *`,
    {
      replacements: {
        orgId: orgId(req), name, type: wardType || 'general', floor: floor ?? null,
        cap: capacity ?? 10, charge: chargePerDay ?? 0, gender: genderRestriction || 'any',
      },
      type: QueryTypes.INSERT,
    },
  );
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', authUser, async (req, res) => {
  const fields = ['name', 'ward_type', 'floor', 'capacity', 'charge_per_day', 'active'];
  const sets = [];
  const replacements = { id: req.params.id, orgId: orgId(req) };
  for (const f of fields) {
    const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const key = req.body[camel] ?? req.body[f];
    if (key !== undefined) {
      sets.push(`${f} = :${f}`);
      replacements[f] = key;
    }
  }
  if (!sets.length) return res.status(400).json({ success: false, message: 'No fields' });
  await sequelize.query(
    `UPDATE wards SET ${sets.join(', ')}, updated_at = NOW() WHERE id = :id AND organization_id = :orgId`,
    { replacements, type: QueryTypes.UPDATE },
  );
  res.json({ success: true });
});

router.delete('/:id', authUser, async (req, res) => {
  await sequelize.query(
    'UPDATE wards SET active = false, updated_at = NOW() WHERE id = :id AND organization_id = :orgId',
    { replacements: { id: req.params.id, orgId: orgId(req) }, type: QueryTypes.UPDATE },
  );
  res.json({ success: true });
});

export default router;
