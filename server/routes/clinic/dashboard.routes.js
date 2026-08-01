import express from 'express';
import jwt from 'jsonwebtoken';
import { Op, QueryTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { Notification, Report, Prescription } from '../../models/index.js';
// import Clinic from '../../models/postgres/clinic.model.postgres.js'; // Lazy import
// import { postgresSequelize } from '../../db/postgres-sequelize.js'; // Lazy import

import {
  resolveClinicPortalContext,
  getClinicPortalStats,
  listClinicPortalPatients,
  createClinicPortalPatient,
  listClinicPortalAppointments,
  createClinicPortalAppointment,
  listClinicPortalStaff,
  createClinicPortalStaff,
} from '../../services/clinic-portal.service.js';
import User from '../../models/postgres/user.model.postgres.js';
import Tenant from '../../models/postgres/tenant.model.postgres.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

// Lazy import function for models
const getModels = async () => {
  const { default: Clinic } = await import('../../models/postgres/clinic.model.postgres.js');
  const { postgresSequelize } = await import('../../db/postgres-sequelize.js');
  return { Clinic, postgresSequelize };
};

// Middleware to verify clinic token and resolve tenant context
const verifyClinicToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'clinic') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const ctx = await resolveClinicPortalContext(decoded);
    req.clinic = {
      id: ctx.hospitalId || decoded.id,
      name: decoded.name,
      tenantId: ctx.tenantId,
      slug: ctx.slug,
    };
    req.clinicId = ctx.hospitalId || decoded.id;
    req.tenantId = ctx.tenantId;
    req.clinicPortal = ctx;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

const requireTenant = (req, res) => {
  if (!req.tenantId) {
    res.status(403).json({
      success: false,
      message: 'Clinic tenant not linked. Ask admin to run ensure-login for this clinic.',
    });
    return false;
  }
  return true;
};

// Get Dashboard Stats (with authentication)
router.get('/stats', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const stats = await getClinicPortalStats(req.tenantId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
});

// Get Clinic Notifications
router.get('/notifications', verifyClinicToken, async (req, res) => {
  try {
    const { filter, page = 1, limit = 10 } = req.query;
    const clinicId = Number(req.clinicId);
    if (!Number.isFinite(clinicId)) {
      return res.json({
        success: true,
        data: {
          stats: { unread: 0, high: 0, reminders: 0, escalated: 0 },
          items: [],
          pagination: { page: 1, limit: 0, total: 0, hasMore: false }
        }
      });
    }

    const baseWhere = { userId: clinicId, userType: 'clinic' };
    const stats = {
      unread: await Notification.count({ where: { ...baseWhere, isRead: false } }),
      high: await Notification.count({
        where: { ...baseWhere, priority: { [Op.in]: ['high', 'urgent'] } }
      }),
      reminders: await Notification.count({
        where: { ...baseWhere, type: { [Op.in]: ['reminder', 'medicine_reminder'] } }
      }),
      escalated: await Notification.count({
        where: { ...baseWhere, priority: 'urgent' }
      })
    };

    const where = { ...baseWhere };
    if (filter === 'unread') {
      where.isRead = false;
    } else if (filter === 'high') {
      where.priority = { [Op.in]: ['high', 'urgent'] };
    } else if (filter === 'reminders') {
      where.type = { [Op.in]: ['reminder', 'medicine_reminder'] };
    } else if (filter === 'escalated') {
      where.priority = 'urgent';
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
    const offset = (safePage - 1) * safeLimit;

    const { rows: notifications, count: total } = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: safeLimit,
      offset
    });

    const items = notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      priority: notification.priority,
      read: notification.isRead,
      createdAt: notification.createdAt,
      status: notification.priority === 'urgent' ? 'Escalated' : notification.isRead ? 'Read' : 'Unread'
    }));

    res.json({
      success: true,
      data: {
        stats,
        items,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          hasMore: offset + notifications.length < total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

router.post('/notifications/:id/read', verifyClinicToken, async (req, res) => {
  try {
    const clinicId = Number(req.clinicId);
    const notificationId = Number(req.params.id);
    if (!Number.isFinite(clinicId) || !Number.isFinite(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid notification ID required'
      });
    }

    const notification = await Notification.findOne({
      where: { id: notificationId, userId: clinicId, userType: 'clinic' }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.update({ isRead: true, readAt: new Date() });

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
});

router.post('/notifications/read-all', verifyClinicToken, async (req, res) => {
  try {
    const clinicId = Number(req.clinicId);
    if (!Number.isFinite(clinicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clinic ID'
      });
    }

    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId: clinicId, userType: 'clinic', isRead: false } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: error.message
    });
  }
});

// Get Clinic Reports Overview
router.get('/reports', verifyClinicToken, async (req, res) => {
  try {
    const { filter } = req.query;
    const clinicId = Number(req.clinicId);
    if (!Number.isFinite(clinicId)) {
      return res.json({
        success: true,
        data: {
          stats: { dashboards: 0, exports: 0, alerts: 0, shared: 0 },
          items: []
        }
      });
    }

    const baseWhere = { organization_id: clinicId };
    const dashboardsWhere = { ...baseWhere, status: 'active' };
    const exportsWhere = { ...baseWhere, status: 'archived' };
    const alertsWhere = {
      ...baseWhere,
      status: { [Op.ne]: 'deleted' },
      [Op.or]: [
        { analysisStatus: 'failed' },
        { status: 'pending_review' }
      ]
    };
    const sharedWhere = {
      ...baseWhere,
      status: { [Op.ne]: 'deleted' },
      [Op.or]: [
        { isPublic: true },
        { sharedWith: { [Op.ne]: null } }
      ]
    };

    const stats = {
      dashboards: await Report.count({ where: dashboardsWhere }),
      exports: await Report.count({ where: exportsWhere }),
      alerts: await Report.count({ where: alertsWhere }),
      shared: await Report.count({ where: sharedWhere })
    };

    let where = dashboardsWhere;
    if (filter === 'exports') {
      where = exportsWhere;
    } else if (filter === 'alerts') {
      where = alertsWhere;
    } else if (filter === 'shared') {
      where = sharedWhere;
    }

    const reports = await Report.findAll({
      where,
      order: [['uploadedAt', 'DESC']],
      limit: 25
    });

    const items = reports.map((report) => ({
      id: report.id,
      label: report.fileName,
      meta: report.reportType,
      status: report.analysisStatus || report.status,
      reportType: report.reportType,
      uploadedAt: report.uploadedAt,
      fileUrl: report.fileUrl
    }));

    res.json({
      success: true,
      data: {
        stats,
        items
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message
    });
  }
});

// Audit report ownership for a clinic
router.get('/reports/audit', verifyClinicToken, async (req, res) => {
  try {
    const clinicId = Number(req.clinicId);
    if (!Number.isFinite(clinicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clinic ID'
      });
    }

    const idsParam = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = idsParam
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));

    if (ids.length === 0) {
      const totalClinicReports = await Report.count({
        where: { organization_id: clinicId }
      });
      return res.json({
        success: true,
        data: {
          clinicId,
          totalClinicReports,
          audited: false
        }
      });
    }

    const reports = await Report.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'organization_id']
    });

    const ownedIds = [];
    const missingOrgIds = [];
    const otherOrgIds = [];
    const foundIds = new Set();

    for (const report of reports) {
      const reportId = report.id;
      foundIds.add(reportId);
      if (report.organization_id === clinicId) {
        ownedIds.push(reportId);
      } else if (!report.organization_id) {
        missingOrgIds.push(reportId);
      } else {
        otherOrgIds.push(reportId);
      }
    }

    const notFoundIds = ids.filter((id) => !foundIds.has(id));

    return res.json({
      success: true,
      data: {
        clinicId,
        requestedIds: ids,
        ownedIds,
        missingOrgIds,
        otherOrgIds,
        notFoundIds
      }
    });
  } catch (error) {
    console.error('Error auditing clinic reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to audit report ownership',
      error: error.message
    });
  }
});

// Temporary: Health check endpoint (for debugging)
router.get('/health', (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Dashboard routes healthy'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error',
      error: error.message
    });
  }
});

// Get Appointments
router.get('/appointments', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const appointments = await listClinicPortalAppointments(req.tenantId, { limit: req.query.limit });
    res.json({ success: true, data: appointments, total: appointments.length });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Create Appointment
router.post('/appointments', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const { patientName, date, time, type, phone, patientPhone, patientEmail, doctorName } = req.body;
    if (!patientName || !(date || time)) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and date/time are required'
      });
    }
    const notifyOptIn = req.body?.notifyOptIn === true || req.body?.notifyOptIn === 'true';
    const appointment = await createClinicPortalAppointment(req.tenantId, {
      patientName,
      appointmentDate: date,
      appointmentTime: time,
      appointmentType: type,
      patientPhone: phone || patientPhone,
      patientEmail,
      doctorName,
      doctorId: req.body?.doctorId,
    });

    let qmsToken = null;
    try {
      const { issueTokenForAppointment, isInPersonConsultation } = await import('../../services/qms-opd.service.js');
      const ctype = type || 'in-person';
      if (isInPersonConsultation(ctype) || !['video', 'audio', 'chat', 'telemedicine'].includes(String(ctype).toLowerCase())) {
        qmsToken = await issueTokenForAppointment({
          id: appointment.id,
          patientName,
          patientPhone: phone || patientPhone,
          doctorName: doctorName || appointment.doctor,
          doctorId: req.body?.doctorId,
          appointmentDate: date,
          appointmentTime: time,
          organization_id: req.tenantId,
          specialization: req.body?.specialization,
        }, {
          notifyOptIn,
          notifyPhone: phone || patientPhone,
          organizationId: req.tenantId,
          source: 'clinic-portal-booking',
          mode: 'auto',
        });
      }
    } catch (qmsErr) {
      console.error('[clinic/appointments] QMS token failed:', qmsErr.message);
    }

    res.json({
      success: true,
      message: qmsToken?.deferred
        ? `Appointment created. Token activates on ${qmsToken.activateOn}.`
        : qmsToken?.tokenNumber
          ? `Appointment created. Token ${qmsToken.tokenNumber} issued.`
          : 'Appointment created successfully',
      data: { ...appointment, qmsToken },
      qmsToken,
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create appointment',
      error: error.message
    });
  }
});

// Get Patients
router.get('/patients', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const patients = await listClinicPortalPatients(req.tenantId, {
      search: req.query.search,
      limit: req.query.limit,
    });
    res.json({ success: true, data: patients, total: patients.length });
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
      error: error.message
    });
  }
});

// Add Patient
router.post('/patients', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const { name, phone, email, diagnosis, nextVisit, password } = req.body;
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and phone are required'
      });
    }
    const derivedEmail = email
      || `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '.')}@${req.clinicPortal?.slug || 'clinic'}.patient.local`;
    const patient = await createClinicPortalPatient(req.tenantId, {
      name,
      phone,
      email: derivedEmail,
      diagnosis,
      nextVisit,
      password,
    });
    res.json({
      success: true,
      message: 'Patient added successfully',
      data: patient
    });
  } catch (error) {
    console.error('Error adding patient:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to add patient',
      error: error.message
    });
  }
});

// Staff list / create (portal token)
router.get('/staff', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const staff = await listClinicPortalStaff(req.tenantId);
    res.json({ success: true, data: staff, total: staff.length });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch staff' });
  }
});

router.post('/staff', verifyClinicToken, async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const staff = await createClinicPortalStaff(req.tenantId, req.body);
    res.status(201).json({ success: true, message: 'Staff created', data: staff });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to create staff' });
  }
});

// Get Prescriptions
router.get('/prescriptions', verifyClinicToken, async (req, res) => {
  try {
    const clinicId = Number(req.clinicId);
    if (!Number.isFinite(clinicId)) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        stats: { generatedToday: 0, shared: 0, pendingSign: 0, refills: 0 }
      });
    }

    const { status, limit = 50, offset = 0 } = req.query;
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);

    const baseWhere = { organization_type: 'clinic', organization_id: clinicId };
    const listWhere = { ...baseWhere };
    if (status) listWhere.status = status;

    const { rows: prescriptions, count: total } = await Prescription.findAndCountAll({
      where: listWhere,
      order: [['createdAt', 'DESC']],
      limit: safeLimit,
      offset: safeOffset
    });

    const items = prescriptions.map((rx) => ({
      id: rx.id,
      prescriptionId: rx.prescriptionId,
      patientName: rx.patientName,
      doctorName: rx.doctorName,
      diagnosis: rx.diagnosis,
      status: rx.status,
      createdAt: rx.createdAt,
      validUntil: rx.validUntil,
      medicationsCount: Array.isArray(rx.medications) ? rx.medications.length : 0
    }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekAhead = new Date(today);
    weekAhead.setDate(weekAhead.getDate() + 7);

    const [generatedToday, pendingSign, shared, refills] = await Promise.all([
      Prescription.count({ where: { ...baseWhere, createdAt: { [Op.gte]: today, [Op.lt]: tomorrow } } }),
      Prescription.count({ where: { ...baseWhere, status: 'draft' } }),
      Prescription.count({ where: { ...baseWhere, status: { [Op.in]: ['issued', 'dispensed'] } } }),
      Prescription.count({ where: { ...baseWhere, validUntil: { [Op.gte]: today, [Op.lte]: weekAhead } } })
    ]);

    res.json({
      success: true,
      data: items,
      total,
      stats: { generatedToday, shared, pendingSign, refills }
    });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

// Get Purchase Orders
router.get('/purchase-orders', verifyClinicToken, async (req, res) => {
  try {
    const clinicId = Number(req.clinicId);
    if (!Number.isFinite(clinicId)) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const { status, limit = 50, offset = 0 } = req.query;
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);

    const { postgresSequelize } = await getModels();
    const statusClause = status ? 'AND status = :status' : '';
    const replacements = { clinicId, limit: safeLimit, offset: safeOffset, status };

    const orders = await postgresSequelize.query(
      `SELECT id, supplier, total_amount, expected_delivery_date, status, created_at
       FROM pharmacy_purchase_orders
       WHERE pharmacy_id = :clinicId ${statusClause}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );

    const totals = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS total
       FROM pharmacy_purchase_orders
       WHERE pharmacy_id = :clinicId ${statusClause}`,
      { replacements: { clinicId, status }, type: QueryTypes.SELECT }
    );

    const total = totals[0]?.total || 0;

    res.json({
      success: true,
      data: orders.map((order) => ({
        ...order,
        orderNumber: order.id ? `PO-${order.id}` : undefined
      })),
      total
    });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase orders',
      error: error.message
    });
  }
});

// Get Invoices
router.get('/invoices', verifyClinicToken, async (req, res) => {
  try {
    const { status, startDate, endDate, limit = 50 } = req.query;

    // Simulated data
    const invoices = [
      {
        id: 'INV-2025-00234',
        patientName: 'Suresh Kumar',
        amount: 2500,
        status: 'Paid',
        date: '2024-12-04',
        items: [
          { name: 'Consultation Fee', amount: 800 },
          { name: 'Lab Tests', amount: 1200 },
          { name: 'Medicines', amount: 500 }
        ]
      },
      {
        id: 'INV-2025-00235',
        patientName: 'Meera Shah',
        amount: 1800,
        status: 'Paid',
        date: '2024-12-04',
        items: [
          { name: 'Consultation Fee', amount: 800 },
          { name: 'X-Ray', amount: 1000 }
        ]
      },
      {
        id: 'INV-2025-00236',
        patientName: 'Ravi Patel',
        amount: 3200,
        status: 'Pending',
        date: '2024-12-04',
        items: [
          { name: 'Consultation Fee', amount: 800 },
          { name: 'ECG', amount: 800 },
          { name: 'Medicines', amount: 1600 }
        ]
      }
    ];

    res.json({
      success: true,
      data: invoices,
      total: invoices.length
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

// Create Invoice
router.post('/invoices', verifyClinicToken, async (req, res) => {
  try {
    const { patientName, amount, items } = req.body;

    if (!patientName || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and amount are required'
      });
    }

    const invoice = {
      id: `INV-2025-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
      clinicId: req.clinicId,
      patientName,
      amount,
      items: items || [],
      status: 'Pending',
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date()
    };

    res.json({
      success: true,
      message: 'Invoice created successfully',
      data: invoice
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: error.message
    });
  }
});

// Get Inventory
router.get('/inventory', verifyClinicToken, async (req, res) => {
  try {
    const { status, category } = req.query;

    // Simulated data
    const inventory = [
      {
        id: 1,
        name: 'Paracetamol 500mg',
        quantity: 245,
        status: 'In Stock',
        category: 'Medicine',
        minStock: 50,
        price: 2.50,
        expiry: '2025-12-31'
      },
      {
        id: 2,
        name: 'Amoxicillin 250mg',
        quantity: 18,
        status: 'Low Stock',
        category: 'Medicine',
        minStock: 30,
        price: 15.00,
        expiry: '2025-08-15'
      },
      {
        id: 3,
        name: 'Blood Pressure Monitor',
        quantity: 5,
        status: 'Low Stock',
        category: 'Equipment',
        minStock: 3,
        price: 1200.00,
        expiry: null
      },
      {
        id: 4,
        name: 'Thermometer Digital',
        quantity: 0,
        status: 'Out of Stock',
        category: 'Equipment',
        minStock: 10,
        price: 250.00,
        expiry: null
      }
    ];

    res.json({
      success: true,
      data: inventory,
      total: inventory.length,
      summary: {
        total: inventory.length,
        inStock: inventory.filter(i => i.quantity > i.minStock).length,
        lowStock: inventory.filter(i => i.quantity > 0 && i.quantity <= i.minStock).length,
        outOfStock: inventory.filter(i => i.quantity === 0).length
      }
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory',
      error: error.message
    });
  }
});

// Update Inventory Item
router.put('/inventory/:id', verifyClinicToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, price, minStock } = req.body;

    const updatedItem = {
      id,
      quantity,
      price,
      minStock,
      updatedAt: new Date()
    };

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      data: updatedItem
    });
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inventory',
      error: error.message
    });
  }
});

// Get Clinic Profile
router.get('/profile', verifyClinicToken, async (req, res) => {
  try {
    const hospital = req.clinicPortal?.hospital;
    const tenant = req.clinicPortal?.tenant || (req.tenantId ? await Tenant.findByPk(req.tenantId) : null);
    const meta = hospital?.metadata || {};
    res.json({
      success: true,
      data: {
        id: hospital?.id || req.clinicId,
        tenantId: req.tenantId,
        name: hospital?.hospitalName || hospital?.hospital_name || tenant?.name,
        email: hospital?.email || tenant?.admin_email || tenant?.email,
        phone: hospital?.phoneNumber || hospital?.phone_number || tenant?.phone,
        clinicType: meta.clinicType || 'Dental Clinic',
        address: hospital?.address || tenant?.address,
        city: hospital?.city,
        state: hospital?.state,
        specializations: hospital?.specializations || ['Dental'],
        subdomain: tenant?.subdomain,
        slug: tenant?.slug,
        accessUrl: tenant?.subdomain ? `https://${tenant.subdomain}.mediqzy.com` : null,
        isVerified: hospital?.isVerified ?? tenant?.is_verified,
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

// Update Clinic Profile
router.put('/profile', verifyClinicToken, async (req, res) => {
  try {
    const hospital = req.clinicPortal?.hospital;
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Clinic login account not found' });
    }
    const allowed = ['hospitalName', 'phoneNumber', 'address', 'city', 'state', 'pincode'];
    const updates = {};
    if (req.body.name) updates.hospitalName = req.body.name;
    if (req.body.phone) updates.phoneNumber = req.body.phone;
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await hospital.update(updates);
    if (req.tenantId && (req.body.name || req.body.phone)) {
      await Tenant.update(
        {
          ...(req.body.name ? { name: req.body.name } : {}),
          ...(req.body.phone ? { phone: req.body.phone } : {}),
        },
        { where: { id: req.tenantId } },
      );
    }
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: hospital.id,
        name: hospital.hospitalName,
        phone: hospital.phoneNumber,
        city: hospital.city,
        state: hospital.state,
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

export default router;
