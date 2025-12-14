import express from 'express';
import HealthCamp from '../models/postgres/health-camp.model.postgres.js';
import POCDevice from '../models/postgres/poc-device.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/create', authUser, async (req, res) => {
  try {
    const {
      camp_name, camp_type, location, address,
      start_date, end_date, start_time, end_time,
      organized_by, expected_patients, services_offered
    } = req.body;
    
    const camp = await HealthCamp.create({
      camp_name, camp_type, location, address,
      start_date, end_date, start_time, end_time,
      organized_by, expected_patients, services_offered,
      tenant_id: req.user.tenant_id,
      status: 'planned'
    });
    
    res.status(201).json({ success: true, camp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', authUser, async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    
    const camps = await HealthCamp.findAll({ where, order: [['start_date', 'DESC']] });
    res.json({ success: true, count: camps.length, camps });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', authUser, async (req, res) => {
  try {
    const camp = await HealthCamp.findByPk(req.params.id);
    if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
    
    const devices = await POCDevice.findAll({ where: { health_camp_id: camp.id } });
    
    res.json({ success: true, camp: { ...camp.toJSON(), assigned_devices: devices } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/assign-staff', authUser, async (req, res) => {
  try {
    const { doctors, nurses } = req.body;
    
    const camp = await HealthCamp.findByPk(req.params.id);
    if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
    
    await camp.update({ doctors, nurses });
    res.json({ success: true, message: 'Staff assigned' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/assign-devices', authUser, async (req, res) => {
  try {
    const { device_ids } = req.body;
    
    const camp = await HealthCamp.findByPk(req.params.id);
    if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
    
    await POCDevice.update(
      { health_camp_id: camp.id, status: 'active' },
      { where: { id: device_ids } }
    );
    
    const devices = await POCDevice.findAll({ where: { id: device_ids } });
    await camp.update({ devices: devices.map(d => ({ id: d.id, type: d.device_type, name: d.device_name })) });
    
    res.json({ success: true, message: 'Devices assigned to camp' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id/status', authUser, async (req, res) => {
  try {
    const { status } = req.body;
    
    const camp = await HealthCamp.findByPk(req.params.id);
    if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
    
    await camp.update({ status });
    res.json({ success: true, message: `Camp status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/register-patient', async (req, res) => {
  try {
    const { patient_data } = req.body;
    
    const camp = await HealthCamp.findByPk(req.params.id);
    if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
    
    await camp.update({ registered_patients: camp.registered_patients + 1 });
    res.json({ success: true, message: 'Patient registered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
