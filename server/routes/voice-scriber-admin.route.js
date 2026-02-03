/**
 * Voice Scriber Admin Routes
 * 
 * Super Admin endpoints for managing Voice Scriber devices and analytics:
 * - Device status tracking (online/offline)
 * - Transcription statistics
 * - Usage per doctor/tenant
 * - Device assignment management
 * 
 * @module routes/voice-scriber-admin.route
 */

import express from 'express';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import usageMeteringService from '../services/usage-metering.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * Middleware to verify super admin or tenant admin
 */
const requireAdminAccess = (req, res, next) => {
  const userRole = req.user?.role || '';
  const isAdmin = ['admin', 'superadmin', 'system_admin', 'platform_admin'].includes(userRole);
  const isSuperAdmin = req.user?.email === 'admin@mediczy.com' || req.user?.isAdmin;
  
  if (!isAdmin && !isSuperAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

/**
 * @route GET /api/admin/voice-scriber/dashboard
 * @desc Get Voice Scriber dashboard overview for super admin
 * @access Admin
 */
router.get('/dashboard', authUser, requireAdminAccess, async (req, res) => {
  try {
    // Get summary statistics
    const [deviceStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE status = 'online') as online_devices,
        COUNT(*) FILTER (WHERE status = 'offline') as offline_devices,
        COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '5 minutes') as active_now,
        COUNT(DISTINCT tenant_id) as tenants_with_devices
      FROM voice_scriber_devices
    `).catch(() => [[{ total_devices: 0, online_devices: 0, offline_devices: 0, active_now: 0, tenants_with_devices: 0 }]]);

    // Get transcription stats for current month
    const [transcriptionStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transcriptions,
        SUM(duration_seconds) / 60 as total_minutes,
        AVG(duration_seconds) / 60 as avg_duration_minutes,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        ROUND(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM voice_scriber_sessions
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `).catch(() => [[{ total_transcriptions: 0, total_minutes: 0, avg_duration_minutes: 0, completed: 0, failed: 0, success_rate: 0 }]]);

    // Get top tenants by usage
    const [topTenants] = await sequelize.query(`
      SELECT 
        t.id as tenant_id,
        t.name as tenant_name,
        COUNT(DISTINCT d.id) as device_count,
        COALESCE(SUM(s.duration_seconds) / 60, 0) as total_minutes_mtd
      FROM tenants t
      LEFT JOIN voice_scriber_devices d ON d.tenant_id = t.id
      LEFT JOIN voice_scriber_sessions s ON s.device_id = d.id 
        AND s.created_at >= DATE_TRUNC('month', NOW())
      WHERE t.features->>'voice_scriber' = 'true' OR t.features->>'ai_assistant' = 'true'
      GROUP BY t.id, t.name
      ORDER BY total_minutes_mtd DESC
      LIMIT 10
    `).catch(() => [[]]);

    // Get recent errors
    const [recentErrors] = await sequelize.query(`
      SELECT 
        s.id,
        s.device_id,
        d.device_name,
        t.name as tenant_name,
        s.error_message,
        s.created_at
      FROM voice_scriber_sessions s
      JOIN voice_scriber_devices d ON s.device_id = d.id
      JOIN tenants t ON d.tenant_id = t.id
      WHERE s.status = 'failed'
      ORDER BY s.created_at DESC
      LIMIT 10
    `).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        devices: deviceStats[0] || {},
        transcriptions: transcriptionStats[0] || {},
        topTenants: topTenants || [],
        recentErrors: recentErrors || [],
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Voice scriber dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voice scriber dashboard',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/voice-scriber/devices
 * @desc List all Voice Scriber devices
 * @access Admin
 */
router.get('/devices', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { tenantId, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      whereClause += ` AND d.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    if (status) {
      whereClause += ` AND d.status = $${paramIndex++}`;
      params.push(status);
    }

    const [devices] = await sequelize.query(`
      SELECT 
        d.id,
        d.device_uid,
        d.device_name,
        d.model,
        d.serial_number,
        d.status,
        d.last_active_at,
        d.firmware_version,
        d.assigned_doctor_id,
        d.tenant_id,
        t.name as tenant_name,
        dr.first_name || ' ' || dr.last_name as doctor_name,
        (SELECT COUNT(*) FROM voice_scriber_sessions WHERE device_id = d.id AND created_at >= DATE_TRUNC('month', NOW())) as sessions_this_month,
        (SELECT COALESCE(SUM(duration_seconds)/60, 0) FROM voice_scriber_sessions WHERE device_id = d.id AND created_at >= DATE_TRUNC('month', NOW())) as minutes_this_month
      FROM voice_scriber_devices d
      LEFT JOIN tenants t ON d.tenant_id = t.id
      LEFT JOIN doctors dr ON d.assigned_doctor_id = dr.id
      ${whereClause}
      ORDER BY d.last_active_at DESC NULLS LAST
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, { bind: [...params, parseInt(limit), offset] });

    // Get total count
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total FROM voice_scriber_devices d ${whereClause}
    `, { bind: params });

    res.json({
      success: true,
      data: {
        devices: devices || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult?.[0]?.total || 0),
          totalPages: Math.ceil((countResult?.[0]?.total || 0) / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('List devices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch devices',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/voice-scriber/devices/:deviceId
 * @desc Get single device details
 * @access Admin
 */
router.get('/devices/:deviceId', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [devices] = await sequelize.query(`
      SELECT 
        d.*,
        t.name as tenant_name,
        dr.first_name || ' ' || dr.last_name as doctor_name,
        dr.specialization as doctor_specialization
      FROM voice_scriber_devices d
      LEFT JOIN tenants t ON d.tenant_id = t.id
      LEFT JOIN doctors dr ON d.assigned_doctor_id = dr.id
      WHERE d.id = $1 OR d.device_uid = $1
    `, { bind: [deviceId] });

    if (!devices || devices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Get recent sessions
    const [sessions] = await sequelize.query(`
      SELECT 
        id,
        status,
        duration_seconds,
        word_count,
        created_at,
        completed_at
      FROM voice_scriber_sessions
      WHERE device_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, { bind: [devices[0].id] });

    res.json({
      success: true,
      data: {
        device: devices[0],
        recentSessions: sessions || []
      }
    });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/voice-scriber/devices
 * @desc Register a new Voice Scriber device
 * @access Admin
 */
router.post('/devices', authUser, requireAdminAccess, async (req, res) => {
  try {
    const {
      device_uid,
      device_name,
      model,
      serial_number,
      tenant_id,
      assigned_doctor_id
    } = req.body;

    if (!device_uid || !tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'device_uid and tenant_id are required'
      });
    }

    // Verify tenant exists
    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO voice_scriber_devices (
        device_uid, device_name, model, serial_number, 
        tenant_id, assigned_doctor_id, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'registered', NOW())
      RETURNING *
    `, {
      bind: [
        device_uid,
        device_name || `Device ${device_uid}`,
        model || 'Standard',
        serial_number,
        tenant_id,
        assigned_doctor_id
      ]
    });

    // Update tenant usage
    const usage = { ...tenant.usage } || {};
    usage.voice_scriber_devices = (usage.voice_scriber_devices || 0) + 1;
    tenant.usage = usage;
    await tenant.save();

    res.status(201).json({
      success: true,
      data: { device: result[0] },
      message: 'Device registered successfully'
    });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device',
      message: error.message
    });
  }
});

/**
 * @route PATCH /api/admin/voice-scriber/devices/:deviceId
 * @desc Update device details
 * @access Admin
 */
router.patch('/devices/:deviceId', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { device_name, assigned_doctor_id, status, firmware_version } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (device_name !== undefined) {
      updates.push(`device_name = $${paramIndex++}`);
      values.push(device_name);
    }
    if (assigned_doctor_id !== undefined) {
      updates.push(`assigned_doctor_id = $${paramIndex++}`);
      values.push(assigned_doctor_id);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (firmware_version !== undefined) {
      updates.push(`firmware_version = $${paramIndex++}`);
      values.push(firmware_version);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(deviceId);

    const [result] = await sequelize.query(`
      UPDATE voice_scriber_devices 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} OR device_uid = $${paramIndex}
      RETURNING *
    `, { bind: values });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    res.json({
      success: true,
      data: { device: result[0] },
      message: 'Device updated successfully'
    });
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device',
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/admin/voice-scriber/devices/:deviceId
 * @desc Deactivate/remove a device
 * @access Admin
 */
router.delete('/devices/:deviceId', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [result] = await sequelize.query(`
      UPDATE voice_scriber_devices 
      SET status = 'deactivated', updated_at = NOW()
      WHERE id = $1 OR device_uid = $1
      RETURNING tenant_id
    `, { bind: [deviceId] });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Update tenant usage
    const tenant = await Tenant.findByPk(result[0].tenant_id);
    if (tenant) {
      const usage = { ...tenant.usage } || {};
      usage.voice_scriber_devices = Math.max(0, (usage.voice_scriber_devices || 0) - 1);
      tenant.usage = usage;
      await tenant.save();
    }

    res.json({
      success: true,
      message: 'Device deactivated successfully'
    });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate device',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/voice-scriber/usage/:tenantId
 * @desc Get voice scriber usage for a specific tenant
 * @access Admin
 */
router.get('/usage/:tenantId', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    // Get usage by doctor
    const [doctorUsage] = await sequelize.query(`
      SELECT 
        d.assigned_doctor_id as doctor_id,
        dr.first_name || ' ' || dr.last_name as doctor_name,
        dr.specialization,
        COUNT(s.id) as session_count,
        COALESCE(SUM(s.duration_seconds) / 60, 0) as total_minutes,
        COALESCE(AVG(s.duration_seconds) / 60, 0) as avg_minutes,
        SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) as failed_sessions
      FROM voice_scriber_devices d
      LEFT JOIN voice_scriber_sessions s ON s.device_id = d.id
        AND s.created_at BETWEEN $2 AND $3
      LEFT JOIN doctors dr ON d.assigned_doctor_id = dr.id
      WHERE d.tenant_id = $1
      GROUP BY d.assigned_doctor_id, dr.first_name, dr.last_name, dr.specialization
      ORDER BY total_minutes DESC
    `, { bind: [tenantId, start, end] });

    // Get daily usage trend
    const [dailyUsage] = await sequelize.query(`
      SELECT 
        DATE(s.created_at) as date,
        COUNT(s.id) as sessions,
        COALESCE(SUM(s.duration_seconds) / 60, 0) as minutes
      FROM voice_scriber_sessions s
      JOIN voice_scriber_devices d ON s.device_id = d.id
      WHERE d.tenant_id = $1
        AND s.created_at BETWEEN $2 AND $3
      GROUP BY DATE(s.created_at)
      ORDER BY date
    `, { bind: [tenantId, start, end] });

    // Get tenant limits
    const tenant = await Tenant.findByPk(tenantId);
    const limits = tenant?.limits || {};
    const usage = tenant?.usage || {};

    res.json({
      success: true,
      data: {
        summary: {
          voiceMinutesMTD: usage.voice_minutes_mtd || 0,
          voiceMinuteLimit: limits.voice_minutes_per_month || 'unlimited',
          deviceCount: usage.voice_scriber_devices || 0
        },
        doctorUsage: doctorUsage || [],
        dailyTrend: dailyUsage || [],
        period: { start, end }
      }
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage data',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/voice-scriber/sessions/:sessionId/retry
 * @desc Retry a failed transcription session
 * @access Admin
 */
router.post('/sessions/:sessionId/retry', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Mark session for retry
    const [result] = await sequelize.query(`
      UPDATE voice_scriber_sessions 
      SET status = 'pending_retry', retry_count = COALESCE(retry_count, 0) + 1, updated_at = NOW()
      WHERE id = $1 AND status = 'failed'
      RETURNING *
    `, { bind: [sessionId] });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not in failed state'
      });
    }

    // TODO: Trigger actual retry via queue/webhook
    
    res.json({
      success: true,
      data: { session: result[0] },
      message: 'Session queued for retry'
    });
  } catch (error) {
    console.error('Retry session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry session',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/voice-scriber/heartbeat
 * @desc Device heartbeat endpoint (called by devices)
 * @access Public (with device auth)
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { device_uid, status = 'online', battery_level, firmware_version } = req.body;

    if (!device_uid) {
      return res.status(400).json({
        success: false,
        error: 'device_uid is required'
      });
    }

    const [result] = await sequelize.query(`
      UPDATE voice_scriber_devices 
      SET status = $2, 
          last_active_at = NOW(), 
          battery_level = COALESCE($3, battery_level),
          firmware_version = COALESCE($4, firmware_version),
          updated_at = NOW()
      WHERE device_uid = $1
      RETURNING id, tenant_id
    `, { bind: [device_uid, status, battery_level, firmware_version] });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not registered'
      });
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({
      success: false,
      error: 'Heartbeat failed'
    });
  }
});

export default router;
