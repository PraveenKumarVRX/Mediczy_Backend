/**
 * Pharmacy Dashboard Routes
 * Endpoints for pharmacy dashboard statistics and overview
 */

import express from 'express';
import { Pharmacy } from '../../models/index.js';
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
 * GET /api/pharmacy/dashboard/stats
 * Get pharmacy dashboard statistics
 */
router.get('/stats', verifyPharmacyToken, async (req, res) => {
  try {
    // Mock data for now - replace with real database queries later
    const stats = {
      success: true,
      data: {
        totalMedicines: 2847,
        todaySales: 45280,
        todaySalesChange: '+8%',
        pendingOrders: 23,
        pendingOrdersChange: '-5%',
        lowStockItems: 18,
        lowStockItemsChange: '+3',
        totalCustomers: 1456,
        customersChange: '+12%',
        monthlyRevenue: 1285000,
        revenueChange: '+15%',
        prescriptionsToday: 34,
        prescriptionsChange: '+6%',
        expiringThisMonth: 12,
        expiringChange: '-2',
        recentSales: [
          { id: 'INV-001', customer: 'Rahul Sharma', items: 3, amount: 1250, time: '10 mins ago', status: 'Completed' },
          { id: 'INV-002', customer: 'Priya Patel', items: 5, amount: 2480, time: '25 mins ago', status: 'Completed' },
          { id: 'INV-003', customer: 'Amit Kumar', items: 2, amount: 890, time: '45 mins ago', status: 'Completed' },
          { id: 'INV-004', customer: 'Sneha Singh', items: 4, amount: 1650, time: '1 hour ago', status: 'Processing' },
          { id: 'INV-005', customer: 'Rajesh Verma', items: 1, amount: 350, time: '2 hours ago', status: 'Completed' },
        ],
        lowStockMedicines: [
          { name: 'Paracetamol 500mg', stock: 45, minStock: 100, unit: 'tablets', category: 'Pain Relief' },
          { name: 'Amoxicillin 250mg', stock: 23, minStock: 50, unit: 'capsules', category: 'Antibiotic' },
          { name: 'Metformin 500mg', stock: 67, minStock: 150, unit: 'tablets', category: 'Diabetes' },
          { name: 'Cetirizine 10mg', stock: 34, minStock: 75, unit: 'tablets', category: 'Allergy' },
          { name: 'Omeprazole 20mg', stock: 12, minStock: 40, unit: 'capsules', category: 'Gastric' },
        ],
        expiringMedicines: [
          { name: 'Aspirin 75mg', batch: 'BATCH-001', expiryDate: '2025-02-15', quantity: 250, daysLeft: 12 },
          { name: 'Ibuprofen 400mg', batch: 'BATCH-045', expiryDate: '2025-02-20', quantity: 180, daysLeft: 17 },
          { name: 'Cough Syrup 100ml', batch: 'BATCH-089', expiryDate: '2025-02-28', quantity: 45, daysLeft: 25 },
        ],
        topSellingMedicines: [
          { name: 'Paracetamol 500mg', sold: 1245, revenue: 12450, growth: '+8%' },
          { name: 'Cetirizine 10mg', sold: 856, revenue: 8560, growth: '+12%' },
          { name: 'Amoxicillin 500mg', sold: 645, revenue: 9675, growth: '+5%' },
          { name: 'Metformin 500mg', sold: 534, revenue: 8010, growth: '+15%' },
          { name: 'Vitamin D3 1000IU', sold: 478, revenue: 7170, growth: '+20%' },
        ],
      }
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/dashboard/quick-actions
 * Get recent activities and pending tasks
 */
router.get('/quick-actions', verifyPharmacyToken, async (req, res) => {
  try {
    const actions = {
      success: true,
      data: {
        pendingPrescriptions: [
          { id: 'RX-001', patientName: 'John Doe', doctor: 'Dr. Smith', items: 3, status: 'Pending', time: '5 mins ago' },
          { id: 'RX-002', patientName: 'Jane Smith', doctor: 'Dr. Patel', items: 2, status: 'Ready', time: '15 mins ago' },
        ],
        recentNotifications: [
          { type: 'alert', message: 'Paracetamol 500mg stock below minimum', time: '10 mins ago' },
          { type: 'info', message: 'New purchase order PO-045 created', time: '1 hour ago' },
          { type: 'warning', message: '3 medicines expiring in 15 days', time: '2 hours ago' },
        ],
        todayTasks: [
          { task: 'Verify expired medicines', priority: 'High', completed: false },
          { task: 'Update inventory count', priority: 'Medium', completed: true },
          { task: 'Process pending prescriptions', priority: 'High', completed: false },
          { task: 'Generate weekly report', priority: 'Low', completed: false },
        ]
      }
    };
    
    res.json(actions);
  } catch (error) {
    console.error('Quick actions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quick actions',
      error: error.message
    });
  }
});

export default router;
