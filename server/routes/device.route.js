/**
 * Device Management Routes
 * Manage smart tablets provided to healthcare providers
 */

import express from 'express';
import Device from '../models/postgres/device.model.postgres.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { authUser } from '../middleware/auth.middleware.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/devices/register
 * Register new device (Admin only)
 */
router.post('/register', authUser, async (req, res) => {
  try {
    const {
      device_id,
      device_name,
      sim_number,
      phone_number,
      imei,
      model,
      subscription_plan = 'basic',
      device_cost,
      monthly_software_fee,
      amc_annual_fee
    } = req.body;
    
    // Check if device already exists
    const existing = await Device.findOne({
      where: { device_id }
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Device already registered'
      });
    }
    
    // Create device
    const device = await Device.create({
      device_id,
      device_name,
      sim_number,
      phone_number,
      imei,
      model,
      subscription_plan,
      device_cost,
      monthly_software_fee,
      amc_annual_fee,
      status: 'inactive',
      amc_active: false
    });
    
    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      device: {
        id: device.id,
        device_id: device.device_id,
        device_name: device.device_name,
        phone_number: device.phone_number,
        status: device.status
      }
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
 * POST /api/devices/:id/assign
 * Assign device to tenant/entity
 */
router.post('/:id/assign', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tenant_id,
      assigned_to_type,
      assigned_to_id,
      deployment_site,
      subscription_plan = 'basic',
      subscription_months = 12
    } = req.body;
    
    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }
    
    const now = new Date();
    const subscription_end = new Date();
    subscription_end.setMonth(subscription_end.getMonth() + subscription_months);
    
    const amc_end = new Date();
    amc_end.setFullYear(amc_end.getFullYear() + 1);
    
    await device.update({
      tenant_id,
      assigned_to_type,
      assigned_to_id,
      deployment_site,
      assigned_date: now,
      subscription_plan,
      subscription_start: now,
      subscription_end,
      amc_active: true,
      amc_start_date: now,
      amc_end_date: amc_end,
      amc_renewal_date: amc_end,
      status: 'active'
    });
    
    res.json({
      success: true,
      message: 'Device assigned successfully',
      device: {
        id: device.id,
        device_id: device.device_id,
        assigned_to: {
          type: device.assigned_to_type,
          id: device.assigned_to_id,
          tenant_id: device.tenant_id
        },
        subscription_active_until: device.subscription_end,
        amc_active_until: device.amc_end_date
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
 * GET /api/devices
 * List all devices (Admin)
 */
router.get('/', authUser, async (req, res) => {
  try {
    const { status, tenant_id, assigned_to_type, subscription_plan } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (tenant_id) where.tenant_id = tenant_id;
    if (assigned_to_type) where.assigned_to_type = assigned_to_type;
    if (subscription_plan) where.subscription_plan = subscription_plan;
    
    const devices = await Device.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      count: devices.length,
      devices: devices.map(d => ({
        id: d.id,
        device_id: d.device_id,
        device_name: d.device_name,
        phone_number: d.phone_number,
        status: d.status,
        assigned_to: {
          type: d.assigned_to_type,
          id: d.assigned_to_id,
          tenant_id: d.tenant_id
        },
        subscription_plan: d.subscription_plan,
        subscription_active: d.isSubscriptionActive(),
        amc_active: d.isAMCActive(),
        last_online: d.last_online,
        battery_level: d.battery_level
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch devices',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/tenant/:tenant_id
 * Get devices for specific tenant
 */
router.get('/tenant/:tenant_id', requireTenant, authUser, async (req, res) => {
  try {
    const { tenant_id } = req.params;
    
    const devices = await Device.findAll({
      where: { tenant_id },
      order: [['assigned_date', 'DESC']]
    });
    
    res.json({
      success: true,
      count: devices.length,
      devices: devices.map(d => ({
        id: d.id,
        device_id: d.device_id,
        device_name: d.device_name,
        phone_number: d.phone_number,
        status: d.status,
        deployment_site: d.deployment_site,
        subscription_plan: d.subscription_plan,
        subscription_end: d.subscription_end,
        amc_end_date: d.amc_end_date,
        last_online: d.last_online,
        features: d.features
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch devices',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/:id
 * Get device details
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const device = await Device.findByPk(req.params.id);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }
    
    res.json({
      success: true,
      device: {
        id: device.id,
        device_id: device.device_id,
        device_name: device.device_name,
        model: device.model,
        phone_number: device.phone_number,
        sim_number: device.sim_number,
        imei: device.imei,
        status: device.status,
        assigned_to: {
          type: device.assigned_to_type,
          id: device.assigned_to_id,
          tenant_id: device.tenant_id,
          deployment_site: device.deployment_site
        },
        subscription: {
          plan: device.subscription_plan,
          start: device.subscription_start,
          end: device.subscription_end,
          active: device.isSubscriptionActive()
        },
        amc: {
          active: device.amc_active,
          start: device.amc_start_date,
          end: device.amc_end_date,
          days_until_expiry: device.daysUntilAMCExpiry()
        },
        pricing: {
          device_cost: device.device_cost,
          monthly_software: device.monthly_software_fee,
          amc_annual: device.amc_annual_fee,
          monthly_revenue: device.calculateMonthlyRevenue()
        },
        health: {
          last_online: device.last_online,
          battery_level: device.battery_level,
          os_version: device.os_version,
          app_version: device.app_version
        },
        usage: {
          total_calls: device.total_calls_made,
          total_appointments: device.total_appointments,
          total_prescriptions: device.total_prescriptions
        },
        features: device.features,
        maintenance: {
          last: device.last_maintenance,
          next: device.next_maintenance,
          needs_maintenance: device.needsMaintenance(),
          warranty_expiry: device.warranty_expiry
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device',
      error: error.message
    });
  }
});

/**
 * PUT /api/devices/:id/heartbeat
 * Device heartbeat (update last_online, battery)
 */
router.put('/:id/heartbeat', async (req, res) => {
  try {
    const { id } = req.params;
    const { battery_level, location, app_version, os_version } = req.body;
    
    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }
    
    await device.update({
      last_online: new Date(),
      battery_level,
      location,
      app_version,
      os_version
    });
    
    res.json({
      success: true,
      message: 'Heartbeat recorded'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Heartbeat failed',
      error: error.message
    });
  }
});

/**
 * POST /api/devices/:id/renew-amc
 * Renew AMC for device
 */
router.post('/:id/renew-amc', authUser, async (req, res) => {
  try {
    const device = await Device.findByPk(req.params.id);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }
    
    const now = new Date();
    const newAmcEnd = new Date();
    newAmcEnd.setFullYear(newAmcEnd.getFullYear() + 1);
    
    await device.update({
      amc_active: true,
      amc_start_date: now,
      amc_end_date: newAmcEnd,
      amc_renewal_date: newAmcEnd
    });
    
    res.json({
      success: true,
      message: 'AMC renewed successfully',
      amc_valid_until: newAmcEnd
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'AMC renewal failed',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/stats/revenue
 * Calculate total revenue from devices
 */
router.get('/stats/revenue', authUser, async (req, res) => {
  try {
    const devices = await Device.findAll({
      where: { status: 'active' }
    });
    
    let totalMonthlyRevenue = 0;
    let totalAnnualRevenue = 0;
    let activeAMCs = 0;
    
    devices.forEach(device => {
      totalMonthlyRevenue += device.calculateMonthlyRevenue();
      totalAnnualRevenue += (device.monthly_software_fee * 12);
      if (device.isAMCActive()) {
        activeAMCs++;
        totalAnnualRevenue += device.amc_annual_fee;
      }
    });
    
    res.json({
      success: true,
      stats: {
        total_devices: devices.length,
        active_amcs: activeAMCs,
        monthly_recurring_revenue: totalMonthlyRevenue,
        annual_recurring_revenue: totalAnnualRevenue,
        average_revenue_per_device: devices.length > 0 ? totalMonthlyRevenue / devices.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to calculate revenue',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/monitoring/offline
 * Get offline devices (Admin)
 */
router.get('/monitoring/offline', authUser, async (req, res) => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const offlineDevices = await Device.findAll({
      where: {
        status: 'active',
        last_online: {
          [Op.lt]: thirtyMinutesAgo
        }
      }
    });
    
    res.json({
      success: true,
      count: offlineDevices.length,
      devices: offlineDevices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offline devices',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/monitoring/low-battery
 * Get low battery devices (Admin)
 */
router.get('/monitoring/low-battery', authUser, async (req, res) => {
  try {
    const lowBatteryDevices = await Device.findAll({
      where: {
        status: 'active',
        battery_level: {
          [Op.lt]: 20,
          [Op.ne]: null
        }
      }
    });
    
    res.json({
      success: true,
      count: lowBatteryDevices.length,
      devices: lowBatteryDevices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low battery devices',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/monitoring/expiring-amcs
 * Get AMCs expiring within 30 days (Admin)
 */
router.get('/monitoring/expiring-amcs', authUser, async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringAMCs = await Device.findAll({
      where: {
        amc_active: true,
        amc_end_date: {
          [Op.lte]: thirtyDaysFromNow,
          [Op.gte]: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      count: expiringAMCs.length,
      devices: expiringAMCs.map(d => ({
        ...d.toJSON(),
        days_until_expiry: d.daysUntilAMCExpiry()
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expiring AMCs',
      error: error.message
    });
  }
});

/**
 * GET /api/devices/monitoring/health-report
 * Get device health report (Admin)
 */
router.get('/monitoring/health-report', authUser, async (req, res) => {
  try {
    const totalDevices = await Device.count();
    const activeDevices = await Device.count({ where: { status: 'active' } });
    const maintenanceDevices = await Device.count({ where: { status: 'maintenance' } });
    const faultyDevices = await Device.count({ where: { status: 'faulty' } });

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const onlineDevices = await Device.count({
      where: {
        status: 'active',
        last_online: {
          [Op.gte]: thirtyMinutesAgo
        }
      }
    });

    const lowBatteryDevices = await Device.count({
      where: {
        battery_level: {
          [Op.lt]: 20,
          [Op.ne]: null
        }
      }
    });

    const activeAMCs = await Device.count({
      where: {
        amc_active: true,
        amc_end_date: {
          [Op.gte]: new Date()
        }
      }
    });

    res.json({
      success: true,
      report: {
        total_devices: totalDevices,
        active_devices: activeDevices,
        online_devices: onlineDevices,
        maintenance_devices: maintenanceDevices,
        faulty_devices: faultyDevices,
        low_battery_devices: lowBatteryDevices,
        active_amcs: activeAMCs,
        health_percentage: totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate health report',
      error: error.message
    });
  }
});

export default router;
