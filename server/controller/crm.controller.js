import { LeadActivity, LeadNote, LeadTask } from '../models/crm.model.intelligent.js';
import {
  createLeadForTenant,
  deleteLeadForTenant,
  fetchAllTenantLeads,
  fetchLeadForTenantOrThrow,
  listLeadsForTenant,
  updateLeadForTenant
} from '../services/crmLead.service.js';

// Helper: pick fields
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));

export const createLead = async (req, res) => {
  try {
    const data = pick(req.body, ['name','company','email','phone','source','stage','value','assignedTo','corporateId','tags','customFields']);
    const lead = await createLeadForTenant(req.tenantId, data);
    res.json({ success: true, lead });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const leadInstance = await fetchLeadForTenantOrThrow(req.tenantId, id);
    const prevStage = leadInstance.stage;
    const data = pick(req.body, ['name','company','email','phone','source','stage','value','assignedTo','corporateId','tags','customFields','isArchived','statusReason','closedAt']);
    const lead = await updateLeadForTenant(req.tenantId, id, data);
    if (req.body.stage && req.body.stage !== prevStage) {
      await LeadActivity.create({
        leadId: lead.id, type: 'Status Change', subject: `Stage: ${prevStage} → ${lead.stage}`,
        content: req.body.statusReason || '', createdBy: req.user?.id
      });
    }
    res.json({ success: true, lead });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const listLeads = async (req, res) => {
  try {
    const { stage, q, assignedTo, limit = 50, offset = 0 } = req.query;
    const leads = await listLeadsForTenant(req.tenantId, { stage, q, assignedTo });
    const start = Number(offset);
    const end = start + Number(limit);
    res.json({
      success:true,
      leads: leads.slice(start, end),
      pagination: { total: leads.length, offset: start, limit: Number(limit) }
    });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const getLead = async (req, res) => {
  try {
    const leadInstance = await fetchLeadForTenantOrThrow(req.tenantId, req.params.id);
    const lead = leadInstance.get({ plain: true });
    if (lead.customFields && lead.customFields.__tenantId) {
      const { __tenantId, ...rest } = lead.customFields;
      lead.customFields = rest;
    }
    const [activities, notes, tasks] = await Promise.all([
      LeadActivity.findAll({ where: { leadId: lead.id }, order: [['createdAt','DESC']] }),
      LeadNote.findAll({ where: { leadId: lead.id }, order: [['createdAt','DESC']] }),
      LeadTask.findAll({ where: { leadId: lead.id }, order: [['completed','ASC'],['dueDate','ASC']] })
    ]);
    res.json({ success:true, lead, activities, notes, tasks });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    await deleteLeadForTenant(req.tenantId, req.params.id);
    res.json({ success:true });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

// Activities
export const addActivity = async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await fetchLeadForTenantOrThrow(req.tenantId, leadId);
    const payload = pick(req.body, ['type','subject','content','dueDate','metadata']);
    const activity = await LeadActivity.create({ ...payload, leadId, createdBy: req.user?.id });
    await lead.update({
      lastActivityAt: new Date(),
      notesSnapshot: payload.type === 'Note' ? (payload.content || '') : lead.notesSnapshot
    });
    res.json({ success:true, activity });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const addNote = async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await fetchLeadForTenantOrThrow(req.tenantId, leadId);
    const note = await LeadNote.create({ leadId, authorId: req.user?.id, content: req.body.content, pinned: !!req.body.pinned });
    await lead.update({ notesSnapshot: req.body.content, lastActivityAt: new Date() });
    await LeadActivity.create({ leadId, type:'Note', subject:'Note added', content: req.body.content, createdBy: req.user?.id });
    res.json({ success:true, note });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const addTask = async (req, res) => {
  try {
    const { leadId } = req.params;
    await fetchLeadForTenantOrThrow(req.tenantId, leadId);
    const payload = pick(req.body, ['title','description','dueDate','priority','assignedTo']);
    const task = await LeadTask.create({ ...payload, leadId, createdBy: req.user?.id, completed: false });
    await LeadActivity.create({ leadId, type:'Task', subject: payload.title, content: payload.description || '', createdBy: req.user?.id, dueDate: payload.dueDate });
    res.json({ success:true, task });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const completeTask = async (req, res) => {
  try {
    const { id } = req.params; // task id
    const task = await LeadTask.findByPk(id);
    if (!task) return res.status(404).json({ success:false, message:'Task not found' });
    await fetchLeadForTenantOrThrow(req.tenantId, task.leadId);
    await task.update({ completed: true, completedAt: new Date() });
    await LeadActivity.create({ leadId: task.leadId, type:'Task', subject: `Task completed: ${task.title}`, content: task.description || '', createdBy: req.user?.id });
    res.json({ success:true, task });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const crmStats = async (req, res) => {
  try {
    // simple aggregates
    const stages = ['New','Qualified','Proposal','Negotiation','Closed Won','Closed Lost'];
    const leads = await fetchAllTenantLeads(req.tenantId);
    const counts = stages.reduce((acc, stage) => {
      acc[stage] = leads.filter((lead) => lead.stage === stage).length;
      return acc;
    }, {});
    const openStages = ['New','Qualified','Proposal','Negotiation'];
    const openValue = leads
      .filter((lead) => openStages.includes(lead.stage))
      .reduce((sum, lead) => sum + (parseFloat(lead.value) || 0), 0);
    const won = counts['Closed Won'] || 0;
    const lost = counts['Closed Lost'] || 0;
    const conversionRate = (won + lost) > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0;
    // Source counts
    const sourceCounts = leads
      .filter((lead) => lead.source)
      .reduce((acc, lead) => {
        acc[lead.source] = (acc[lead.source] || 0) + 1;
        return acc;
      }, {});
    res.json({ success:true, counts, openValue, conversionRate, sourceCounts });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export const crmReportsOverview = async (req, res) => {
  try {
    const now = Date.now();
    const leads = await fetchAllTenantLeads(req.tenantId);
    const stageAges = {};
    const stageTotals = {};
    leads.forEach(l => {
      const ageDays = (now - new Date(l.createdAt).getTime()) / (1000*60*60*24);
      stageAges[l.stage] = (stageAges[l.stage]||0) + ageDays;
      stageTotals[l.stage] = (stageTotals[l.stage]||0) + 1;
    });
    const avgStageAgeDays = Object.fromEntries(Object.entries(stageAges).map(([stage,totalAge]) => {
      const count = stageTotals[stage] || 1;
      return [stage, +(totalAge / count).toFixed(1)];
    }));
    const totalPipelineValue = leads.reduce((sum,l)=> sum + (parseFloat(l.value)||0), 0);
    res.json({ success:true, avgStageAgeDays, totalPipelineValue, totalLeads: leads.length });
  } catch (err) {
    res.status(400).json({ success:false, message: err.message });
  }
};

export default {
  createLead, updateLead, listLeads, getLead, deleteLead,
  addActivity, addNote, addTask, completeTask, crmStats, crmReportsOverview
};
