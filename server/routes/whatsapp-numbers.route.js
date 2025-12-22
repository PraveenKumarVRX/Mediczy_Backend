/**
 * WhatsApp Numbers Routes
 * API endpoints for managing multiple WhatsApp numbers
 */

import { Router } from 'express';
import WhatsAppNumber from '../models/whatsapp-number.model.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authUser);
router.use(requireRole('admin'));

// GET all WhatsApp numbers
router.get('/', async (req, res) => {
  try {
    const { provider, route, active, verified } = req.query;
    const where = {};
    if (provider) where.provider = provider;
    if (route) where.route = route;
    if (active !== undefined) where.active = active === 'true';
    if (verified !== undefined) where.verified = verified === 'true';
    
    const numbers = await WhatsAppNumber.findAll({
      where,
      order: [['route', 'ASC'], ['priority', 'ASC'], ['createdAt', 'DESC']]
    });
    
    const enhancedNumbers = numbers.map(num => ({
      ...num.toJSON(),
      formattedNumber: num.getFormattedNumber(),
      routeDisplayName: num.getRouteDisplayName(),
      usagePercentage: num.getUsagePercentage()
    }));
    
    const stats = { total: numbers.length, active: numbers.filter(n => n.active).length, verified: numbers.filter(n => n.verified).length, byProvider: {}, byRoute: {}, totalMessagesSent: 0, totalMessagesToday: 0 };
    numbers.forEach(num => {
      stats.byProvider[num.provider] = (stats.byProvider[num.provider] || 0) + 1;
      stats.byRoute[num.route] = (stats.byRoute[num.route] || 0) + 1;
      stats.totalMessagesSent += num.stats.totalMessagesSent || 0;
      stats.totalMessagesToday += num.stats.messagesToday || 0;
    });
    
    res.json({ success: true, data: enhancedNumbers, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch WhatsApp numbers', error: error.message });
  }
});

// GET single WhatsApp number
router.get('/:id', async (req, res) => {
  try {
    const number = await WhatsAppNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'WhatsApp number not found' });
    res.json({ success: true, data: { ...number.toJSON(), formattedNumber: number.getFormattedNumber(), routeDisplayName: number.getRouteDisplayName(), usagePercentage: number.getUsagePercentage() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch WhatsApp number', error: error.message });
  }
});

// POST create WhatsApp number
router.post('/', async (req, res) => {
  try {
    const numberData = { ...req.body, createdBy: req.user.id, updatedBy: req.user.id };
    const existingNumber = await WhatsAppNumber.findOne({ where: { phoneNumber: numberData.phoneNumber } });
    if (existingNumber) return res.status(400).json({ success: false, message: 'This phone number is already registered' });
    const number = await WhatsAppNumber.create(numberData);
    res.status(201).json({ success: true, message: 'WhatsApp number added successfully', data: { ...number.toJSON(), formattedNumber: number.getFormattedNumber(), routeDisplayName: number.getRouteDisplayName() } });
  } catch (error) {
    if (error.name === 'SequelizeValidationError') return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors.map(e => e.message) });
    res.status(500).json({ success: false, message: 'Failed to create WhatsApp number', error: error.message });
  }
});

// PUT update WhatsApp number
router.put('/:id', async (req, res) => {
  try {
    const number = await WhatsAppNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'WhatsApp number not found' });
    if (number.verified && req.body.phoneNumber && req.body.phoneNumber !== number.phoneNumber) {
      return res.status(400).json({ success: false, message: 'Cannot change phone number for verified numbers. Please create a new number instead.' });
    }
    await number.update({ ...req.body, updatedBy: req.user.id });
    res.json({ success: true, message: 'WhatsApp number updated successfully', data: { ...number.toJSON(), formattedNumber: number.getFormattedNumber(), routeDisplayName: number.getRouteDisplayName() } });
  } catch (error) {
    if (error.name === 'SequelizeValidationError') return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors.map(e => e.message) });
    res.status(500).json({ success: false, message: 'Failed to update WhatsApp number', error: error.message });
  }
});

// DELETE WhatsApp number
router.delete('/:id', async (req, res) => {
  try {
    const number = await WhatsAppNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'WhatsApp number not found' });
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastMessageDate = number.stats.lastMessageSentAt ? new Date(number.stats.lastMessageSentAt) : null;
    if (number.active && lastMessageDate && lastMessageDate > oneDayAgo) {
      return res.status(400).json({ success: false, message: 'Cannot delete number with recent activity. Please deactivate it first and wait 24 hours.' });
    }
    await number.destroy();
    res.json({ success: true, message: 'WhatsApp number deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete WhatsApp number', error: error.message });
  }
});

// PATCH toggle active
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const number = await WhatsAppNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'WhatsApp number not found' });
    number.active = !number.active;
    number.updatedBy = req.user.id;
    await number.save();
    res.json({ success: true, message: `WhatsApp number ${number.active ? 'activated' : 'deactivated'} successfully`, data: { ...number.toJSON(), formattedNumber: number.getFormattedNumber(), routeDisplayName: number.getRouteDisplayName() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle WhatsApp number status', error: error.message });
  }
});

// PATCH verify
router.patch('/:id/verify', async (req, res) => {
  try {
    const number = await WhatsAppNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'WhatsApp number not found' });
    number.verified = true;
    number.updatedBy = req.user.id;
    await number.save();
    res.json({ success: true, message: 'WhatsApp number verified successfully', data: { ...number.toJSON(), formattedNumber: number.getFormattedNumber(), routeDisplayName: number.getRouteDisplayName() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to verify WhatsApp number', error: error.message });
  }
});

// POST test
router.post('/:id/test', async (req, res) => {
  try {
    const number = await WhatsAppNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'WhatsApp number not found' });
    if (!number.active) return res.status(400).json({ success: false, message: 'Cannot test inactive number' });
    const { testPhoneNumber } = req.body;
    if (!testPhoneNumber) return res.status(400).json({ success: false, message: 'Test phone number is required' });
    res.json({ success: true, message: 'Test message sent successfully', data: { from: number.phoneNumber, to: testPhoneNumber, provider: number.provider, timestamp: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to test WhatsApp number', error: error.message });
  }
});

// GET best number for route
router.get('/route/:route/best', async (req, res) => {
  try {
    const { route } = req.params;
    const { provider } = req.query;
    const number = await WhatsAppNumber.getBestNumberForRoute(route, provider);
    if (!number) return res.status(404).json({ success: false, message: `No available WhatsApp number found for route: ${route}` });
    res.json({ success: true, data: { ...number.toJSON(), formattedNumber: number.getFormattedNumber(), routeDisplayName: number.getRouteDisplayName() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to find best WhatsApp number', error: error.message });
  }
});

// GET stats overview
router.get('/stats/overview', async (req, res) => {
  try {
    const numbers = await WhatsAppNumber.findAll();
    const stats = {
      overview: { totalNumbers: numbers.length, activeNumbers: numbers.filter(n => n.active).length, verifiedNumbers: numbers.filter(n => n.verified).length, availableNumbers: numbers.filter(n => n.isAvailable()).length },
      byProvider: {}, byRoute: {},
      usage: { totalMessagesSent: 0, totalMessagesReceived: 0, messagesToday: 0, messagesThisMonth: 0 },
      limits: { totalDailyLimit: 0, totalMonthlyLimit: 0, dailyUsagePercentage: 0, monthlyUsagePercentage: 0 }
    };
    numbers.forEach(num => {
      if (!stats.byProvider[num.provider]) stats.byProvider[num.provider] = { total: 0, active: 0, verified: 0, messagesSent: 0 };
      stats.byProvider[num.provider].total++;
      if (num.active) stats.byProvider[num.provider].active++;
      if (num.verified) stats.byProvider[num.provider].verified++;
      stats.byProvider[num.provider].messagesSent += num.stats.totalMessagesSent || 0;
      if (!stats.byRoute[num.route]) stats.byRoute[num.route] = { total: 0, active: 0, messagesSent: 0 };
      stats.byRoute[num.route].total++;
      if (num.active) stats.byRoute[num.route].active++;
      stats.byRoute[num.route].messagesSent += num.stats.totalMessagesSent || 0;
      stats.usage.totalMessagesSent += num.stats.totalMessagesSent || 0;
      stats.usage.totalMessagesReceived += num.stats.totalMessagesReceived || 0;
      stats.usage.messagesToday += num.stats.messagesToday || 0;
      stats.usage.messagesThisMonth += num.stats.messagesThisMonth || 0;
      stats.limits.totalDailyLimit += num.dailyLimit || 0;
      stats.limits.totalMonthlyLimit += num.monthlyLimit || 0;
    });
    if (stats.limits.totalDailyLimit > 0) stats.limits.dailyUsagePercentage = Math.round((stats.usage.messagesToday / stats.limits.totalDailyLimit) * 100);
    if (stats.limits.totalMonthlyLimit > 0) stats.limits.monthlyUsagePercentage = Math.round((stats.usage.messagesThisMonth / stats.limits.totalMonthlyLimit) * 100);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch statistics', error: error.message });
  }
});

// POST bulk import
router.post('/bulk/import', async (req, res) => {
  try {
    const { numbers } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) return res.status(400).json({ success: false, message: 'Numbers array is required and must not be empty' });
    const results = { total: numbers.length, created: 0, failed: 0, errors: [] };
    for (const numberData of numbers) {
      try {
        const data = { ...numberData, createdBy: req.user.id, updatedBy: req.user.id };
        const exists = await WhatsAppNumber.findOne({ where: { phoneNumber: data.phoneNumber } });
        if (exists) { results.failed++; results.errors.push({ phoneNumber: data.phoneNumber, error: 'Number already exists' }); continue; }
        await WhatsAppNumber.create(data);
        results.created++;
      } catch (error) {
        results.failed++;
        results.errors.push({ phoneNumber: numberData.phoneNumber, error: error.message });
      }
    }
    res.json({ success: true, message: `Imported ${results.created} of ${results.total} numbers`, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to import WhatsApp numbers', error: error.message });
  }
});

export default router;
