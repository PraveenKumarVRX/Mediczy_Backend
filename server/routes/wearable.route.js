/**
 * Wearable Device Routes
 * Manage health monitoring wearables (smartwatch, band, ring)
 */

import express from 'express';
import Wearable from '../models/postgres/wearable.model.postgres.js';
import HealthReading from '../models/postgres/health-reading.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/wearables/provision
 * Provision new wearable device (Admin)
 */
router.post('/provision', authUser, async (req, res) => {
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
 * Assign wearable to user
 */
router.post('/:id/assign', authUser, async (req, res) => {
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
 * Get user's wearable devices
 */
router.get('/user/:user_id', authUser, async (req, res) => {
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
 * Sync wearable data (called by device/app)
 */
router.put('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      battery_level,
      is_charging,
      current_metrics,
      firmware_version
    } = req.body;
    
    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
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

/**
 * POST /api/wearables/:id/readings
 * Upload health readings from wearable
 */
router.post('/:id/readings', async (req, res) => {
  try {
    const { id } = req.params;
    const { readings } = req.body; // Array of readings
    
    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
    }
    
    if (!wearable.user_id) {
      return res.status(400).json({
        success: false,
        message: 'Wearable not assigned to any user'
      });
    }
    
    // Bulk insert readings
    const healthReadings = readings.map(reading => ({
      wearable_id: wearable.id,
      user_id: wearable.user_id,
      reading_type: reading.type,
      value: reading.value,
      unit: reading.unit,
      recorded_at: reading.timestamp || new Date(),
      activity: reading.activity,
      location: reading.location,
      is_normal: reading.is_normal,
      alert_triggered: reading.alert_triggered || false,
      alert_severity: reading.alert_severity
    }));
    
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
    
    const wearable = await Wearable.findByPk(id);
    if (!wearable) {
      return res.status(404).json({
        success: false,
        message: 'Wearable not found'
      });
    }
    
    const where = { wearable_id: id };
    if (type) where.reading_type = type;
    if (start_date && end_date) {
      where.recorded_at = {
        [Op.between]: [new Date(start_date), new Date(end_date)]
      };
    }
    
    const readings = await HealthReading.findAll({
      where,
      order: [['recorded_at', 'DESC']],
      limit: parseInt(limit)
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
 * Get user's health summary from all wearables
 */
router.get('/user/:user_id/health-summary', authUser, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { days = 7 } = req.query;
    
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    
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
