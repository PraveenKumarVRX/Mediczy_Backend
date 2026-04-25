import express from 'express';
import { Op } from 'sequelize';
import Tenant from '../models/postgres/tenant.model.postgres.js';

const router = express.Router();

// Using PostgreSQL via Tenant model

const TENANT_ID_PREFIX = 'tenant-';
const privilegedRoles = new Set(['admin', 'super_admin', 'system_admin']);
const allowTenantFallback = process.env.ALLOW_TENANT_FALLBACK === 'true';
const allowLegacyLocationFallback = process.env.ALLOW_LEGACY_LOCATION_FALLBACK === 'true';

const canUseTenantOverride = (req) =>
  allowTenantFallback && (privilegedRoles.has(req.userRole) || req.user?.isAdmin);

const mapTenantClinic = (tenant) => {
  const address = tenant.address || {};
  return {
    id: `${TENANT_ID_PREFIX}${tenant.id}`,
    name: tenant.name,
    areaName: address.area || '',
    isChain: tenant.metadata?.is_chain ?? false,
    email: tenant.email,
    phone: tenant.phone,
    address: address.street || address.line1 || '',
    city: address.city || '',
    state: address.state || '',
    pincode: address.zipCode || '',
    ownerName: tenant.metadata?.ownerName || tenant.name,
    services: tenant.metadata?.services || [],
    google_place_id: tenant.metadata?.google_place_id || null,
    category: tenant.metadata?.category || tenant.type,
    isActive: tenant.status === 'active',
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt
  };
};

const resolveTenantClinic = async (req) => {
  if (req.tenant && req.tenant.type === 'clinic') {
    return req.tenant;
  }

  if (!canUseTenantOverride(req)) {
    return null;
  }

  if (req.query.tenantSlug) {
    return Tenant.findOne({
      where: { slug: req.query.tenantSlug, type: 'clinic', status: 'active' }
    });
  }

  return null;
};

const stringIncludes = (haystack = '', needle = '') =>
  haystack.toLowerCase().includes(needle.toLowerCase());

const matchesClinicFilters = (tenant, { city, state, pincode, search, category }) => {
  const address = tenant.address || {};
  const metadata = tenant.metadata || {};
  const normalizedCategory = (category || 'general').toLowerCase();
  if (normalizedCategory && normalizedCategory !== 'all') {
    const tenantCategory = (metadata.category || tenant.type || '').toLowerCase();
    if (tenantCategory !== normalizedCategory) return false;
  }
  if (city && (address.city || '').toLowerCase() !== city.toLowerCase()) return false;
  if (state && (address.state || '').toLowerCase() !== state.toLowerCase()) return false;
  if (pincode && String(address.zipCode || '').toLowerCase() !== pincode.toLowerCase()) return false;
  if (search) {
    const term = search.toLowerCase();
    const fields = [
      tenant.name,
      address.street,
      address.line1,
      address.city,
      address.state,
      metadata.ownerName
    ].filter(Boolean).map((value) => value.toLowerCase());
    if (!fields.some((field) => field.includes(term))) return false;
  }
  return true;
};

const paginate = (items, page, limit) => {
  const start = (page - 1) * limit;
  const end = start + limit;
  return items.slice(start, end);
};

const fetchLegacyClinics = async (req) => {
  if (!allowLegacyLocationFallback) return { rows: [], total: 0 };
  const pool = await getLegacyPool();
  if (!pool) return { rows: [], total: 0 };
  const { city, state, pincode, search, category = 'general', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const where = [];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (city) { where.push('city = ?'); params.push(city); }
  if (state) { where.push('state = ?'); params.push(state); }
  if (pincode) { where.push('pincode = ?'); params.push(pincode); }
  if (search) {
    where.push('(name LIKE ? OR address LIKE ? OR city LIKE ? OR state LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(
    `SELECT id, name, areaName, isChain, email, phone, address, city, state, pincode, ownerName, services, google_place_id, category, isActive, createdAt, updatedAt
     FROM clinics ${whereSql}
     ORDER BY updatedAt DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit, 10), offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) as count FROM clinics ${whereSql}`, params);
  return { rows, total: countRows[0].count, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

// RULE: tenantSlug/X-Tenant-ID overrides are disabled for non-admin callers.
router.get('/', async (req, res) => {
  if (req.query.tenantSlug && !canUseTenantOverride(req)) {
    return res.status(400).json({
      error: 'tenantSlug filter is restricted. Access your clinic via its subdomain.'
    });
  }

  const tenantClinic = await resolveTenantClinic(req);
  if (tenantClinic) {
    return res.json({
      data: [mapTenantClinic(tenantClinic)],
      page: 1,
      limit: 1,
      total: 1
    });
  }

  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const tenants = await Tenant.findAll({
      where: { type: 'clinic', status: 'active' },
      order: [['updatedAt', 'DESC']]
    });
    const filtered = tenants.filter((tenant) => matchesClinicFilters(tenant, req.query));
    const paginated = paginate(filtered, page, limit).map(mapTenantClinic);
    if (!paginated.length && allowLegacyLocationFallback) {
      const legacy = await fetchLegacyClinics(req);
      return res.json({
        data: legacy.rows,
        page: legacy.page,
        limit: legacy.limit,
        total: legacy.total,
        source: 'legacy'
      });
    }
    res.json({
      data: paginated,
      page,
      limit,
      total: filtered.length,
      source: 'tenant'
    });
  } catch (err) {
    console.error('Error fetching clinics:', err);
    res.status(500).json({ error: 'Failed to fetch clinics' });
  }
});

// GET /api/clinics/:id - clinic detail
router.get('/:id', async (req, res) => {
  try {
    if (req.params.id.startsWith(TENANT_ID_PREFIX)) {
      const tenantId = Number(req.params.id.replace(TENANT_ID_PREFIX, ''));
      const tenant = await Tenant.findOne({
        where: { id: tenantId, type: 'clinic' }
      });
      if (!tenant) return res.status(404).json({ error: 'Clinic not found' });

      if (!canUseTenantOverride(req) && (!req.tenant || req.tenant.id !== tenant.id)) {
        return res.status(403).json({
          error: 'Cross-tenant access blocked. Use clinic subdomain to view details.'
        });
      }

      return res.json(mapTenantClinic(tenant));
    }

    if (req.tenant && req.tenant.type === 'clinic') {
      return res.json(mapTenantClinic(req.tenant));
    }

    const tenant = await Tenant.findOne({
      where: {
        type: 'clinic',
        status: 'active',
        [Op.or]: [
          { slug: req.params.id },
          { subdomain: req.params.id }
        ]
      }
    });
    if (tenant) {
      if (!canUseTenantOverride(req) && (!req.tenant || req.tenant.id !== tenant.id)) {
        return res.status(403).json({
          error: 'Cross-tenant access blocked. Use clinic subdomain to view details.'
        });
      }
      return res.json(mapTenantClinic(tenant));
    }

    if (allowLegacyLocationFallback) {
      const pool = await getLegacyPool();
      const [rows] = await pool.query('SELECT * FROM clinics WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });
      return res.json(rows[0]);
    }

    return res.status(404).json({ error: 'Clinic not found' });
  } catch (err) {
    console.error('Error fetching clinic detail:', err);
    res.status(500).json({ error: 'Failed to fetch clinic detail' });
  }
});

export default router;
