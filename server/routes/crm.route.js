import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { 
  createLead, updateLead, listLeads, getLead, deleteLead,
  addActivity, addNote, addTask, completeTask, crmStats, crmReportsOverview
} from '../controller/crm.controller.js';
import { body } from 'express-validator';
import { validationResult } from 'express-validator';

// Generic validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success:false, errors: errors.array() });
  }
  next();
};

const router = express.Router();

// All CRM routes require admin access within a tenant context
router.use(authUser, requireRole('admin'), requireTenant);

// Leads CRUD
router.post('/leads', [
  body('name').isString().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('stage').optional().isIn(['New','Qualified','Proposal','Negotiation','Closed Won','Closed Lost']),
  body('value').optional().isFloat({ min:0 })
], validate, createLead);
router.get('/leads', listLeads);
router.get('/leads/:id', getLead);
router.put('/leads/:id', [
  body('name').optional().isString().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('stage').optional().isIn(['New','Qualified','Proposal','Negotiation','Closed Won','Closed Lost']),
  body('value').optional().isFloat({ min:0 })
], validate, updateLead);
router.delete('/leads/:id', deleteLead);

// Lead related items
router.post('/leads/:leadId/activities', addActivity);
router.post('/leads/:leadId/notes', [
  body('content').isString().trim().notEmpty()
], validate, addNote);
router.post('/leads/:leadId/tasks', [
  body('title').isString().trim().notEmpty(),
  body('priority').optional().isIn(['Low','Medium','High'])
], validate, addTask);
router.post('/tasks/:id/complete', completeTask);

// Stats
router.get('/stats', crmStats);
router.get('/reports/overview', crmReportsOverview);

export default router;
