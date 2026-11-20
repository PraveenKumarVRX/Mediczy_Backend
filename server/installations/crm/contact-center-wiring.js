/** Wires the contact-center service for this dedicated runtime: a tenant-scoped transaction
 * helper that sets the RLS session variable every cc_* policy checks, a capability-based
 * authorize() middleware, and the service itself. Recording storage, AI knowledge search and
 * the live-transcription gateway are intentionally left unconfigured (undefined) — those are
 * optional dependencies the service only touches when a caller actually invokes that specific
 * advanced feature (record:true, knowledge search, live gateway events), not core calling. */
import sharedPool from '../../db/pgPool.js';
import { hasCRMCapability, CRM_CAPABILITY_ROLES } from '../../config/crm-roles.config.js';
import { createContactCenter } from '../../services/contact-center/service.js';
import { createContactCenterRouter } from '../../routes/contact-center-http.js';

async function tx(tenantUid, work) {
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_uid', tenantUid]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function authorize(capability) {
  return (req, res, next) => {
    if (!hasCRMCapability(req.crmUser, capability)) {
      return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
    }
    next();
  };
}

export function buildContactCenterRouter({ authenticate }) {
  const service = createContactCenter({ tx });
  return createContactCenterRouter({ service, media: undefined, authenticate, authorize });
}
