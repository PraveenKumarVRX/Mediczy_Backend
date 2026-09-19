/**
 * Ambulance Routes
 * Authentication and ambulance management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { Ambulance } from '../models/index.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import ambulanceDispatch from '../services/ambulance-dispatch.service.js';
import ambulanceFleet, { VEHICLE_TYPES, VEHICLE_STATUSES, CREW_ROLES, DUTY_STATUSES } from '../services/ambulance-fleet.service.js';

const router = express.Router();

/**
 * POST /api/ambulance/login
 * Ambulance provider login
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find ambulance by email - select only needed fields for faster query
    const ambulance = await Ambulance.findOne({
      where: { email: normalizedEmail },
      attributes: ['id', 'providerName', 'email', 'password', 'phone', 'emergencyPhone', 'vehicleNumber'],
      raw: true
    });

    if (!ambulance) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Ambulance not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, ambulance.password);

    if (!isValidPassword) {
      await auditLoginAttempt(req, ambulance.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: ambulance.id, email: ambulance.email, role: 'ambulance', type: 'ambulance' },
      JWT_CONFIG.SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    await auditLoginAttempt(req, ambulance.id, normalizedEmail, true);

    res.json({
      success: true,
      token,
      ambulance: {
        id: ambulance.id,
        providerName: ambulance.providerName,
        email: ambulance.email,
        phone: ambulance.phone,
      },
    });
  } catch (error) {
    console.error('Ambulance login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
/**
 * POST /api/ambulance/register — handled by ambulance/auth.routes.js (secure wizard)
 */
// Registration is handled by the dedicated auth router (ambulance/auth.routes.js)
// which is mounted at /api/ambulance AFTER this router.
// DO NOT add a register handler here.

/**
 * GET /api/ambulance/profile
 * Get ambulance profile
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const ambulance = await Ambulance.findByPk(decoded.id);

    if (!ambulance) {
      return res.status(404).json({ success: false, message: 'Ambulance not found' });
    }

    res.json({
      success: true,
      ambulance: {
        id: ambulance.id,
        name: ambulance.name,
        email: ambulance.email,
        phone: ambulance.phone,
        license_number: ambulance.license_number,
        vehicles: ambulance.vehicles,
        address: ambulance.address,
        status: ambulance.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

// ─── Dispatch (Workstream 6, added 2026-09-18) ───────────────────────────────
// Matches this file's own auth pattern (manual jwt.verify against the
// Ambulance provider's own token) rather than introducing the standard
// authUser middleware here — additive only, /login and /profile unchanged.

const toId = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const bad = (res, message) => res.status(400).json({ success: false, message });

const authAmbulanceProvider = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    // All platform JWTs share one secret, so the signature alone does not prove
    // this is an ambulance provider: a patient/doctor token whose `id` happens
    // to equal an ambulance id must not be accepted. Both ambulance login paths
    // (/login here and ambulance/auth.routes.js) sign role: 'ambulance'.
    if (!decoded || (decoded.type !== 'ambulance' && decoded.role !== 'ambulance')) {
      return res.status(403).json({ success: false, message: 'Ambulance provider access required' });
    }
    req.ambulanceProvider = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

router.post('/trips', authAmbulanceProvider, async (req, res) => {
  try {
    const { patientId, patientName, patientPhone, pickupLocation, dropLocation, tripType, urgency, driverName } = req.body;
    if (!pickupLocation) return res.status(400).json({ success: false, message: 'pickupLocation is required' });
    const trip = await ambulanceDispatch.dispatchTrip({
      ambulanceId: req.ambulanceProvider.id, patientId, patientName, patientPhone, pickupLocation, dropLocation, tripType, urgency, driverName,
    });
    res.status(201).json({ success: true, trip });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to dispatch trip', error: error.message });
  }
});

const TRIP_STATUSES = ['dispatched', 'en_route', 'arrived', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'overdue', 'waived'];
const MAX_FARE = 99999999.99; // NUMERIC(10,2)

router.patch('/trips/:id/status', authAmbulanceProvider, async (req, res) => {
  try {
    const tripId = toId(req.params.id);
    if (!tripId) return bad(res, 'Invalid trip id');
    const { status } = req.body || {};
    if (!status) return bad(res, 'status is required');
    if (!TRIP_STATUSES.includes(status)) return bad(res, `status must be one of ${TRIP_STATUSES.join(', ')}`);
    const trip = await ambulanceDispatch.updateTripStatus(tripId, req.ambulanceProvider.id, status);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, trip });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update trip status', error: error.message });
  }
});

router.get('/trips', authAmbulanceProvider, async (req, res) => {
  try {
    const trips = await ambulanceDispatch.listTrips(req.ambulanceProvider.id, { status: req.query.status || null });
    res.json({ success: true, trips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list trips', error: error.message });
  }
});

router.get('/trips/active', authAmbulanceProvider, async (req, res) => {
  try {
    const trips = await ambulanceDispatch.getActiveTrips(req.ambulanceProvider.id);
    res.json({ success: true, trips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch active trips', error: error.message });
  }
});

router.get('/trips/completed', authAmbulanceProvider, async (req, res) => {
  try {
    const trips = await ambulanceDispatch.getCompletedTrips(req.ambulanceProvider.id, { limit: Number(req.query.limit) || 50 });
    res.json({ success: true, trips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch completed trips', error: error.message });
  }
});

router.get('/dashboard-stats', authAmbulanceProvider, async (req, res) => {
  try {
    const stats = await ambulanceDispatch.getStats(req.ambulanceProvider.id);
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats', error: error.message });
  }
});

router.patch('/trips/:id/fare', authAmbulanceProvider, async (req, res) => {
  try {
    const tripId = toId(req.params.id);
    if (!tripId) return bad(res, 'Invalid trip id');
    const { fareAmount, paymentStatus } = req.body || {};
    const hasFare = fareAmount !== undefined && fareAmount !== null && fareAmount !== '';
    const hasPayment = paymentStatus !== undefined && paymentStatus !== null && paymentStatus !== '';
    if (!hasFare && !hasPayment) return bad(res, 'fareAmount or paymentStatus is required');
    let fare = null;
    if (hasFare) {
      fare = typeof fareAmount === 'number' ? fareAmount : (typeof fareAmount === 'string' && fareAmount.trim() !== '' ? Number(fareAmount) : NaN);
      if (!Number.isFinite(fare) || fare < 0 || fare > MAX_FARE) return bad(res, 'fareAmount must be a non-negative number');
    }
    if (hasPayment && !PAYMENT_STATUSES.includes(paymentStatus)) return bad(res, `paymentStatus must be one of ${PAYMENT_STATUSES.join(', ')}`);
    const trip = await ambulanceDispatch.setTripFare(tripId, req.ambulanceProvider.id, {
      fareAmount: hasFare ? fare : null,
      paymentStatus: hasPayment ? paymentStatus : null,
    });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, trip });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update fare', error: error.message });
  }
});

router.get('/financial-summary', authAmbulanceProvider, async (req, res) => {
  try {
    const summary = await ambulanceDispatch.getFinancialSummary(req.ambulanceProvider.id);
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch financial summary', error: error.message });
  }
});

// ─── Fleet: vehicles, crew, maintenance, shifts, alerts ──────────────────────
// Every handler is scoped to req.ambulanceProvider.id; :id routes verify
// ownership in the service (WHERE id = $1 AND ambulance_id = $2) and return
// 404 when the row is not the caller's.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const fleetError = (res, message, error) => {
  if (error.statusCode === 409 || error.code === '23505') {
    return res.status(409).json({ success: false, message: error.statusCode ? error.message : 'A record with those details already exists' });
  }
  return res.status(500).json({ success: false, message, error: error.message });
};

router.get('/fleet/vehicles', authAmbulanceProvider, async (req, res) => {
  try {
    const vehicles = await ambulanceFleet.listVehicles(req.ambulanceProvider.id);
    res.json({ success: true, vehicles });
  } catch (error) {
    fleetError(res, 'Failed to list vehicles', error);
  }
});

router.post('/fleet/vehicles', authAmbulanceProvider, async (req, res) => {
  try {
    const { registrationNumber, vehicleType, status, currentLocation, lastServiceDate, nextServiceDue } = req.body;
    if (!registrationNumber || !String(registrationNumber).trim()) return bad(res, 'registrationNumber is required');
    if (vehicleType && !VEHICLE_TYPES.includes(vehicleType)) return bad(res, `vehicleType must be one of ${VEHICLE_TYPES.join(', ')}`);
    if (status && !VEHICLE_STATUSES.includes(status)) return bad(res, `status must be one of ${VEHICLE_STATUSES.join(', ')}`);
    if ((lastServiceDate && !ISO_DATE.test(lastServiceDate)) || (nextServiceDue && !ISO_DATE.test(nextServiceDue))) return bad(res, 'Dates must be YYYY-MM-DD');
    const vehicle = await ambulanceFleet.createVehicle(req.ambulanceProvider.id, {
      registrationNumber: String(registrationNumber).trim().toUpperCase(), vehicleType, status, currentLocation, lastServiceDate, nextServiceDue,
    });
    res.status(201).json({ success: true, vehicle });
  } catch (error) {
    fleetError(res, 'Failed to create vehicle', error);
  }
});

router.patch('/fleet/vehicles/:id/status', authAmbulanceProvider, async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, 'Invalid vehicle id');
    if (!VEHICLE_STATUSES.includes(req.body.status)) return bad(res, `status must be one of ${VEHICLE_STATUSES.join(', ')}`);
    const vehicle = await ambulanceFleet.updateVehicleStatus(req.ambulanceProvider.id, id, req.body.status);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    res.json({ success: true, vehicle });
  } catch (error) {
    fleetError(res, 'Failed to update vehicle status', error);
  }
});

router.get('/fleet/summary', authAmbulanceProvider, async (req, res) => {
  try {
    const summary = await ambulanceFleet.getFleetSummary(req.ambulanceProvider.id);
    res.json({ success: true, summary });
  } catch (error) {
    fleetError(res, 'Failed to fetch fleet summary', error);
  }
});

router.get('/crew', authAmbulanceProvider, async (req, res) => {
  try {
    if (req.query.role && !CREW_ROLES.includes(req.query.role)) return bad(res, `role must be one of ${CREW_ROLES.join(', ')}`);
    const crew = await ambulanceFleet.listCrew(req.ambulanceProvider.id, { role: req.query.role || null });
    res.json({ success: true, crew });
  } catch (error) {
    fleetError(res, 'Failed to list crew', error);
  }
});

router.post('/crew', authAmbulanceProvider, async (req, res) => {
  try {
    const { name, role, licenseNumber, phone, dutyStatus } = req.body;
    if (!name || !String(name).trim()) return bad(res, 'name is required');
    if (!CREW_ROLES.includes(role)) return bad(res, `role must be one of ${CREW_ROLES.join(', ')}`);
    if (dutyStatus && !DUTY_STATUSES.includes(dutyStatus)) return bad(res, `dutyStatus must be one of ${DUTY_STATUSES.join(', ')}`);
    const member = await ambulanceFleet.createCrew(req.ambulanceProvider.id, { name: String(name).trim(), role, licenseNumber, phone, dutyStatus });
    res.status(201).json({ success: true, member });
  } catch (error) {
    fleetError(res, 'Failed to create crew member', error);
  }
});

router.patch('/crew/:id/duty', authAmbulanceProvider, async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, 'Invalid crew id');
    if (!DUTY_STATUSES.includes(req.body.dutyStatus)) return bad(res, `dutyStatus must be one of ${DUTY_STATUSES.join(', ')}`);
    const member = await ambulanceFleet.setCrewDuty(req.ambulanceProvider.id, id, req.body.dutyStatus);
    if (!member) return res.status(404).json({ success: false, message: 'Crew member not found' });
    res.json({ success: true, member });
  } catch (error) {
    fleetError(res, 'Failed to update duty status', error);
  }
});

router.get('/maintenance', authAmbulanceProvider, async (req, res) => {
  try {
    const maintenance = await ambulanceFleet.listMaintenance(req.ambulanceProvider.id, { status: req.query.status || null });
    res.json({ success: true, maintenance });
  } catch (error) {
    fleetError(res, 'Failed to list maintenance', error);
  }
});

router.post('/maintenance', authAmbulanceProvider, async (req, res) => {
  try {
    const { vehicleId, maintenanceType, scheduledDate, notes } = req.body;
    const vId = toId(vehicleId);
    if (!vId) return bad(res, 'vehicleId is required');
    if (!maintenanceType || !String(maintenanceType).trim()) return bad(res, 'maintenanceType is required');
    if (!scheduledDate || !ISO_DATE.test(scheduledDate)) return bad(res, 'scheduledDate is required (YYYY-MM-DD)');
    const item = await ambulanceFleet.createMaintenance(req.ambulanceProvider.id, { vehicleId: vId, maintenanceType: String(maintenanceType).trim(), scheduledDate, notes });
    if (!item) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    res.status(201).json({ success: true, maintenance: item });
  } catch (error) {
    fleetError(res, 'Failed to schedule maintenance', error);
  }
});

router.patch('/maintenance/:id/start', authAmbulanceProvider, async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, 'Invalid maintenance id');
    const item = await ambulanceFleet.startMaintenance(req.ambulanceProvider.id, id);
    if (!item) return res.status(404).json({ success: false, message: 'Maintenance record not found' });
    res.json({ success: true, maintenance: item });
  } catch (error) {
    fleetError(res, 'Failed to start maintenance', error);
  }
});

router.patch('/maintenance/:id/complete', authAmbulanceProvider, async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, 'Invalid maintenance id');
    const { lastServiceDate, nextServiceDue } = req.body || {};
    if ((lastServiceDate && !ISO_DATE.test(lastServiceDate)) || (nextServiceDue && !ISO_DATE.test(nextServiceDue))) return bad(res, 'Dates must be YYYY-MM-DD');
    const item = await ambulanceFleet.completeMaintenance(req.ambulanceProvider.id, id, { lastServiceDate, nextServiceDue });
    if (!item) return res.status(404).json({ success: false, message: 'Maintenance record not found' });
    res.json({ success: true, maintenance: item });
  } catch (error) {
    fleetError(res, 'Failed to complete maintenance', error);
  }
});

router.get('/shifts', authAmbulanceProvider, async (req, res) => {
  try {
    const { from, to } = req.query;
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) return bad(res, 'from/to must be YYYY-MM-DD');
    const shifts = await ambulanceFleet.listShifts(req.ambulanceProvider.id, { from: from || null, to: to || null });
    res.json({ success: true, shifts });
  } catch (error) {
    fleetError(res, 'Failed to list shifts', error);
  }
});

router.post('/shifts', authAmbulanceProvider, async (req, res) => {
  try {
    const { crewId, vehicleId, shiftDate, startTime, endTime } = req.body;
    const cId = toId(crewId);
    if (!cId) return bad(res, 'crewId is required');
    if (vehicleId != null && vehicleId !== '' && !toId(vehicleId)) return bad(res, 'Invalid vehicleId');
    if (!shiftDate || !ISO_DATE.test(shiftDate)) return bad(res, 'shiftDate is required (YYYY-MM-DD)');
    if (!startTime || !TIME_HHMM.test(startTime) || !endTime || !TIME_HHMM.test(endTime)) return bad(res, 'startTime and endTime are required (HH:MM)');
    const shift = await ambulanceFleet.createShift(req.ambulanceProvider.id, {
      crewId: cId, vehicleId: vehicleId != null && vehicleId !== '' ? toId(vehicleId) : null, shiftDate, startTime, endTime,
    });
    if (!shift) return res.status(404).json({ success: false, message: 'Crew member or vehicle not found' });
    res.status(201).json({ success: true, shift });
  } catch (error) {
    fleetError(res, 'Failed to create shift', error);
  }
});

router.get('/alerts', authAmbulanceProvider, async (req, res) => {
  try {
    const alerts = await ambulanceFleet.getAlerts(req.ambulanceProvider.id);
    res.json({ success: true, alerts });
  } catch (error) {
    fleetError(res, 'Failed to fetch alerts', error);
  }
});

export default router;
