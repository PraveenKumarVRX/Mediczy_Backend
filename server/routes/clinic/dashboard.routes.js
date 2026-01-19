import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
// import Clinic from '../../models/postgres/clinic.model.postgres.js'; // Lazy import
// import { postgresSequelize } from '../../db/postgres-sequelize.js'; // Lazy import

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

// Lazy import function for models
const getModels = async () => {
  const { default: Clinic } = await import('../../models/postgres/clinic.model.postgres.js');
  const { postgresSequelize } = await import('../../db/postgres-sequelize.js');
  return { Clinic, postgresSequelize };
};

// Middleware to verify clinic token
const verifyClinicToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Allow dev-clinic-token for development
    if (token === 'dev-clinic-token') {
      req.clinic = { id: 'clinic_dev', name: 'Sample Clinic' };
      req.clinicId = 'clinic_dev';
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'clinic') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // For now, skip database lookup and just use decoded token
    req.clinic = { id: decoded.id, name: decoded.name };
    req.clinicId = decoded.id;
    next();
  } catch (error) {
    // If token is invalid, return 401
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // For other errors, also return 401
    res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Get Dashboard Stats (with authentication)
router.get('/stats', verifyClinicToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Simulated stats - replace with actual database queries
    const stats = {
      todayAppointments: 24,
      patientsWaiting: 8,
      totalPatients: 1847,
      todayRevenue: 45890,
      monthlyRevenue: 845600,
      revenueGrowth: 12
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
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
    const { date, status } = req.query;

    // Simulated data - replace with actual appointment queries
    const appointments = [
      {
        id: 1,
        patient: 'Rajesh Kumar',
        time: '10:30 AM',
        type: 'Consultation',
        status: 'Waiting',
        phone: '+91-9876543210'
      },
      {
        id: 2,
        patient: 'Priya Sharma',
        time: '11:00 AM',
        type: 'Follow-up',
        status: 'Scheduled',
        phone: '+91-9876543211'
      },
      {
        id: 3,
        patient: 'Amit Patel',
        time: '11:30 AM',
        type: 'Check-up',
        status: 'Scheduled',
        phone: '+91-9876543212'
      },
      {
        id: 4,
        patient: 'Neha Singh',
        time: '12:00 PM',
        type: 'Consultation',
        status: 'Scheduled',
        phone: '+91-9876543213'
      }
    ];

    res.json({
      success: true,
      data: appointments,
      total: appointments.length
    });
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
    const { patientName, date, time, type, phone } = req.body;

    if (!patientName || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Patient name, date, and time are required'
      });
    }

    // Create appointment logic here
    const appointment = {
      id: Date.now(),
      clinicId: req.clinicId,
      patient: patientName,
      date,
      time,
      type: type || 'Consultation',
      status: 'Scheduled',
      phone,
      createdAt: new Date()
    };

    res.json({
      success: true,
      message: 'Appointment created successfully',
      data: appointment
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
    const { search, limit = 50, offset = 0 } = req.query;

    // Simulated data - replace with actual patient queries
    const patients = [
      {
        id: 1,
        name: 'Rahul Mehta',
        lastVisit: '2024-12-03',
        diagnosis: 'Diabetes Follow-up',
        nextVisit: '2024-12-17',
        phone: '+91-9876543220',
        age: 45,
        gender: 'Male'
      },
      {
        id: 2,
        name: 'Anita Desai',
        lastVisit: '2024-12-03',
        diagnosis: 'Hypertension',
        nextVisit: '2024-12-10',
        phone: '+91-9876543221',
        age: 52,
        gender: 'Female'
      },
      {
        id: 3,
        name: 'Vikram Joshi',
        lastVisit: '2024-12-02',
        diagnosis: 'Routine Check-up',
        nextVisit: '2025-01-02',
        phone: '+91-9876543222',
        age: 38,
        gender: 'Male'
      }
    ];

    res.json({
      success: true,
      data: patients,
      total: patients.length
    });
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
    const { name, phone, email, age, gender, address } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and phone are required'
      });
    }

    const patient = {
      id: Date.now(),
      clinicId: req.clinicId,
      name,
      phone,
      email,
      age,
      gender,
      address,
      createdAt: new Date()
    };

    res.json({
      success: true,
      message: 'Patient added successfully',
      data: patient
    });
  } catch (error) {
    console.error('Error adding patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add patient',
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
    const { Clinic } = await getModels();
    const clinic = await Clinic.findByPk(req.clinicId);

    res.json({
      success: true,
      data: {
        id: clinic.id,
        name: clinic.name,
        email: clinic.email,
        phone: clinic.phone,
        alternatePhone: clinic.alternatePhone,
        clinicType: clinic.clinicType,
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
        pincode: clinic.pincode,
        specializations: clinic.specializations,
        services: clinic.services,
        operatingHours: clinic.operatingHours,
        hasPharmacy: clinic.hasPharmacy,
        hasLab: clinic.hasLab,
        numberOfRooms: clinic.numberOfRooms,
        rating: clinic.rating,
        totalReviews: clinic.totalReviews,
        isVerified: clinic.isVerified
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
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.email;
    delete updates.registrationNumber;
    delete updates.rating;
    delete updates.totalReviews;

    await Clinic.update(updates, {
      where: { id: req.clinicId }
    });

    const updatedClinic = await Clinic.findByPk(req.clinicId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedClinic
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
