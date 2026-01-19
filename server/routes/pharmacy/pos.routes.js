/**
 * Pharmacy POS (Point of Sale) Routes
 * Endpoints for managing sales transactions
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
 * GET /api/pharmacy/pos/transactions
 * Get all sales transactions
 */
router.get('/transactions', verifyPharmacyToken, async (req, res) => {
  try {
    const transactions = {
      success: true,
      data: [
        {
          id: 'TXN-001',
          invoiceNumber: 'INV-2025-001',
          customerName: 'Rahul Sharma',
          customerId: 'CUST-001',
          items: [
            { name: 'Paracetamol 500mg', quantity: 10, price: 10.00, total: 100.00 },
            { name: 'Cetirizine 10mg', quantity: 5, price: 8.00, total: 40.00 }
          ],
          subtotal: 140.00,
          discount: 10.00,
          tax: 5.60,
          total: 135.60,
          paymentMethod: 'Cash',
          status: 'Completed',
          createdAt: '2025-02-03T10:30:00Z',
          createdBy: 'Pharmacy Admin'
        },
        {
          id: 'TXN-002',
          invoiceNumber: 'INV-2025-002',
          customerName: 'Priya Patel',
          customerId: 'CUST-002',
          items: [
            { name: 'Amoxicillin 250mg', quantity: 6, price: 25.00, total: 150.00 },
            { name: 'Vitamin D3 1000IU', quantity: 2, price: 18.00, total: 36.00 }
          ],
          subtotal: 186.00,
          discount: 0,
          tax: 7.44,
          total: 193.44,
          paymentMethod: 'Card',
          status: 'Completed',
          createdAt: '2025-02-03T11:15:00Z',
          createdBy: 'Pharmacy Admin'
        }
      ]
    };

    res.json(transactions);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

/**
 * POST /api/pharmacy/pos/sale
 * Process a new sale
 */
router.post('/sale', verifyPharmacyToken, async (req, res) => {
  try {
    const saleData = req.body;

    // Mock response - replace with actual database insert and inventory update
    const invoiceNumber = `INV-2025-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      data: {
        id: `TXN-${Math.floor(Math.random() * 10000)}`,
        invoiceNumber,
        ...saleData,
        createdAt: new Date().toISOString(),
        status: 'Completed'
      }
    });
  } catch (error) {
    console.error('Sale processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process sale',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/pos/invoice/:invoiceNumber
 * Get invoice details
 */
router.get('/invoice/:invoiceNumber', verifyPharmacyToken, async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    // Mock invoice data
    res.json({
      success: true,
      data: {
        invoiceNumber,
        customerName: 'Rahul Sharma',
        customerPhone: '+91-9876543210',
        date: new Date().toISOString(),
        items: [
          { name: 'Paracetamol 500mg', quantity: 10, price: 10.00, total: 100.00 },
          { name: 'Cetirizine 10mg', quantity: 5, price: 8.00, total: 40.00 }
        ],
        subtotal: 140.00,
        discount: 10.00,
        tax: 5.60,
        total: 135.60,
        paymentMethod: 'Cash',
        pharmacyName: 'MediCzy Pharmacy',
        pharmacyAddress: '123 Main Street, Mumbai, Maharashtra',
        pharmacyPhone: '+91-9999999999',
        pharmacyLicense: 'PH-LIC-2024-001'
      }
    });
  } catch (error) {
    console.error('Invoice fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/pos/today-sales
 * Get today's sales summary
 */
router.get('/today-sales', verifyPharmacyToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        totalSales: 45280,
        totalTransactions: 89,
        totalItems: 234,
        cashSales: 28450,
        cardSales: 14830,
        upiSales: 2000,
        averageTransaction: 508.76,
        topSellingItems: [
          { name: 'Paracetamol 500mg', quantity: 45, revenue: 450 },
          { name: 'Cetirizine 10mg', quantity: 32, revenue: 256 },
          { name: 'Amoxicillin 250mg', quantity: 28, revenue: 700 }
        ]
      }
    });
  } catch (error) {
    console.error('Today sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s sales',
      error: error.message
    });
  }
});

export default router;
