import { Router } from 'express';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes, Op } from 'sequelize';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import Appointment from '../models/postgres/appointment.model.postgres.js';
import Doctor from '../models/postgres/doctor.model.postgres.js';
import User from '../models/postgres/user.model.postgres.js';

const router = Router();

// Middleware to ensure hospital authentication
const requireHospitalAuth = (req, res, next) => {
  if (!req.user || (req.user.role !== 'hospital' && req.user.role !== 'hospital_staff')) {
    return res.status(403).json({
      success: false,
      message: 'Hospital authentication required'
    });
  }
  next();
};

// ============================================================================
// APPOINTMENTS MANAGEMENT
// ============================================================================

/**
 * Get Hospital Appointments
 * GET /api/hospital/practice/appointments
 */
router.get('/appointments', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const { status, date, upcoming, department, doctorId } = req.query;
    const hospitalId = req.user.hospitalId || req.user.id;
    const organizationId = req.user.organization_id || hospitalId;

    console.log('🏥 Hospital appointments request:', {
      hospitalId,
      organizationId,
      status,
      date,
      upcoming,
      department,
      doctorId,
      userInfo: {
        id: req.user.id,
        role: req.user.role,
        email: req.user.email
      }
    });

    const whereClause = {
      organization_id: organizationId
    };

    if (status) {
      whereClause.status = status;
    }

    if (date) {
      whereClause.appointmentDate = date;
    }

    if (upcoming === 'true') {
      const now = new Date();
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
    }

    if (doctorId) {
      whereClause.doctorId = doctorId;
    }

    console.log('🏥 Query where clause:', JSON.stringify(whereClause, null, 2));

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ],
      logging: console.log
    });

    console.log('✅ Found hospital appointments:', appointments.length);

    return res.status(200).json({
      success: true,
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('Get hospital appointments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

/**
 * Get Hospital Practice Summary
 * GET /api/hospital/practice
 */
router.get('/', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || req.user.id;
    const organizationId = req.user.organization_id || hospitalId;

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Fetch appointments
    const [totalAppointments, todayAppointments, upcomingAppointments] = await Promise.all([
      Appointment.count({ where: { organization_id: organizationId } }),
      Appointment.count({ where: { organization_id: organizationId, appointmentDate: today } }),
      Appointment.count({
        where: {
          organization_id: organizationId,
          appointmentDate: { [Op.gte]: today }
        }
      })
    ]);

    // Fetch recent appointments
    const recentAppointments = await Appointment.findAll({
      where: { organization_id: organizationId },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalAppointments,
          todayAppointments,
          upcomingAppointments
        },
        recentAppointments
      }
    });
  } catch (error) {
    console.error('Get hospital practice error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch practice data',
      error: error.message
    });
  }
});

/**
 * List patients for practice management (OPD queue + active IPD)
 * GET /api/hospital/practice/patients
 */
router.get('/patients', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.hospitalId || req.user.id;

    const [queueRows, ipdRows] = await Promise.all([
      sequelize.query(
        `SELECT DISTINCT ON (q.patient_id)
            q.patient_id AS id,
            q.patient_name AS name,
            u."phoneNumber" AS phone,
            u.email,
            u.gender,
            u.metadata,
            'OPD' AS admission_status,
            q.token_number,
            q.check_in_at
         FROM hospital_queue_entries q
         LEFT JOIN users u ON u.id = q.patient_id
         WHERE q.organization_id = :orgId
           AND q.department = 'opd'
           AND q.check_in_at::date = CURRENT_DATE
           AND q.status IN ('waiting', 'called', 'in_service')
         ORDER BY q.patient_id, q.check_in_at DESC`,
        { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
            a.patient_id AS id,
            COALESCE(u."firstName" || ' ' || NULLIF(u."lastName", ''), u."firstName", 'Patient') AS name,
            u."phoneNumber" AS phone,
            u.email,
            u.gender,
            u.metadata,
            'IPD' AS admission_status,
            a.id AS admission_id,
            a.admission_number,
            a.admission_diagnosis AS diagnosis,
            a.admitted_at AS admission_date,
            w.name AS ward,
            b.bed_number AS bed
         FROM ip_admissions a
         LEFT JOIN users u ON u.id = a.patient_id
         LEFT JOIN beds b ON b.id = a.bed_id
         LEFT JOIN wards w ON w.id = b.ward_id
         WHERE a.organization_id = :orgId AND a.status = 'active'
         ORDER BY a.admitted_at DESC`,
        { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
      ),
    ]);

    const mapRow = (row, status) => {
      const meta = typeof row.metadata === 'object' ? row.metadata : {};
      return {
        id: String(row.id),
        uhid: meta.uhid || row.admission_number || `UHID${row.id}`,
        name: row.name || 'Unknown',
        age: meta.age || 0,
        gender: (row.gender || 'Other').replace(/^./, c => c.toUpperCase()),
        phone: row.phone || '',
        email: row.email || undefined,
        address: meta.address || '',
        bloodGroup: meta.bloodGroup || '—',
        admissionStatus: status,
        admissionDate: row.admission_date ? String(row.admission_date).slice(0, 10) : undefined,
        assignedDoctor: meta.doctorName || undefined,
        department: meta.department || 'General',
        bed: row.bed || undefined,
        ward: row.ward || undefined,
        diagnosis: row.diagnosis || undefined,
      };
    };

    const seen = new Set();
    const patients = [];
    for (const row of ipdRows) {
      seen.add(String(row.id));
      patients.push(mapRow(row, 'IPD'));
    }
    for (const row of queueRows) {
      const id = String(row.id);
      if (!seen.has(id)) {
        seen.add(id);
        patients.push(mapRow(row, 'OPD'));
      }
    }

    return res.json({ success: true, data: patients });
  } catch (error) {
    console.error('List practice patients error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Convert OPD patient to IPD (redirect payload for ADT form)
 * PATCH /api/hospital/practice/patients/:id
 */
router.patch('/patients/:id', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const patientId = parseInt(req.params.id, 10);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { admissionStatus } = req.body;
    if (admissionStatus !== 'IPD') {
      return res.status(400).json({ success: false, message: 'Only IPD conversion supported' });
    }

    const user = await User.findByPk(patientId, {
      attributes: ['id', 'firstName', 'lastName', 'phoneNumber', 'metadata'],
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    return res.json({
      success: true,
      data: {
        id: String(user.id),
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        admissionStatus: 'IPD',
        redirect: `/hospital/adt/admit?patientId=${user.id}&name=${encodeURIComponent(`${user.firstName} ${user.lastName}`.trim())}&type=op_converted`,
      },
    });
  } catch (error) {
    console.error('Patch practice patient error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// INSURANCE & BILLING - Claims Management
// ============================================================================

/**
 * Update Insurance Claim
 * PATCH /api/hospital/practice/insurance/claims/:id
 */
router.patch('/insurance/claims/:id', authUser, requireHospitalAuth, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { status, approvedAmount, remarks } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;

    // Update claim
    const [updated] = await sequelize.query(
      `UPDATE insurance_claims 
       SET status = :status,
           approved_amount = :approvedAmount,
           remarks = :remarks,
           updated_at = NOW(),
           updated_by = :hospitalId
       WHERE id = :id AND hospital_id = :hospitalId
       RETURNING *`,
      {
        replacements: { id, status, approvedAmount, remarks, hospitalId },
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    if (!updated || updated.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Claim not found or unauthorized'
      });
    }

    // Add timeline entry
    await sequelize.query(
      `INSERT INTO claim_timeline (claim_id, status, remarks, updated_by, created_at)
       VALUES (:claimId, :status, :remarks, :hospitalId, NOW())`,
      {
        replacements: { claimId: id, status, remarks: remarks || 'Status updated', hospitalId },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();

    res.json({
      success: true,
      message: 'Claim updated successfully',
      data: updated[0]
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update claim',
      error: error.message
    });
  }
});

// ============================================================================
// MEDICAL RECORDS DEPARTMENT (MRD)
// ============================================================================

/**
 * Add Record to Digitization Queue
 * POST /api/hospital/practice/mrd/digitization-queue
 */
router.post('/mrd/digitization-queue', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const { recordId } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;

    if (!recordId) {
      return res.status(400).json({
        success: false,
        message: 'Record ID is required'
      });
    }

    // Check if record exists and belongs to hospital
    const [record] = await sequelize.query(
      `SELECT id, mrd_number, patient_name, total_pages 
       FROM medical_records 
       WHERE id = :recordId AND hospital_id = :hospitalId`,
      {
        replacements: { recordId, hospitalId },
        type: QueryTypes.SELECT
      }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Medical record not found'
      });
    }

    // Add to digitization queue
    const [queueEntry] = await sequelize.query(
      `INSERT INTO digitization_queue 
       (record_id, mrd_number, patient_name, total_pages, status, priority, hospital_id, created_at, updated_at)
       VALUES (:recordId, :mrdNumber, :patientName, :totalPages, 'pending', 'normal', :hospitalId, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          recordId: record.id,
          mrdNumber: record.mrd_number,
          patientName: record.patient_name,
          totalPages: record.total_pages || 0,
          hospitalId
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Record added to digitization queue',
      data: queueEntry[0]
    });
  } catch (error) {
    console.error('Error adding to digitization queue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add record to queue',
      error: error.message
    });
  }
});

// ============================================================================
// DISCHARGE SUMMARIES
// ============================================================================

/**
 * Save Discharge Summary (Draft)
 * POST /api/hospital/practice/discharge-summaries
 */
router.post('/discharge-summaries', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      patientId,
      admissionId,
      diagnosis,
      procedures,
      medications,
      followUp,
      status
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;
    const createdBy = req.user.id;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const [summary] = await sequelize.query(
      `INSERT INTO discharge_summaries 
       (patient_id, admission_id, diagnosis, procedures, medications, follow_up, 
        status, hospital_id, created_by, created_at, updated_at)
       VALUES (:patientId, :admissionId, :diagnosis, :procedures, :medications, :followUp,
               :status, :hospitalId, :createdBy, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          admissionId,
          diagnosis: JSON.stringify(diagnosis || []),
          procedures: JSON.stringify(procedures || []),
          medications: JSON.stringify(medications || []),
          followUp,
          status: status || 'draft',
          hospitalId,
          createdBy
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Discharge summary saved',
      data: summary[0]
    });
  } catch (error) {
    console.error('Error saving discharge summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save discharge summary',
      error: error.message
    });
  }
});

/**
 * Submit Discharge Summary for Approval
 * POST /api/hospital/practice/discharge-summaries/submit
 */
router.post('/discharge-summaries/submit', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      patientId,
      admissionId,
      diagnosis,
      procedures,
      medications,
      followUp
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;
    const createdBy = req.user.id;

    const [summary] = await sequelize.query(
      `INSERT INTO discharge_summaries 
       (patient_id, admission_id, diagnosis, procedures, medications, follow_up, 
        status, hospital_id, created_by, submitted_at, created_at, updated_at)
       VALUES (:patientId, :admissionId, :diagnosis, :procedures, :medications, :followUp,
               'pending_approval', :hospitalId, :createdBy, NOW(), NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          admissionId,
          diagnosis: JSON.stringify(diagnosis || []),
          procedures: JSON.stringify(procedures || []),
          medications: JSON.stringify(medications || []),
          followUp,
          hospitalId,
          createdBy
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Discharge summary submitted for approval',
      data: summary[0]
    });
  } catch (error) {
    console.error('Error submitting discharge summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit discharge summary',
      error: error.message
    });
  }
});

// ============================================================================
// PRESCRIPTIONS
// ============================================================================

/**
 * Create Prescription
 * POST /api/hospital/practice/prescriptions
 */
router.post('/prescriptions', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      patientId,
      medications,
      diagnosis,
      notes,
      doctorId
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;

    if (!patientId || !medications || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and medications are required'
      });
    }

    const [prescription] = await sequelize.query(
      `INSERT INTO prescriptions 
       (patient_id, doctor_id, hospital_id, diagnosis, medications, notes, 
        status, created_at, updated_at)
       VALUES (:patientId, :doctorId, :hospitalId, :diagnosis, :medications, :notes,
               'active', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          doctorId: doctorId || req.user.id,
          hospitalId,
          diagnosis,
          medications: JSON.stringify(medications),
          notes
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      data: prescription[0]
    });
  } catch (error) {
    console.error('Error creating prescription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
});

// ============================================================================
// INPATIENT (IP) SHEETS
// ============================================================================

/**
 * Save IP Sheet
 * POST /api/hospital/practice/ip-sheets
 */
router.post('/ip-sheets', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      patientId,
      sheetType,
      data,
      timestamp
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;
    const createdBy = req.user.id;

    if (!patientId || !sheetType) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and sheet type are required'
      });
    }

    const [sheet] = await sequelize.query(
      `INSERT INTO ip_sheets 
       (patient_id, sheet_type, data, hospital_id, created_by, recorded_at, created_at, updated_at)
       VALUES (:patientId, :sheetType, :data, :hospitalId, :createdBy, :timestamp, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          sheetType,
          data: JSON.stringify(data || {}),
          hospitalId,
          createdBy,
          timestamp: timestamp || new Date().toISOString()
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'IP sheet saved successfully',
      data: sheet[0]
    });
  } catch (error) {
    console.error('Error saving IP sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save IP sheet',
      error: error.message
    });
  }
});

// ============================================================================
// BRANCHES & CLINICS
// ============================================================================

/**
 * Add Hospital Branch
 * POST /api/hospital/practice/branches
 */
router.post('/branches', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      name,
      type,
      address,
      city,
      state,
      pincode,
      phone,
      email,
      manager
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;

    if (!name || !address) {
      return res.status(400).json({
        success: false,
        message: 'Branch name and address are required'
      });
    }

    const [branch] = await sequelize.query(
      `INSERT INTO hospital_branches 
       (hospital_id, name, type, address, city, state, pincode, phone, email, 
        manager, status, created_at, updated_at)
       VALUES (:hospitalId, :name, :type, :address, :city, :state, :pincode, :phone, :email,
               :manager, 'active', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          hospitalId,
          name,
          type: type || 'branch',
          address,
          city,
          state,
          pincode,
          phone,
          email,
          manager: JSON.stringify(manager || {})
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Branch added successfully',
      data: branch[0]
    });
  } catch (error) {
    console.error('Error adding branch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add branch',
      error: error.message
    });
  }
});

/**
 * Add Outreach Clinic
 * POST /api/hospital/practice/clinics
 */
router.post('/clinics', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      name,
      type,
      parentBranch,
      location,
      schedule,
      doctor,
      services,
      capacity
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;

    if (!name || !location) {
      return res.status(400).json({
        success: false,
        message: 'Clinic name and location are required'
      });
    }

    const [clinic] = await sequelize.query(
      `INSERT INTO outreach_clinics 
       (hospital_id, name, type, parent_branch, location, schedule, doctor, 
        services, capacity, status, created_at, updated_at)
       VALUES (:hospitalId, :name, :type, :parentBranch, :location, :schedule, :doctor,
               :services, :capacity, 'active', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          hospitalId,
          name,
          type: type || 'daily',
          parentBranch,
          location: JSON.stringify(location),
          schedule: JSON.stringify(schedule || {}),
          doctor: JSON.stringify(doctor || {}),
          services: JSON.stringify(services || []),
          capacity: capacity || 0
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Clinic added successfully',
      data: clinic[0]
    });
  } catch (error) {
    console.error('Error adding clinic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add clinic',
      error: error.message
    });
  }
});

// ============================================================================
// AMBULANCE MANAGEMENT
// ============================================================================

/**
 * Add Ambulance Vehicle
 * POST /api/hospital/practice/ambulances/vehicles
 */
router.post('/ambulances/vehicles', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      vehicleNumber,
      type,
      driver,
      paramedic,
      equipment
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;

    if (!vehicleNumber || !type) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle number and type are required'
      });
    }

    const [vehicle] = await sequelize.query(
      `INSERT INTO ambulance_vehicles 
       (hospital_id, vehicle_number, type, driver, paramedic, equipment, 
        status, fuel_level, created_at, updated_at)
       VALUES (:hospitalId, :vehicleNumber, :type, :driver, :paramedic, :equipment,
               'available', 100, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          hospitalId,
          vehicleNumber,
          type,
          driver: JSON.stringify(driver || {}),
          paramedic: JSON.stringify(paramedic || {}),
          equipment: JSON.stringify(equipment || [])
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Ambulance vehicle added successfully',
      data: vehicle[0]
    });
  } catch (error) {
    console.error('Error adding ambulance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add ambulance vehicle',
      error: error.message
    });
  }
});

// ============================================================================
// LAB ORDERS
// ============================================================================

/**
 * Create Lab Test Order
 * POST /api/hospital/practice/lab-orders
 */
router.post('/lab-orders', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      patientId,
      tests,
      priority,
      notes,
      totalAmount
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;
    const orderedBy = req.user.id;

    if (!patientId || !tests || tests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and tests are required'
      });
    }

    const orderNumber = `LAB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const [order] = await sequelize.query(
      `INSERT INTO lab_orders 
       (order_number, patient_id, hospital_id, ordered_by, tests, priority, 
        notes, total_amount, status, created_at, updated_at)
       VALUES (:orderNumber, :patientId, :hospitalId, :orderedBy, :tests, :priority,
               :notes, :totalAmount, 'ordered', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          orderNumber,
          patientId,
          hospitalId,
          orderedBy,
          tests: JSON.stringify(tests),
          priority: priority || 'routine',
          notes,
          totalAmount: totalAmount || 0
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Lab order created successfully',
      data: order[0]
    });
  } catch (error) {
    console.error('Error creating lab order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lab order',
      error: error.message
    });
  }
});

// ============================================================================
// IMAGING ORDERS
// ============================================================================

/**
 * Create Imaging Test Order
 * POST /api/hospital/practice/imaging-orders
 */
router.post('/imaging-orders', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      patientId,
      tests,
      priority,
      notes,
      totalAmount
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;
    const orderedBy = req.user.id;

    if (!patientId || !tests || tests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and tests are required'
      });
    }

    const orderNumber = `IMG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const [order] = await sequelize.query(
      `INSERT INTO imaging_orders 
       (order_number, patient_id, hospital_id, ordered_by, tests, priority, 
        notes, total_amount, status, created_at, updated_at)
       VALUES (:orderNumber, :patientId, :hospitalId, :orderedBy, :tests, :priority,
               :notes, :totalAmount, 'ordered', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          orderNumber,
          patientId,
          hospitalId,
          orderedBy,
          tests: JSON.stringify(tests),
          priority: priority || 'routine',
          notes,
          totalAmount: totalAmount || 0
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Imaging order created successfully',
      data: order[0]
    });
  } catch (error) {
    console.error('Error creating imaging order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create imaging order',
      error: error.message
    });
  }
});

// ============================================================================
// PROCEDURE SCHEDULING
// ============================================================================

/**
 * Schedule Procedure
 * POST /api/hospital/practice/procedures/schedule
 */
router.post('/procedures/schedule', authUser, requireHospitalAuth, async (req, res) => {
  try {
    const {
      procedureId,
      patientId,
      scheduledDate,
      scheduledTime,
      priority,
      anesthesiaType,
      room,
      notes,
      estimatedDuration
    } = req.body;
    const hospitalId = req.user.hospitalId || req.user.id;
    const scheduledBy = req.user.id;

    if (!procedureId || !patientId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({
        success: false,
        message: 'Procedure ID, patient ID, date and time are required'
      });
    }

    const [scheduled] = await sequelize.query(
      `INSERT INTO procedure_schedules 
       (procedure_id, patient_id, hospital_id, scheduled_by, scheduled_date, 
        scheduled_time, priority, anesthesia_type, room, notes, estimated_duration,
        status, created_at, updated_at)
       VALUES (:procedureId, :patientId, :hospitalId, :scheduledBy, :scheduledDate,
               :scheduledTime, :priority, :anesthesiaType, :room, :notes, :estimatedDuration,
               'scheduled', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          procedureId,
          patientId,
          hospitalId,
          scheduledBy,
          scheduledDate,
          scheduledTime,
          priority: priority || 'routine',
          anesthesiaType,
          room,
          notes,
          estimatedDuration
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      message: 'Procedure scheduled successfully',
      data: scheduled[0]
    });
  } catch (error) {
    console.error('Error scheduling procedure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule procedure',
      error: error.message
    });
  }
});

export default router;
