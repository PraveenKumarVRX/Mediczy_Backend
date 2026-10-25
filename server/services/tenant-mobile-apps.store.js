import { mobileOrigin, validateMobileApps } from './tenant-mobile-apps.service.js';
export function buildTenantMobileRepository({ Tenant, postgresSequelize, Op }) { return {
  get: id => Tenant.findByPk(id),
  async findByOrigin(origin) {
    return Tenant.findOne({ where: { 'settings.mobileApps.origin': origin }, attributes: ['id', 'name', 'status', 'settings'] });
  },
  async save(id, input, actor) {
    const origin = mobileOrigin(input?.origin);
    return postgresSequelize.transaction(async transaction => {
      // Serialize changes for the same origin, including changes to different tenants.
      await postgresSequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:origin, 0))', { replacements: { origin }, transaction });
      const tenant = await Tenant.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!tenant) return null;
      const config = validateMobileApps(input, tenant.settings?.mobileApps);
      const duplicate = await Tenant.findOne({ where: { id: { [Op.ne]: id }, 'settings.mobileApps.origin': origin }, transaction });
      if (duplicate) { const error = new Error('This server URL is already assigned to another tenant.'); error.status = 409; throw error; }
      const currentRevision = Number(tenant.settings?.mobileApps?.revision) || 0;
      if (input.revision !== currentRevision) { const error = new Error('Configuration changed. Reload before saving.'); error.status = 409; throw error; }
      await tenant.update({ settings: { ...(tenant.settings || {}), mobileApps: { ...config, updatedAt: new Date().toISOString(), updatedBy: actor } } }, { transaction });
      return tenant.settings.mobileApps;
    });
  },
}; }
