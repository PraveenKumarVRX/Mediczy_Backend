import { Op } from 'sequelize';
import { Lead } from '../models/crm.model.intelligent.js';

const TENANT_FIELD = '__tenantId';

const ensureTenantContext = (tenantId) => {
  if (!tenantId) {
    const error = new Error('Tenant context required for CRM operations');
    error.status = 400;
    throw error;
  }
};

const getCustomFields = (lead) => {
  if (!lead) return {};
  if (typeof lead.get === 'function') {
    return lead.get('customFields') || {};
  }
  return lead.customFields || {};
};

const stampCustomFields = (customFields = {}, tenantId, fallback = {}) => ({
  ...(fallback || {}),
  ...(customFields || {}),
  [TENANT_FIELD]: tenantId
});

const matchesTenant = (lead, tenantId) => getCustomFields(lead)[TENANT_FIELD] === tenantId;

const serializeLead = (lead) => {
  if (!lead) return lead;
  const plain = typeof lead.get === 'function' ? lead.get({ plain: true }) : { ...lead };
  if (plain.customFields && typeof plain.customFields === 'object') {
    const { [TENANT_FIELD]: _ignored, ...rest } = plain.customFields;
    plain.customFields = rest;
  }
  return plain;
};

export const fetchLeadForTenantOrThrow = async (tenantId, leadId) => {
  ensureTenantContext(tenantId);
  const lead = await Lead.findByPk(leadId);
  if (!lead || !matchesTenant(lead, tenantId)) {
    const error = new Error('Lead not found');
    error.status = 404;
    throw error;
  }
  return lead;
};

export const createLeadForTenant = async (tenantId, payload) => {
  ensureTenantContext(tenantId);
  const data = {
    ...payload,
    customFields: stampCustomFields(payload.customFields, tenantId)
  };
  const lead = await Lead.create(data);
  return serializeLead(lead);
};

export const updateLeadForTenant = async (tenantId, leadId, payload) => {
  const lead = await fetchLeadForTenantOrThrow(tenantId, leadId);
  const currentFields = getCustomFields(lead);
  const data = {
    ...payload,
    customFields: stampCustomFields(payload.customFields, tenantId, currentFields)
  };
  await lead.update(data);
  return serializeLead(lead);
};

export const deleteLeadForTenant = async (tenantId, leadId) => {
  const lead = await fetchLeadForTenantOrThrow(tenantId, leadId);
  await lead.destroy();
};

export const listLeadsForTenant = async (tenantId, { stage, assignedTo, q }) => {
  ensureTenantContext(tenantId);
  const where = {};
  if (stage) where.stage = stage;
  if (assignedTo) where.assignedTo = assignedTo;
  if (q) {
    const like = { [Op.like]: `%${q}%` };
    where[Op.or] = [
      { name: like },
      { company: like },
      { email: like },
      { phone: like }
    ];
  }
  const leads = await Lead.findAll({
    where,
    order: [['updatedAt', 'DESC']]
  });
  return leads.filter((lead) => matchesTenant(lead, tenantId)).map(serializeLead);
};

export const fetchAllTenantLeads = async (tenantId) => {
  ensureTenantContext(tenantId);
  const leads = await Lead.findAll({
    order: [['updatedAt', 'DESC']]
  });
  return leads.filter((lead) => matchesTenant(lead, tenantId)).map(serializeLead);
};
