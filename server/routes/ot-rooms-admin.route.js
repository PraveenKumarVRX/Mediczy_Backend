/** GAP-IPD-002 — OT room admin CRUD */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

const router = express.Router();
const orgId = (req) => req.user.organization_id || req.user.tenant_id || req.user.id;

router.get('/', authUser, async (req, res) => {
  const rows = await sequelize.query(
    'SELECT * FROM ot_rooms WHERE organization_id = :orgId ORDER BY name',
    { replacements: { orgId: orgId(req) }, type: QueryTypes.SELECT },
  ).catch(() => []);
  res.json({ success: true, data: rows });
});

router.post('/', authUser, async (req, res) => {
  const { name, roomType, capacity, equipmentNotes } = req.body;
  const [row] = await sequelize.query(
    `INSERT INTO ot_rooms (organization_id, name, room_type, capacity, equipment_notes, active, created_at, updated_at)
     VALUES (:orgId, :name, :type, :cap, :notes, true, NOW(), NOW()) RETURNING *`,
    {
      replacements: {
        orgId: orgId(req), name, type: roomType || 'major', cap: capacity ?? 1,
        notes: equipmentNotes || null,
      },
      type: QueryTypes.INSERT,
    },
  ).catch((e) => { throw e; });
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', authUser, async (req, res) => {
  const { name, roomType, capacity, active, equipmentNotes } = req.body;
  await sequelize.query(
    `UPDATE ot_rooms SET name = COALESCE(:name, name), room_type = COALESCE(:type, room_type),
     capacity = COALESCE(:cap, capacity), active = COALESCE(:active, active),
     equipment_notes = COALESCE(:notes, equipment_notes), updated_at = NOW()
     WHERE id = :id AND organization_id = :orgId`,
    {
      replacements: {
        id: req.params.id, orgId: orgId(req), name: name ?? null, type: roomType ?? null,
        cap: capacity ?? null, active: active ?? null, notes: equipmentNotes ?? null,
      },
      type: QueryTypes.UPDATE,
    },
  );
  res.json({ success: true });
});

export default router;
