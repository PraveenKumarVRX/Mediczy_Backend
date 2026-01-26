import express from 'express';
const router = express.Router();
import CarePlan from '../models/care-plan.model.js';
import { authDoctor } from '../middleware/doctor.middleware.js';
import { notificationService } from '../services/notification.service.js';

// Get care plans for a patient
router.get('/patient/:patientId', authDoctor, async (req, res) => {
  try {
    const carePlans = await CarePlan.findAll({
      where: { 
        patientId: req.params.patientId,
        doctorId: req.doctor.id
      },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({ success: true, data: carePlans });
  } catch (error) {
    console.error('Fetch care plans error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch care plans', error: error.message });
  }
});

// Create new care plan
router.post('/', authDoctor, async (req, res) => {
  try {
    const carePlan = await CarePlan.create({
      ...req.body,
      doctorId: req.doctor.id
    });
    
    // Send notification to patient
    await notificationService.sendNotification({
      userId: req.body.patientId,
      type: 'care_plan_created',
      title: 'New Care Plan',
      message: 'Your doctor has created a new care plan for you',
      data: { carePlanId: carePlan.id }
    });
    
    res.status(201).json({ success: true, data: carePlan });
  } catch (error) {
    console.error('Create care plan error:', error);
    res.status(500).json({ success: false, message: 'Failed to create care plan', error: error.message });
  }
});

// Update care plan
router.put('/:id', authDoctor, async (req, res) => {
  try {
    const carePlan = await CarePlan.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!carePlan) {
      return res.status(404).json({ success: false, message: 'Care plan not found' });
    }
    
    await carePlan.update(req.body);
    res.json({ success: true, data: carePlan });
  } catch (error) {
    console.error('Update care plan error:', error);
    res.status(500).json({ success: false, message: 'Failed to update care plan', error: error.message });
  }
});

// Update task status in care plan
router.patch('/:id/tasks/:taskId', authDoctor, async (req, res) => {
  try {
    const carePlan = await CarePlan.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!carePlan) {
      return res.status(404).json({ success: false, message: 'Care plan not found' });
    }
    
    const tasks = carePlan.tasks || [];
    const taskIndex = tasks.findIndex(t => t.id === req.params.taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    
    tasks[taskIndex] = { ...tasks[taskIndex], ...req.body };
    await carePlan.update({ tasks });
    
    // Recalculate completion percentage
    const completedTasks = tasks.filter(t => t.completed).length;
    const completionPercentage = (completedTasks / tasks.length) * 100;
    await carePlan.update({ completionPercentage });
    
    res.json({ success: true, data: carePlan });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: 'Failed to update task', error: error.message });
  }
});

// Get active care plans with upcoming reminders
router.get('/active-reminders', authDoctor, async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const carePlans = await CarePlan.findAll({
      where: {
        doctorId: req.doctor.id,
        status: 'active',
        reminders: {
          [Op.not]: null
        }
      }
    });
    
    // Filter for upcoming reminders
    const upcomingReminders = carePlans.filter(cp => {
      if (!cp.reminders || cp.reminders.length === 0) return false;
      return cp.reminders.some(r => new Date(r.scheduledFor) <= tomorrow && r.status === 'pending');
    });
    
    res.json({ success: true, data: upcomingReminders });
  } catch (error) {
    console.error('Fetch active reminders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active reminders', error: error.message });
  }
});

// Send reminder for care plan
router.post('/:id/send-reminder', authDoctor, async (req, res) => {
  try {
    const carePlan = await CarePlan.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!carePlan) {
      return res.status(404).json({ success: false, message: 'Care plan not found' });
    }
    
    const { reminderType, message } = req.body;
    
    await notificationService.sendNotification({
      userId: carePlan.patientId,
      type: 'care_plan_reminder',
      title: `Care Plan Reminder: ${reminderType}`,
      message: message || 'You have a care plan task to complete',
      data: { carePlanId: carePlan.id },
      priority: 'high'
    });
    
    res.json({ success: true, message: 'Reminder sent successfully' });
  } catch (error) {
    console.error('Send reminder error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reminder', error: error.message });
  }
});

export default router;
