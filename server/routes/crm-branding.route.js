import express from 'express';
import sharedPool from '../db/pgPool.js';

const slug = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * The prefix WhatsApp template names start with on this installation (`<app>_<purpose>_<lang>`, see
 * gupshup-control.service.js templateName). The CRM web app strips it to show readable template labels.
 * Read from the configured Gupshup app's name (not secret: config, never encrypted_credentials).
 */
export async function whatsappTemplatePrefix(tenantId, db = sharedPool) {
  const { rows: [row] } = await db.query(
    `SELECT config FROM crm_marketing_integrations
     WHERE tenant_id = $1 AND provider = 'whatsapp' AND integration_type = 'communication' AND status = 'configured' LIMIT 1`,
    [tenantId]);
  const config = typeof row?.config === 'string' ? JSON.parse(row.config) : (row?.config || {});
  const app = config.provider === 'gupshup' ? slug(config.appName) : '';
  return app ? `${app}_` : '';
}

/**
 * Public, pre-login branding for the CRM web app (crm-web/src/config/brand.ts): name, logo, theme, support
 * address and template prefix. Each comes from the installation's own tenant row (which the control plane
 * updates through GET /config), so one web build serves every hospital. Nothing here is secret.
 */
export function buildCrmBrandingRouter(tenant, { templatePrefix = whatsappTemplatePrefix } = {}) {
  const router = express.Router();
  router.get('/', async (_req, res) => {
    const branding = tenant.branding || {};
    const settings = tenant.settings || {};
    let prefix = '';
    try { prefix = await templatePrefix(tenant.id); } catch { /* No WhatsApp app configured: show names as they are. */ }
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      name: branding.display_name || tenant.name || null,
      logoUrl: branding.logo_url || null,
      faviconUrl: branding.favicon_url || null,
      primaryColor: branding.primary_color || null,
      secondaryColor: branding.secondary_color || null,
      supportEmail: branding.support_email || settings.supportEmail || null,
      templatePrefix: prefix,
    });
  });
  return router;
}
