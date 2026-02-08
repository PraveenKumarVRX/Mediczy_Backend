import TenantPartner from '../models/postgres/tenant-partner.model.postgres.js';

const normalizeId = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const tenantPartnerService = {
  async isActivePartner(corporateTenantId, partnerTenantId) {
    const corporateId = normalizeId(corporateTenantId);
    const partnerId = normalizeId(partnerTenantId);
    if (!corporateId || !partnerId) return false;

    const record = await TenantPartner.findOne({
      where: {
        corporate_tenant_id: corporateId,
        partner_tenant_id: partnerId,
        status: 'active'
      }
    });

    return Boolean(record);
  },

  async listActivePartnerIds(corporateTenantId) {
    const corporateId = normalizeId(corporateTenantId);
    if (!corporateId) return [];

    const partners = await TenantPartner.findAll({
      where: {
        corporate_tenant_id: corporateId,
        status: 'active'
      },
      attributes: ['partner_tenant_id']
    });

    return partners.map((partner) => partner.partner_tenant_id);
  }
};

export default tenantPartnerService;
