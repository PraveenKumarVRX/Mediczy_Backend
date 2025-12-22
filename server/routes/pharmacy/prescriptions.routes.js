/**
 * Pharmacy Prescriptions Routes
 * Endpoints for managing prescriptions
 */

import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

/**
 * Middleware to verify pharmacy token
 */
const verifyPharmacyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'pharmacy') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    req.pharmacyId = decoded.id;
    req.pharmacyToken = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * GET /api/pharmacy/prescriptions
 * Get all prescriptions
 */
router.get('/', verifyPharmacyToken, async (req, res) => {
  try {
    const prescriptions = {
      success: true,
      data: [
        {
          id: 'RX-001',
          prescriptionNumber: 'PRE-2025-001',
          patientName: 'John Doe',
          patientAge: 35,
          patientGender: 'Male',
          doctorName: 'Dr. Amit Smith',
          doctorLicense: 'DOC-LIC-001',
          date: '2025-02-03',
          medicines: [
            { name: 'Paracetamol 500mg', dosage: '1-0-1', duration: '5 days', quantity: 10 },
            { name: 'Amoxicillin 250mg', dosage: '1-1-1', duration: '7 days', quantity: 21 },
            { name: 'Cetirizine 10mg', dosage: '0-0-1', duration: '5 days', quantity: 5 }
          ],
          status: 'Pending',
          notes: 'Take after meals',
          uploadedImage: null,
          createdAt: '2025-02-03T09:30:00Z'
        },
        {
          id: 'RX-002',
          prescriptionNumber: 'PRE-2025-002',
          patientName: 'Jane Smith',
          patientAge: 28,
          patientGender: 'Female',
          doctorName: 'Dr. Priya Patel',
          doctorLicense: 'DOC-LIC-002',
          date: '2025-02-03',
          medicines: [
            { name: 'Metformin 500mg', dosage: '1-0-1', duration: '30 days', quantity: 60 },
            { name: 'Vitamin D3 1000IU', dosage: '0-0-1', duration: '30 days', quantity: 30 }
          ],
          status: 'Ready',
          notes: 'Regular follow-up required',
          uploadedImage: null,
          createdAt: '2025-02-03T08:15:00Z'
        },
        {
          id: 'RX-003',
          prescriptionNumber: 'PRE-2025-003',
          patientName: 'Amit Kumar',
          patientAge: 42,
          patientGender: 'Male',
          doctorName: 'Dr. Rajesh Verma',
          doctorLicense: 'DOC-LIC-003',
          date: '2025-02-02',
          medicines: [
            { name: 'Azithromycin 500mg', dosage: '0-1-0', duration: '3 days', quantity: 3 },
            { name: 'Omeprazole 20mg', dosage: '1-0-0', duration: '7 days', quantity: 7 }
          ],
          status: 'Completed',
          notes: 'Collected by patient',
          uploadedImage: null,
          createdAt: '2025-02-02T14:20:00Z'
        }
      ],
      stats: {
        total: 45,
        pending: 12,
        ready: 8,
        completed: 25
      }
    };
    
    res.json(prescriptions);
  } catch (error) {
    console.error('Prescriptions fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/prescriptions/:id
 * Get prescription details
 */
router.get('/:id', verifyPharmacyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    res.json({
      success: true,
      data: {
        id,
        prescriptionNumber: 'PRE-2025-001',
        patientName: 'John Doe',
        patientAge: 35,
        patientGender: 'Male',
        patientPhone: '+91-9876543210',
        doctorName: 'Dr. Amit Smith',
        doctorLicense: 'DOC-LIC-001',
        date: '2025-02-03',
        medicines: [
          { name: 'Paracetamol 500mg', dosage: '1-0-1', duration: '5 days', quantity: 10, available: true },
          { name: 'Amoxicillin 250mg', dosage: '1-1-1', duration: '7 days', quantity: 21, available: true },
          { name: 'Cetirizine 10mg', dosage: '0-0-1', duration: '5 days', quantity: 5, available: true }
        ],
        status: 'Pending',
        notes: 'Take after meals',
        uploadedImage: null,
        createdAt: '2025-02-03T09:30:00Z',
        estimatedTotal: 425.00
      }
    });
  } catch (error) {
    console.error('Prescription detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescription details',
      error: error.message
    });
  }
});

/**
 * PUT /api/pharmacy/prescriptions/:id/status
 * Update prescription status
 */
router.put('/:id/status', verifyPharmacyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    res.json({
      success: true,
      message: `Prescription status updated to ${status}`,
      data: {
        id,
        status,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prescription status',
      error: error.message
    });
  }
});

/**
 * POST /api/pharmacy/prescriptions/upload
 * Upload prescription image
 */
router.post('/upload', verifyPharmacyToken, async (req, res) => {
  try {
    // Mock response for prescription upload
    res.status(201).json({
      success: true,
      message: 'Prescription uploaded successfully',
      data: {
        id: `RX-${Math.floor(Math.random() * 10000)}`,
        prescriptionNumber: `PRE-2025-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        uploadedAt: new Date().toISOString(),
        status: 'Pending Verification'
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload prescription',
      error: error.message
    });
  }
});

export default router;
