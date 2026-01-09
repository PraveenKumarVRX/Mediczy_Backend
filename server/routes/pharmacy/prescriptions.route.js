/**
 * Pharmacy Prescriptions Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/prescriptions
 * Create new prescription
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      patientId,
      doctorId,
      medicines, // [{medicineId, quantity, dosage, frequency, days}]
      notes,
      expiryDate
    } = req.body;

    if (!medicines || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Medicines are required'
      });
    }

    // Insert prescription
    const query = `
      INSERT INTO pharmacy_prescriptions 
      (pharmacy_id, patient_id, doctor_id, notes, expiry_date, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'active', NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [pharmacyId, patientId, doctorId, notes, expiryDate]);
    const prescription = result.rows[0];

    // Insert prescription medicines
    for (const medicine of medicines) {
      const medQuery = `
        INSERT INTO pharmacy_prescription_medicines 
        (prescription_id, medicine_id, quantity, dosage, frequency, days)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      await db.query(medQuery, [
        prescription.id,
        medicine.medicineId,
        medicine.quantity,
        medicine.dosage,
        medicine.frequency,
        medicine.days
      ]);
    }

    res.json({
      success: true,
      message: 'Prescription created successfully',
      prescription
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/prescriptions
 * List all prescriptions
 */
router.get('/', async (req, res) => {
  try {
    const { pharmacyId, limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT p.*, pt.name as patient_name, d.name as doctor_name
      FROM pharmacy_prescriptions p
      LEFT JOIN patients pt ON p.patient_id = pt.id
      LEFT JOIN doctors d ON p.doctor_id = d.id
      WHERE p.pharmacy_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      prescriptions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

export default router;
