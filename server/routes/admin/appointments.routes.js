import express from 'express';
import { Op } from 'sequelize';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';
import Appointment from '../../models/appointment.model.intelligent.js';

const router = express.Router();

// List appointments for admins with optional filters
router.get('/', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { status, q, limit } = req.query;
    const where = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (q) {
      where[Op.or] = [
        { patientName: { [Op.iLike]: `%${q}%` } },
        { doctorName: { [Op.iLike]: `%${q}%` } },
        { patientEmail: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const appointments = await Appointment.findAll({
      where,
      order: [
        ['appointmentDate', 'DESC'],
        ['appointmentTime', 'DESC'],
      ],
      limit: Number(limit) || 200,
    });

    res.json({ success: true, appointments });
  } catch (error) {
    console.error('Admin appointments list failed:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch appointments' });
  }
});

// Get appointment details for admins
router.get('/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.json({ success: true, appointment });
  } catch (error) {
    console.error('Admin appointment detail failed:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch appointment' });
  }
});

// Update appointment status/date/time for admins
router.patch('/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { status, appointmentDate, appointmentTime, notes } = req.body;
    const appointment = await Appointment.findByPk(req.params.id);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (appointmentDate) updates.appointmentDate = appointmentDate;
    if (appointmentTime) updates.appointmentTime = appointmentTime;
    if (notes !== undefined) updates.notes = notes;

    await appointment.update(updates);
    res.json({ success: true, appointment });
  } catch (error) {
    console.error('Admin appointment update failed:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to update appointment' });
  }
});

export default router;
