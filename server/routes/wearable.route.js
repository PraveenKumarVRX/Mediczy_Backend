/**
 * Wearable Device Routes
 * Manage health monitoring wearables (smartwatch, band, ring)
 */

import express from 'express';
import Wearable from '../models/postgres/wearable.model.postgres.js';
import HealthReading from '../models/postgres/health-reading.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';
import { auditHealthAccess } from '../middleware/audit.middleware.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/wearables
 * Register a user's personal device (BLE paired device)
 */
router.post('/', authUser, async (req, res) => {
  try {
    const {
      deviceId,
      name,
      type,
      brand,
      model,
      batteryLevel,
      lastSync
    } = req.body;
    
    const userId = req.user.id;
    
    // Check if device already registered for this user
    const existing = await Wearable.findOne({
      where: { 
        device_id: deviceId,
        user_id: userId
      }
    });
    
    if (existing) {
      // Update existing device
      await existing.update({
        device_name: name,
        type,
        brand,
        model,
        battery_level: batteryLevel,
        last_sync: lastSync || new Date(),
        status: 'active'
      });
      
      return res.json({
        success: true,
        message: 'Device updated successfully',
        device: existing
      });
    }
    
    // Create new device registration
    const wearable = await Wearable.create({
      device_id: deviceId,
      device_name: name,
      type,
      brand,
      model,
      user_id: userId,
      tenant_id: req.user.tenantId || null,
      battery_level: batteryLevel,
      last_sync: lastSync || new Date(),
      status: 'active',
      assignment_date: new Date()
    });
    
    // Also add to user_devices table for validation
    try {
      const { postgresSequelize } = await import('../db/postgres-sequelize.js');
      await postgresSequelize.query(
        `INSERT INTO user_devices (user_id, device_id, device_name, device_type, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
         ON CONFLICT (device_id) DO UPDATE SET 
           user_id = $1,
           device_name = EXCLUDED.device_name,
           device_type = EXCLUDED.device_type,
           is_active = TRUE,
           updated_at = NOW()`,
        { bind: [userId, deviceId, name, type] }
      );
    } catch (dbError) {
      console.log('Note: user_devices table may not exist yet:', dbError.message);
    }
    
    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      device: wearable
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Device registration failed',
      error: error.message
    });
  }
});

/**
 * POST /api/wearables/provision
 * Provision new wearable device — admin only
 */
router.post('/provision', authUser, async (req, res) => {
  if (!req.user?.isAdmin && req.userRole !== 'admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Admin access required to provision devices' });
  }
  try {
    const {
      device_id,
      device_name,
      type,
      brand = 'Mediczy',
      model,
      mac_address,
      serial_number,
      features,
      battery_capacity
    } = req.body;
    
    // Check if device already exists
    const existing = await Wearable.findOne({
      where: { device_id }
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Device already provisioned'
      });
    }
    
    // Create wearable
    const wearable = await Wearable.create({
      device_id,
      device_name,
      type,
      brand,
      model,
      mac_address,
      serial_number,
      features: features || undefined,
      battery_capacity,
      status: 'available',
      purchase_date: new Date(),
      warranty_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    });
    
    res.status(201).json({
      success: true,
      message: 'Wearable provisioned successfully',
      wearable: {
        id: wearable.id,
        device_id: wearable.device_id,
        type: wearable.type,
        model: wearable.model,
        status: wearable.status
      }
    });
  } catch (error) {
    console.error('Wearable provisioning error:', error);
    res.status(500).json({
      success: false,
      message: 'Provisioning failed',
      error: error.message
    });
  }
});

/**
 * POST /api/wearables/:id/assign
 * Assign wearable to user — admin only
 */
router.post('/:id/assign', authUser, async (req, res) => {
  if (!req.user?.isAdmin && req.userRole !== 'admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Admin access required to assign devices' });
  }
  try {
    const { id } = req.params;
    const {
      user_id,
      tenant_id,
      subscription_type = 'basic',
      subscription_months = 12
    } = req.body;
    
    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
    }
    
    if (wearable.status !== 'available' && wearable.status !== 'returned') {
      return res.status(400).json({
        success: false,
        message: 'Wearable not available for assignment'
      });
    }
    
    const now = new Date();
    const subscription_end = new Date();
    subscription_end.setMonth(subscription_end.getMonth() + subscription_months);
    
    await wearable.update({
      user_id,
      tenant_id,
      assigned_date: now,
      subscription_type,
      subscription_start: now,
      subscription_end,
      is_active_subscription: true,
      status: 'assigned'
    });
    
    res.json({
      success: true,
      message: 'Wearable assigned successfully',
      wearable: {
        id: wearable.id,
        device_id: wearable.device_id,
        type: wearable.type,
        user_id: wearable.user_id,
        subscription_active_until: wearable.subscription_end
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Assignment failed',
      error: error.message
    });
  }
});

/**
 * GET /api/wearables
 * List all wearables (Admin)
 */
router.get('/', authUser, async (req, res) => {
  try {
    const { status, type, user_id, tenant_id } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (user_id) where.user_id = user_id;
    if (tenant_id) where.tenant_id = tenant_id;
    
    const wearables = await Wearable.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      count: wearables.length,
      wearables: wearables.map(w => ({
        id: w.id,
        device_id: w.device_id,
        device_name: w.device_name,
        type: w.type,
        model: w.model,
        status: w.status,
        user_id: w.user_id,
        battery_level: w.battery_level,
        last_sync: w.last_sync,
        subscription_active: w.isSubscriptionActive(),
        is_online: w.isOnline()
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wearables',
      error: error.message
    });
  }
});

/**
 * GET /api/wearables/user/:user_id
 * Get user's wearable devices — own data only (admins may view any user)
 */
router.get('/user/:user_id', authUser, async (req, res) => {
  const isAdmin = req.user?.isAdmin || ['admin', 'super_admin'].includes(req.userRole);
  if (!isAdmin && String(req.params.user_id) !== String(req.user.id)) {
    return res.status(403).json({ success: false, message: 'You can only view your own devices' });
  }
  try {
    const { user_id } = req.params;
    
    const wearables = await Wearable.findAll({
      where: { user_id },
      order: [['assigned_date', 'DESC']]
    });
    
    res.json({
      success: true,
      count: wearables.length,
      wearables: wearables.map(w => ({
        id: w.id,
        device_id: w.device_id,
        device_name: w.device_name,
        type: w.type,
        model: w.model,
        status: w.status,
        battery_level: w.battery_level,
        last_sync: w.last_sync,
        subscription_type: w.subscription_type,
        subscription_end: w.subscription_end,
        features: w.features,
        current_metrics: w.current_metrics,
        is_online: w.isOnline()
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user wearables',
      error: error.message
    });
  }
});

/**
 * GET /api/wearables/:id
 * Get wearable details
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const wearable = await Wearable.findByPk(req.params.id);
    
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
    }
    
    res.json({
      success: true,
      wearable: {
        ...wearable.toJSON(),
        subscription_active: wearable.isSubscriptionActive(),
        needs_charging: wearable.needsCharging(),
        is_online: wearable.isOnline(),
        days_until_warranty_expiry: wearable.getDaysUntilWarrantyExpiry()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wearable',
      error: error.message
    });
  }
});

/**
 * PUT /api/wearables/:id/sync
 * Sync wearable data — must be the device owner or admin
 */
router.put('/:id/sync', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      battery_level,
      is_charging,
      current_metrics,
      firmware_version
    } = req.body;

    // Validate battery_level range if provided
    if (battery_level !== undefined && (battery_level < 0 || battery_level > 100)) {
      return res.status(400).json({ success: false, message: 'battery_level must be 0–100' });
    }

    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
    }

    const isAdmin = req.user?.isAdmin || ['admin', 'super_admin'].includes(req.userRole);
    if (!isAdmin && wearable.user_id && String(wearable.user_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only sync your own device' });
    }
    
    await wearable.update({
      battery_level,
      is_charging,
      current_metrics: current_metrics || wearable.current_metrics,
      firmware_version: firmware_version || wearable.firmware_version,
      last_sync: new Date(),
      status: wearable.status === 'assigned' ? 'active' : wearable.status
    });
    
    await wearable.recordSync();
    
    res.json({
      success: true,
      message: 'Sync successful',
      sync_count: wearable.total_syncs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: error.message
    });
  }
});

const VALID_READING_TYPES = new Set(['heart_rate','blood_pressure','spo2','steps','sleep','calories','temperature','weight','glucose','ecg','activity']);
const VALID_ALERT_SEVERITIES = new Set(['info', 'warning', 'critical']);

/**
 * POST /api/wearables/:id/readings
 * Upload health readings from wearable — must be device owner or admin
 */
router.post('/:id/readings', authUser, auditHealthAccess('WEARABLE_READINGS_WRITE', { resourceType: 'HealthReading' }), async (req, res) => {
  try {
    const { id } = req.params;
    const { readings } = req.body;

    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ success: false, message: 'readings must be a non-empty array' });
    }
    if (readings.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 readings per batch' });
    }

    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({ success: false, message: 'Wearable not found' });
    }

    if (!wearable.user_id) {
      return res.status(400).json({ success: false, message: 'Wearable not assigned to any user' });
    }

    const isAdmin = req.user?.isAdmin || ['admin', 'super_admin'].includes(req.userRole);
    if (!isAdmin && String(wearable.user_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only upload readings for your own device' });
    }

    // Validate and sanitise each reading
    const healthReadings = readings.map((reading, i) => {
      if (reading.alert_severity && !VALID_ALERT_SEVERITIES.has(reading.alert_severity)) {
        throw new Error(`readings[${i}].alert_severity must be info|warning|critical`);
      }
      return {
        wearable_id: wearable.id,
        user_id: wearable.user_id,
        reading_type: reading.type,
        value: reading.value,
        unit: reading.unit,
        recorded_at: reading.timestamp || new Date(),
        activity: reading.activity,
        location: reading.location,
        is_normal: reading.is_normal !== undefined ? Boolean(reading.is_normal) : null,
        alert_triggered: Boolean(reading.alert_triggered),
        alert_severity: reading.alert_severity || null,
      };
    });

    await HealthReading.bulkCreate(healthReadings);
    
    // Update current metrics on wearable
    const latestMetrics = {};
    readings.forEach(r => {
      latestMetrics[r.type] = {
        value: r.value,
        timestamp: r.timestamp || new Date()
      };
    });
    
    await wearable.update({
      current_metrics: { ...wearable.current_metrics, ...latestMetrics }
    });
    
    res.json({
      success: true,
      message: `${readings.length} readings uploaded successfully`,
      readings_count: readings.length
    });
  } catch (error) {
    console.error('Reading upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload readings',
      error: error.message
    });
  }
});

/**
 * GET /api/wearables/:id/readings
 * Get health readings for wearable
 */
router.get('/:id/readings', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, start_date, end_date, limit = 100 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500); // cap 1–500

    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({ success: false, message: 'Wearable not found' });
    }

    // Ownership: users may only read their own device data
    const isAdmin = req.user?.isAdmin || ['admin', 'super_admin'].includes(req.userRole);
    if (!isAdmin && wearable.user_id && String(wearable.user_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only read your own device data' });
    }

    const where = { wearable_id: id };
    if (type) where.reading_type = type;
    if (start_date && end_date) {
      where.recorded_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
    }

    const readings = await HealthReading.findAll({
      where,
      order: [['recorded_at', 'DESC']],
      limit: safeLimit,
    });
    
    res.json({
      success: true,
      count: readings.length,
      readings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch readings',
      error: error.message
    });
  }
});

/**
 * GET /api/wearables/user/:user_id/health-summary
 * Get user's health summary — own data only (admins may view any user)
 */
router.get('/user/:user_id/health-summary', authUser, async (req, res) => {
  const isAdmin = req.user?.isAdmin || ['admin', 'super_admin'].includes(req.userRole);
  if (!isAdmin && String(req.params.user_id) !== String(req.user.id)) {
    return res.status(403).json({ success: false, message: 'You can only view your own health summary' });
  }
  try {
    const { user_id } = req.params;
    const { days = 7 } = req.query;
    const safeDays = Math.min(Math.max(parseInt(days) || 7, 1), 365);
    
    const since = new Date();
    since.setDate(since.getDate() - safeDays);
    
    // Get latest readings for each type
    const readingTypes = ['heart_rate', 'blood_pressure', 'spo2', 'steps', 'sleep', 'calories'];
    const summary = {};
    
    for (const type of readingTypes) {
      const latest = await HealthReading.getLatestReading(user_id, type);
      const readings = await HealthReading.getReadingsInRange(user_id, type, since, new Date());
      
      summary[type] = {
        latest: latest ? latest.value : null,
        latest_timestamp: latest ? latest.recorded_at : null,
        count_last_7_days: readings.length,
        average: readings.length > 0 ? calculateAverage(readings) : null
      };
    }
    
    // Get abnormal readings
    const abnormal = await HealthReading.getAbnormalReadings(user_id, parseInt(days));
    
    res.json({
      success: true,
      user_id,
      period_days: parseInt(days),
      summary,
      abnormal_readings_count: abnormal.length,
      abnormal_readings: abnormal.slice(0, 10) // Last 10 abnormal readings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate health summary',
      error: error.message
    });
  }
});

/**
 * PUT /api/wearables/:id/settings
 * Update wearable settings
 */
router.put('/:id/settings', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { settings } = req.body;
    
    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
    }
    
    await wearable.update({
      settings: { ...wearable.settings, ...settings }
    });
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: wearable.settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

// Helper function
function calculateAverage(readings) {
  if (readings.length === 0) return null;
  
  // Handle different value types
  const values = readings.map(r => {
    if (typeof r.value === 'number') return r.value;
    if (r.value && typeof r.value === 'object' && r.value.value) return r.value.value;
    return null;
  }).filter(v => v !== null);
  
  if (values.length === 0) return null;
  
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export default router;
