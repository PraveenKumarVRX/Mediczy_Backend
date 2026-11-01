import express from 'express';
import POCDevice from '../models/postgres/poc-device.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', authUser, async (req, res) => {
  try {
    const { device_id, device_name, device_type, brand, model, serial_number, ble_mac_address } = req.body;
    
    const existing = await POCDevice.findOne({ where: { device_id } });
    if (existing) return res.status(409).json({ success: false, message: 'Device already registered' });
    
    const device = await POCDevice.create({
      device_id, device_name, device_type, brand, model, serial_number, ble_mac_address,
      status: 'inactive'
    });
    
    res.status(201).json({ success: true, device });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/assign', authUser, async (req, res) => {
  try {
    const { assigned_to_type, assigned_to_id, tenant_id, health_camp_id } = req.body;
    
    const device = await POCDevice.findByPk(req.params.id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    
    await device.update({
      assigned_to_type, assigned_to_id, tenant_id, health_camp_id,
      assigned_date: new Date(),
      status: 'active'
    });
    
    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', authUser, async (req, res) => {
  try {
    const { status, device_type, assigned_to_type, health_camp_id } = req.query;
    const where = {};
    if (status) where.status = status;
    if (device_type) where.device_type = device_type;
    if (assigned_to_type) where.assigned_to_type = assigned_to_type;
    if (health_camp_id) where.health_camp_id = health_camp_id;
    
    const devices = await POCDevice.findAll({ where });
    res.json({ success: true, count: devices.length, devices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id/sync', authUser, async (req, res) => {
  try {
    const { battery_level, location, test_result } = req.body;
    
    const device = await POCDevice.findByPk(req.params.id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    
    const updates = {
      last_used: new Date(),
      battery_level,
      location
    };
    
    if (test_result) {
      updates.usage_count = device.usage_count + 1;
      updates.test_results_count = device.test_results_count + 1;
    }
    
    await device.update(updates);
    res.json({ success: true, message: 'Device synced' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/calibrate', authUser, async (req, res) => {
  try {
    const { calibration_data } = req.body;
    
    const device = await POCDevice.findByPk(req.params.id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    
    const nextCalibration = new Date();
    nextCalibration.setMonth(nextCalibration.getMonth() + 3);
    
    await device.update({
      last_calibration: new Date(),
      next_calibration: nextCalibration,
      calibration_data,
      status: 'active'
    });
    
    res.json({ success: true, message: 'Calibration completed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
