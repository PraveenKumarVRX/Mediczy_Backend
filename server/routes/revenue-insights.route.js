import express from 'express';
const router = express.Router();
import { Op, fn, col } from 'sequelize';
import RevenueInsight from '../models/revenue-insight.model.js';
import { authDoctor } from '../middleware/doctor.middleware.js';

// Get revenue insights
router.get('/', authDoctor, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = { doctorId: req.doctor.id };
    
    if (startDate && endDate) {
      where.serviceDate = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }
    
    const insights = await RevenueInsight.findAll({ where });
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error('Fetch revenue insights error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue insights', error: error.message });
  }
});

// Create revenue insight
router.post('/', authDoctor, async (req, res) => {
  try {
    const insight = await RevenueInsight.create({
      ...req.body,
      doctorId: req.doctor.id
    });
    res.status(201).json({ success: true, data: insight });
  } catch (error) {
    console.error('Create revenue insight error:', error);
    res.status(500).json({ success: false, message: 'Failed to create revenue insight', error: error.message });
  }
});

// Get revenue summary
router.get('/summary', authDoctor, async (req, res) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const summary = await RevenueInsight.findAll({
      where: {
        doctorId: req.doctor.id,
        serviceDate: { [Op.gte]: firstDayOfMonth }
      },
      attributes: [
        [fn('SUM', col('chargedAmount')), 'totalCharged'],
        [fn('SUM', col('paidAmount')), 'totalPaid'],
        [fn('AVG', col('profitMargin')), 'avgProfitMargin'],
        [fn('COUNT', col('id')), 'totalServices']
      ]
    });
    
    const denials = await RevenueInsight.count({
      where: {
        doctorId: req.doctor.id,
        claimStatus: 'denied',
        serviceDate: { [Op.gte]: firstDayOfMonth }
      }
    });
    
    res.json({ success: true, data: { ...summary[0].dataValues, denials } });
  } catch (error) {
    console.error('Fetch revenue summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue summary', error: error.message });
  }
});

export default router;
