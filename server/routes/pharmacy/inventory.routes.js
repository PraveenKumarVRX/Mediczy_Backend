/**
 * Pharmacy Inventory Routes
 * Endpoints for managing pharmacy inventory
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';

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

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
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
 * GET /api/pharmacy/inventory
 * Get all medicines in inventory
 */
router.get('/', verifyPharmacyToken, async (req, res) => {
  try {
    // Mock inventory data - replace with database queries later
    const inventory = {
      success: true,
      data: {
        total: 2847,
        medicines: [
          {
            id: 1,
            name: 'Paracetamol 500mg',
            genericName: 'Acetaminophen',
            manufacturer: 'GSK Pharmaceuticals',
            category: 'Pain Relief',
            stock: 450,
            minStock: 100,
            price: 10.00,
            mrp: 12.50,
            unit: 'tablets',
            batchNumber: 'BATCH-001',
            expiryDate: '2026-06-30',
            location: 'Shelf A-1',
            status: 'In Stock'
          },
          {
            id: 2,
            name: 'Amoxicillin 250mg',
            genericName: 'Amoxicillin',
            manufacturer: 'Cipla Ltd',
            category: 'Antibiotic',
            stock: 23,
            minStock: 50,
            price: 25.00,
            mrp: 30.00,
            unit: 'capsules',
            batchNumber: 'BATCH-045',
            expiryDate: '2025-12-15',
            location: 'Shelf B-3',
            status: 'Low Stock'
          },
          {
            id: 3,
            name: 'Metformin 500mg',
            genericName: 'Metformin HCl',
            manufacturer: 'Sun Pharma',
            category: 'Diabetes',
            stock: 67,
            minStock: 150,
            price: 15.00,
            mrp: 18.00,
            unit: 'tablets',
            batchNumber: 'BATCH-089',
            expiryDate: '2026-03-20',
            location: 'Shelf C-2',
            status: 'Low Stock'
          },
          {
            id: 4,
            name: 'Cetirizine 10mg',
            genericName: 'Cetirizine Hydrochloride',
            manufacturer: 'Dr. Reddy\'s',
            category: 'Allergy',
            stock: 34,
            minStock: 75,
            price: 8.00,
            mrp: 10.00,
            unit: 'tablets',
            batchNumber: 'BATCH-112',
            expiryDate: '2025-08-10',
            location: 'Shelf A-4',
            status: 'Low Stock'
          },
          {
            id: 5,
            name: 'Omeprazole 20mg',
            genericName: 'Omeprazole',
            manufacturer: 'Lupin Ltd',
            category: 'Gastric',
            stock: 180,
            minStock: 40,
            price: 12.00,
            mrp: 15.00,
            unit: 'capsules',
            batchNumber: 'BATCH-156',
            expiryDate: '2026-01-25',
            location: 'Shelf B-1',
            status: 'In Stock'
          },
          {
            id: 6,
            name: 'Azithromycin 500mg',
            genericName: 'Azithromycin',
            manufacturer: 'Abbott India',
            category: 'Antibiotic',
            stock: 345,
            minStock: 60,
            price: 45.00,
            mrp: 55.00,
            unit: 'tablets',
            batchNumber: 'BATCH-178',
            expiryDate: '2026-04-15',
            location: 'Shelf B-4',
            status: 'In Stock'
          },
          {
            id: 7,
            name: 'Vitamin D3 1000IU',
            genericName: 'Cholecalciferol',
            manufacturer: 'Mankind Pharma',
            category: 'Vitamins',
            stock: 567,
            minStock: 100,
            price: 18.00,
            mrp: 22.00,
            unit: 'capsules',
            batchNumber: 'BATCH-201',
            expiryDate: '2026-09-30',
            location: 'Shelf D-1',
            status: 'In Stock'
          },
          {
            id: 8,
            name: 'Aspirin 75mg',
            genericName: 'Acetylsalicylic Acid',
            manufacturer: 'Bayer Pharmaceuticals',
            category: 'Cardiovascular',
            stock: 250,
            minStock: 80,
            price: 6.00,
            mrp: 8.00,
            unit: 'tablets',
            batchNumber: 'BATCH-001',
            expiryDate: '2025-02-15',
            location: 'Shelf C-3',
            status: 'Expiring Soon'
          },
        ]
      }
    };

    res.json(inventory);
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/inventory/:id
 * Get specific medicine details
 */
router.get('/:id', verifyPharmacyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Mock medicine detail - replace with database query
    const medicine = {
      success: true,
      data: {
        id: parseInt(id),
        name: 'Paracetamol 500mg',
        genericName: 'Acetaminophen',
        manufacturer: 'GSK Pharmaceuticals',
        category: 'Pain Relief',
        description: 'Used for relief of mild to moderate pain and fever',
        stock: 450,
        minStock: 100,
        price: 10.00,
        mrp: 12.50,
        unit: 'tablets',
        batchDetails: [
          { batchNumber: 'BATCH-001', quantity: 250, expiryDate: '2026-06-30', location: 'Shelf A-1' },
          { batchNumber: 'BATCH-002', quantity: 200, expiryDate: '2026-08-15', location: 'Shelf A-2' }
        ],
        salesHistory: [
          { date: '2025-02-03', quantity: 45, amount: 562.50 },
          { date: '2025-02-02', quantity: 38, amount: 475.00 },
          { date: '2025-02-01', quantity: 52, amount: 650.00 },
        ]
      }
    };

    res.json(medicine);
  } catch (error) {
    console.error('Medicine detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicine details',
      error: error.message
    });
  }
});

/**
 * POST /api/pharmacy/inventory
 * Add new medicine to inventory
 */
router.post('/', verifyPharmacyToken, async (req, res) => {
  try {
    const medicineData = req.body;

    // Mock response - replace with actual database insert
    res.status(201).json({
      success: true,
      message: 'Medicine added to inventory',
      data: {
        id: Math.floor(Math.random() * 10000),
        ...medicineData,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Add medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add medicine',
      error: error.message
    });
  }
});

/**
 * PUT /api/pharmacy/inventory/:id
 * Update medicine in inventory
 */
router.put('/:id', verifyPharmacyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Mock response - replace with actual database update
    res.json({
      success: true,
      message: 'Medicine updated successfully',
      data: {
        id: parseInt(id),
        ...updateData,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update medicine',
      error: error.message
    });
  }
});

/**
 * DELETE /api/pharmacy/inventory/:id
 * Remove medicine from inventory
 */
router.delete('/:id', verifyPharmacyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Mock response - replace with actual database delete
    res.json({
      success: true,
      message: 'Medicine removed from inventory',
      data: { id: parseInt(id) }
    });
  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete medicine',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/inventory/search/:query
 * Search medicines by name, generic name, or category
 */
router.get('/search/:query', verifyPharmacyToken, async (req, res) => {
  try {
    const { query } = req.params;

    // Mock search results - replace with database search
    res.json({
      success: true,
      query,
      results: [
        {
          id: 1,
          name: 'Paracetamol 500mg',
          genericName: 'Acetaminophen',
          category: 'Pain Relief',
          stock: 450,
          price: 10.00
        }
      ]
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
});

export default router;
