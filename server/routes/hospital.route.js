import { Router } from 'express';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes, Op } from 'sequelize';
import Tenant from '../models/postgres/tenant.model.postgres.js';

const router = Router();

const TENANT_ID_PREFIX = 'tenant-';
const privilegedRoles = new Set(['admin', 'super_admin', 'system_admin']);
const allowTenantFallback = process.env.ALLOW_TENANT_FALLBACK === 'true';
const allowLegacyLocationFallback = process.env.ALLOW_LEGACY_LOCATION_FALLBACK === 'true';

const canUseTenantOverride = (req) =>
  allowTenantFallback && (privilegedRoles.has(req.userRole) || req.user?.isAdmin);

const mapTenantHospital = (tenant) => {
  const address = tenant.address || {};
  return {
    id: `${TENANT_ID_PREFIX}${tenant.id}`,
    name: tenant.name,
    address: address.street || address.line1 || tenant.metadata?.address || '',
    city: address.city || tenant.metadata?.city || '',
    state: address.state || tenant.metadata?.state || '',
    pincode: address.zipCode || address.postalCode || '',
    phone: tenant.phone,
    mobile: tenant.metadata?.mobile || tenant.phone,
    email: tenant.email,
    entity_type: tenant.type,
    google_place_id: tenant.metadata?.google_place_id || null,
    is_spn: tenant.metadata?.is_spn ?? false,
    active: tenant.status === 'active',
    tenant_meta: {
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      customDomain: tenant.custom_domain,
      plan: tenant.plan
    }
  };
};

const resolveTenantHospital = async (req) => {
  if (req.tenant && req.tenant.type === 'hospital') {
    return req.tenant;
  }

  if (!canUseTenantOverride(req)) {
    return null;
  }

  if (req.query.tenantSlug) {
    return Tenant.findOne({
      where: {
        slug: req.query.tenantSlug,
        type: 'hospital',
        status: 'active'
      }
    });
  }

  return null;
};

const matchesHospitalFilters = (tenant, { city, state, pincode, search, is_spn }) => {
  const address = tenant.address || {};
  const metadata = tenant.metadata || {};
  if (city && (address.city || metadata.city || '').toLowerCase() !== city.toLowerCase()) return false;
  if (state && (address.state || metadata.state || '').toLowerCase() !== state.toLowerCase()) return false;
  if (pincode && (address.zipCode || address.postalCode || '').toString() !== pincode) return false;
  if (typeof is_spn !== 'undefined') {
    const expected = is_spn === 'true';
    if ((metadata.is_spn ?? false) !== expected) return false;
  }
  if (search) {
    const term = search.toLowerCase();
    const fields = [
      tenant.name,
      address.street,
      address.line1,
      address.city,
      address.state,
      metadata.address
    ].filter(Boolean).map((value) => value.toLowerCase());
    if (!fields.some((field) => field.includes(term))) return false;
  }
  return true;
};

const paginate = (items, page, limit) => {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
};

// RULE: tenantSlug overrides are reserved for privileged callers; everyone else must rely on subdomain context.
// Get all hospitals (public - for users to view)
router.get('/hospitals', async (req, res) => {
  if (req.query.tenantSlug && !canUseTenantOverride(req)) {
    return res.status(400).json({
      success: false,
      error: 'tenantSlug filter is restricted. Use the hospital subdomain instead.'
    });
  }

  try {
    const tenantHospital = await resolveTenantHospital(req);
    if (tenantHospital) {
      return res.json({
        success: true,
        data: [mapTenantHospital(tenantHospital)],
        pagination: {
          total: 1,
          page: 1,
          limit: 1,
          totalPages: 1
        }
      });
    }

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const tenants = await Tenant.findAll({
      where: { type: 'hospital', status: 'active' },
      order: [['updatedAt', 'DESC']]
    });
    const filtered = tenants.filter((tenant) => matchesHospitalFilters(tenant, req.query));
    const paginated = paginate(filtered, page, limit).map(mapTenantHospital);
    if (!paginated.length && allowLegacyLocationFallback) {
      const { city, state, pincode, search, is_spn } = req.query;
      const offset = (page - 1) * limit;
      let whereClause = 'WHERE 1=1';
      const replacements = {};
      if (city) { whereClause += ' AND city LIKE :city'; replacements.city = `%${city}%`; }
      if (state) { whereClause += ' AND state LIKE :state'; replacements.state = `%${state}%`; }
      if (pincode) { whereClause += ' AND pincode = :pincode'; replacements.pincode = pincode; }
      if (search) { whereClause += ' AND (hospital_name ILIKE :search OR address ILIKE :search)'; replacements.search = `%${search}%`; }
      if (is_spn === 'true') { whereClause += " AND network_type IS NOT NULL AND lower(network_type) <> 'none'"; }
      const countQuery = `SELECT COUNT(*) as total FROM hospitals ${whereClause}`;
      const [countResult] = await sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT });
      const query = `
        -- The hospitals table has no name / phone / mobile / entity_type /
        -- google_place_id / is_spn / active columns; they are hospital_name,
        -- phone_number, network_type and status. Selecting the old names threw
        -- 42703, which is why the hospital detail endpoint answered 500 for
        -- every integer id. Aliased back to the names the clients read.
        SELECT
          id,
          hospital_name AS name,
          address,
          city,
          state,
          pincode,
          phone_number AS phone,
          phone_number AS mobile,
          email,
          'hospital' AS entity_type,
          NULL::text AS google_place_id,
          (network_type IS NOT NULL AND lower(network_type) <> 'none') AS is_spn,
          (lower(COALESCE(status, 'active')) = 'active') AS active,
          latitude,
          longitude
        FROM hospitals 
        ${whereClause}
        ORDER BY 
          CASE WHEN network_type IS NOT NULL AND lower(network_type) <> 'none' THEN 0 ELSE 1 END,
          hospital_name
        LIMIT :limit OFFSET :offset
      `;
      const hospitals = await sequelize.query(query, {
        replacements: { ...replacements, limit, offset },
        type: QueryTypes.SELECT
      });

      return res.json({
        success: true,
        data: hospitals,
        pagination: {
          total: countResult.total,
          page,
          limit,
          totalPages: Math.ceil(countResult.total / limit)
        },
        source: 'legacy'
      });
    }

    res.json({
      success: true,
      data: paginated,
      pagination: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit)
      },
      source: 'tenant'
    });
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospitals'
    });
  }
});

// Get hospital by ID (public)
router.get('/hospitals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id.startsWith(TENANT_ID_PREFIX)) {
      const rawTenantId = id.slice(TENANT_ID_PREFIX.length);
      if (!/^[1-9]\d*$/.test(rawTenantId) || !Number.isSafeInteger(Number(rawTenantId))) {
        return res.status(404).json({ success: false, error: 'Hospital not found' });
      }
      const tenantId = Number(rawTenantId);
      const tenant = await Tenant.findOne({
        where: { id: tenantId, type: 'hospital', status: 'active' }
      });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Hospital not found'
        });
      }

      // The main directory already lists active hospitals. Allow the same
      // directory data on detail reads when no tenant subdomain is selected;
      // a tenant-scoped host remains confined to its own hospital.
      if (!canUseTenantOverride(req) && req.tenant && String(req.tenant.id) !== String(tenant.id)) {
        return res.status(403).json({
          success: false,
          error: 'Cross-tenant access blocked. Use the hospital subdomain for details.'
        });
      }

      return res.json({
        success: true,
        data: mapTenantHospital(tenant)
      });
    }
    if (req.tenant && req.tenant.type === 'hospital') {
      return res.json({
        success: true,
        data: mapTenantHospital(req.tenant)
      });
    }

    const tenant = await Tenant.findOne({
      where: {
        type: 'hospital',
        status: 'active',
        [Op.or]: [
          { slug: id },
          { subdomain: id }
        ]
      }
    });

    if (tenant) {
      if (!canUseTenantOverride(req) && req.tenant && String(req.tenant.id) !== String(tenant.id)) {
        return res.status(403).json({
          success: false,
          error: 'Cross-tenant access blocked. Use the hospital subdomain for details.'
        });
      }
      return res.json({
        success: true,
        data: mapTenantHospital(tenant)
      });
    }

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    const [hospital] = await sequelize.query(
      `SELECT
        id,
        hospital_name AS name,
        address,
        city,
        state,
        pincode,
        phone_number AS phone,
        phone_number AS mobile,
        email,
        'hospital' AS entity_type,
        NULL::text AS google_place_id,
        (network_type IS NOT NULL AND lower(network_type) <> 'none') AS is_spn,
        (lower(COALESCE(status, 'active')) = 'active') AS active,
        latitude,
        longitude,
        created_at
      FROM hospitals 
      WHERE id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Hospital not found'
      });
    }

    res.json({
      success: true,
      data: hospital,
      source: 'legacy'
    });
  } catch (error) {
    console.error('Error fetching hospital:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital details'
    });
  }
});

// Get hospital by Google Place ID (public)
router.get('/hospitals/place/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const tenantFromPlace = await Tenant.findOne({
      where: {
        type: 'hospital',
        metadata: {
          google_place_id: placeId
        }
      }
    }).catch(() => null);
    if (tenantFromPlace) {
      return res.json({
        success: true,
        data: mapTenantHospital(tenantFromPlace)
      });
    }

    // hospitals has no google_place_id column, so this legacy lookup can never
    // match a row. It is kept as an explicit empty result rather than a 500:
    // the tenant lookup above is the live path for a place id.
    const [hospital] = await sequelize.query(
      `SELECT
        id,
        hospital_name AS name,
        address,
        city,
        state,
        pincode,
        phone_number AS phone,
        phone_number AS mobile,
        email,
        'hospital' AS entity_type,
        NULL::text AS google_place_id,
        (network_type IS NOT NULL AND lower(network_type) <> 'none') AS is_spn,
        (lower(COALESCE(status, 'active')) = 'active') AS active
      FROM hospitals 
      WHERE metadata->>'googlePlaceId' = :placeId`,
      {
        replacements: { placeId },
        type: QueryTypes.SELECT
      }
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Hospital not found'
      });
    }

    res.json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Error fetching hospital by place ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital details'
    });
  }
});

// Get SPN hospitals only (public)
router.get('/hospitals/spn/list', async (req, res) => {
  try {
    const { city, state, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE network_type IS NOT NULL AND lower(network_type) <> 'none' AND lower(COALESCE(status, 'active')) = 'active'";
    const replacements = {};

    if (city) {
      whereClause += ' AND city ILIKE :city';
      replacements.city = `%${city}%`;
    }

    if (state) {
      whereClause += ' AND state ILIKE :state';
      replacements.state = `%${state}%`;
    }

    const countQuery = `SELECT COUNT(*) as total FROM hospitals ${whereClause}`;
    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT
    });

    const query = `
      SELECT
        id,
        hospital_name AS name,
        address,
        city,
        state,
        pincode,
        phone_number AS phone,
        phone_number AS mobile,
        email,
        NULL::text AS google_place_id,
        latitude,
        longitude
      FROM hospitals 
      ${whereClause}
      ORDER BY hospital_name
      LIMIT :limit OFFSET :offset
    `;

    const hospitals = await sequelize.query(query, {
      replacements: { ...replacements, limit: parseInt(limit), offset },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: hospitals,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching SPN hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPN hospitals'
    });
  }
});

// Get hospital statistics (public)
router.get('/hospitals/stats/overview', async (req, res) => {
  try {
    const [stats] = await sequelize.query(
      `SELECT 
        COUNT(*) as total_hospitals,
        SUM(CASE WHEN is_spn = true THEN 1 ELSE 0 END) as spn_hospitals,
        SUM(CASE WHEN has_admin_access = true THEN 1 ELSE 0 END) as hospitals_with_admin,
        COUNT(DISTINCT state) as states_covered,
        COUNT(DISTINCT city) as cities_covered
      FROM hospitals 
      WHERE active = true`,
      { type: QueryTypes.SELECT }
    );

    const stateStats = await sequelize.query(
      `SELECT 
        state,
        COUNT(*) as total,
        SUM(CASE WHEN is_spn = true THEN 1 ELSE 0 END) as spn_count
      FROM hospitals 
      WHERE active = true AND state IS NOT NULL AND state != ''
      GROUP BY state 
      ORDER BY total DESC 
      LIMIT 10`,
      { type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        overview: stats,
        topStates: stateStats
      }
    });
  } catch (error) {
    console.error('Error fetching hospital statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

export default router;
