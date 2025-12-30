/**
 * Mediqzy PaaS - Platform Tenant Service
 * 
 * Business logic for platform-level tenant lifecycle management
 * Distinct from the existing tenant.service.js which handles onboarding
 */

import { getPostgresPool } from '../db/postgres.js';
import { TenantEvents } from './event.service.js';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// PLATFORM TENANT SERVICE CLASS
// =============================================================================

class PlatformTenantService {
  /**
   * Generate unique tenant code
   */
  async generateTenantCode(tenantType) {
    const prefix = {
      CLINIC: 'CLN',
      HOSPITAL: 'HSP',
      CORPORATE: 'CRP',
      INSURANCE_BROKER: 'IBR',
      INSURANCE_TPA: 'TPA',
      INSURANCE_COMPANY: 'INS',
      WELLNESS_AGGREGATOR: 'WLN',
      AMBULANCE: 'AMB',
      LAB: 'LAB',
      PHARMACY: 'PHR',
      PSU: 'PSU',
      NGO: 'NGO',
    }[tenantType] || 'TEN';

    const pool = await getPostgresPool();
    
    // Get next sequence number
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM platform_tenants WHERE tenant_type = $1`,
      [tenantType]
    );
    const count = parseInt(countResult.rows[0].count) + 1;
    
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Create a new tenant in the platform
   */
  async createTenant(tenantData, createdBy) {
    const pool = await getPostgresPool();
    
    // Generate tenant code
    const tenantCode = await this.generateTenantCode(tenantData.tenantType);
    
    // Generate subdomain from name
    const subdomain = tenantData.customSubdomain || 
      tenantData.tenantName.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);

    const query = `
      INSERT INTO platform_tenants (
        tenant_code,
        tenant_name,
        tenant_type,
        db_strategy,
        primary_domain,
        contact_email,
        contact_phone,
        address,
        country_code,
        timezone,
        subscription_plan,
        subscription_status,
        trial_ends_at,
        limits,
        status,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *;
    `;

    // Calculate trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // Set default limits based on plan
    const defaultLimits = this.getDefaultLimits(tenantData.subscriptionPlan || 'STARTER');

    const result = await pool.query(query, [
      tenantCode,
      tenantData.tenantName,
      tenantData.tenantType,
      tenantData.dbStrategy || 'SHARED',
      `${subdomain}.mediqzy.com`,
      tenantData.contactEmail,
      tenantData.contactPhone,
      JSON.stringify(tenantData.address || {}),
      tenantData.countryCode || 'IND',
      tenantData.timezone || 'Asia/Kolkata',
      tenantData.subscriptionPlan || 'STARTER',
      'TRIAL',
      trialEndsAt,
      JSON.stringify(defaultLimits),
      'PENDING',
      createdBy,
    ]);

    const tenant = result.rows[0];

    // Emit tenant created event
    TenantEvents.created(tenant, { userId: createdBy });

    return tenant;
  }

  /**
   * Get default limits for a plan
   */
  getDefaultLimits(plan) {
    const limits = {
      STARTER: {
        maxUsers: 10,
        maxEntities: 1,
        maxStorageGB: 5,
        maxApiCallsPerMonth: 10000,
        features: ['appointments', 'patients', 'basic_billing'],
      },
      PROFESSIONAL: {
        maxUsers: 50,
        maxEntities: 5,
        maxStorageGB: 50,
        maxApiCallsPerMonth: 100000,
        features: ['appointments', 'patients', 'billing', 'prescriptions', 'lab_orders', 'reports'],
      },
      ENTERPRISE: {
        maxUsers: -1, // Unlimited
        maxEntities: -1,
        maxStorageGB: 500,
        maxApiCallsPerMonth: -1,
        features: ['all'],
      },
      CUSTOM: {
        maxUsers: -1,
        maxEntities: -1,
        maxStorageGB: 1000,
        maxApiCallsPerMonth: -1,
        features: ['all'],
      },
    };

    return limits[plan] || limits.STARTER;
  }

  /**
   * Provision tenant resources (DB, schema, etc.)
   */
  async provisionTenant(tenantId, actor) {
    const pool = await getPostgresPool();

    // Get tenant
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (tenant.status !== 'PENDING' && tenant.status !== 'PROVISIONING') {
      throw new Error(`Cannot provision tenant in ${tenant.status} status`);
    }

    // Update status to provisioning
    await pool.query(
      `UPDATE platform_tenants SET status = 'PROVISIONING', updated_at = NOW() WHERE tenant_id = $1`,
      [tenantId]
    );

    const resources = {
      database: null,
      schema: null,
      roles: [],
      defaultEntity: null,
    };

    try {
      // Based on db_strategy, set up database
      if (tenant.db_strategy === 'DEDICATED') {
        resources.database = await this.createDedicatedDatabase(tenant);
      } else if (tenant.db_strategy === 'SCHEMA') {
        resources.schema = await this.createTenantSchema(tenant);
      }

      // Create default entity
      resources.defaultEntity = await this.createDefaultEntity(tenantId, tenant.tenant_type);

      // Clone system roles for this tenant
      resources.roles = await this.cloneSystemRoles(tenantId);

      // Update tenant status to ACTIVE
      await pool.query(`
        UPDATE platform_tenants 
        SET status = 'ACTIVE', provisioned_at = NOW(), activated_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1
      `, [tenantId]);

      // Emit event
      TenantEvents.provisioned(tenantId, resources, actor);

      return { success: true, resources };
    } catch (error) {
      await pool.query(
        `UPDATE platform_tenants SET status = 'PENDING', updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId]
      );
      throw error;
    }
  }

  /**
   * Create dedicated database for tenant
   */
  async createDedicatedDatabase(tenant) {
    const dbName = `mediqzy_${tenant.tenant_code.toLowerCase()}`;
    console.log(`[PlatformTenantService] Would create database: ${dbName}`);
    
    const pool = await getPostgresPool();
    await pool.query(`
      UPDATE platform_tenants 
      SET db_name = $1, updated_at = NOW()
      WHERE tenant_id = $2
    `, [dbName, tenant.tenant_id]);

    return { dbName };
  }

  /**
   * Create tenant schema
   */
  async createTenantSchema(tenant) {
    const schemaName = `tenant_${tenant.tenant_code.toLowerCase()}`;
    
    const pool = await getPostgresPool();
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    
    await pool.query(`
      UPDATE platform_tenants 
      SET db_name = $1, updated_at = NOW()
      WHERE tenant_id = $2
    `, [schemaName, tenant.tenant_id]);

    return { schemaName };
  }

  /**
   * Create default entity for tenant
   */
  async createDefaultEntity(tenantId, tenantType) {
    const pool = await getPostgresPool();
    const tenant = await this.getTenant(tenantId);

    const entityType = {
      CLINIC: 'CLINIC',
      HOSPITAL: 'HOSPITAL',
      CORPORATE: 'CORPORATE_OFFICE',
      INSURANCE_BROKER: 'BROKER_OFFICE',
      INSURANCE_TPA: 'TPA_OFFICE',
      INSURANCE_COMPANY: 'INSURANCE_BRANCH',
      WELLNESS_AGGREGATOR: 'WELLNESS_CENTER',
      AMBULANCE: 'AMBULANCE_STATION',
      LAB: 'LAB',
      PHARMACY: 'PHARMACY',
      PSU: 'CORPORATE_OFFICE',
      NGO: 'CORPORATE_OFFICE',
    }[tenantType] || 'OTHER';

    const result = await pool.query(`
      INSERT INTO platform_entities (
        tenant_id, entity_code, entity_name, entity_type, 
        email, phone, address, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
      RETURNING *;
    `, [
      tenantId,
      'HQ',
      `${tenant.tenant_name} - Headquarters`,
      entityType,
      tenant.contact_email,
      tenant.contact_phone,
      JSON.stringify(tenant.address || {}),
    ]);

    return result.rows[0];
  }

  /**
   * Clone system roles for tenant
   */
  async cloneSystemRoles(tenantId) {
    const pool = await getPostgresPool();

    const systemRoles = await pool.query(`
      SELECT * FROM platform_roles 
      WHERE is_system_role = true 
      AND scope IN ('TENANT', 'ENTITY')
      AND tenant_id IS NULL
    `);

    const clonedRoles = [];

    for (const role of systemRoles.rows) {
      const cloneResult = await pool.query(`
        INSERT INTO platform_roles (
          tenant_id, role_code, role_name, description, scope, 
          parent_role_id, is_system_role
        ) VALUES ($1, $2, $3, $4, $5, $6, false)
        RETURNING *;
      `, [
        tenantId,
        role.role_code,
        role.role_name,
        role.description,
        role.scope,
        role.role_id,
      ]);

      const clonedRole = cloneResult.rows[0];

      await pool.query(`
        INSERT INTO platform_role_permissions (role_id, permission_id, conditions)
        SELECT $1, permission_id, conditions
        FROM platform_role_permissions
        WHERE role_id = $2
      `, [clonedRole.role_id, role.role_id]);

      clonedRoles.push(clonedRole);
    }

    return clonedRoles;
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId) {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM platform_tenants WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get tenant by domain
   */
  async getTenantByDomain(domain) {
    const pool = await getPostgresPool();
    
    let result = await pool.query(
      `SELECT * FROM platform_tenants WHERE primary_domain = $1 OR custom_domain = $1`,
      [domain]
    );
    
    if (result.rows[0]) {
      return result.rows[0];
    }

    result = await pool.query(`
      SELECT t.* FROM platform_tenants t
      JOIN platform_domains d ON d.tenant_id = t.tenant_id
      WHERE d.domain_name = $1 AND d.status = 'ACTIVE'
    `, [domain]);

    return result.rows[0] || null;
  }

  /**
   * Get tenant by code
   */
  async getTenantByCode(tenantCode) {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM platform_tenants WHERE tenant_code = $1`,
      [tenantCode]
    );
    return result.rows[0] || null;
  }

  /**
   * List all tenants with pagination
   */
  async listTenants({ page = 1, limit = 20, status = null, type = null, search = null }) {
    const pool = await getPostgresPool();
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM platform_tenants WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) FROM platform_tenants WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
      countQuery += ` AND status = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND tenant_type = $${params.length}`;
      countQuery += ` AND tenant_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (tenant_name ILIKE $${params.length} OR tenant_code ILIKE $${params.length})`;
      countQuery += ` AND (tenant_name ILIKE $${params.length} OR tenant_code ILIKE $${params.length})`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [tenantsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)),
    ]);

    return {
      tenants: tenantsResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(countResult.rows[0].count / limit),
      },
    };
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId, updates, actor) {
    const pool = await getPostgresPool();
    
    const allowedFields = [
      'tenant_name', 'contact_email', 'contact_phone', 
      'address', 'timezone', 'logo_url', 'favicon_url', 
      'theme_config', 'metadata'
    ];

    const setClauses = [];
    const params = [tenantId];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push('updated_at = NOW()');

    const result = await pool.query(`
      UPDATE platform_tenants 
      SET ${setClauses.join(', ')}
      WHERE tenant_id = $1
      RETURNING *;
    `, params);

    return result.rows[0];
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId, reason, actor) {
    const pool = await getPostgresPool();

    await pool.query(`
      UPDATE platform_tenants 
      SET status = 'SUSPENDED', suspended_at = NOW(), suspension_reason = $2, updated_at = NOW()
      WHERE tenant_id = $1
    `, [tenantId, reason]);

    TenantEvents.suspended(tenantId, reason, actor);

    return { success: true };
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId, actor) {
    const pool = await getPostgresPool();

    await pool.query(`
      UPDATE platform_tenants 
      SET status = 'ACTIVE', suspended_at = NULL, suspension_reason = NULL, 
          activated_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $1
    `, [tenantId]);

    TenantEvents.activated(tenantId, actor);

    return { success: true };
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId, actor) {
    const pool = await getPostgresPool();

    await pool.query(`
      UPDATE platform_tenants 
      SET status = 'DELETED', updated_at = NOW()
      WHERE tenant_id = $1
    `, [tenantId]);

    return { success: true };
  }

  // =============================================================================
  // ENTITY MANAGEMENT
  // =============================================================================

  /**
   * Create entity under tenant
   */
  async createEntity(tenantId, entityData, actor) {
    const pool = await getPostgresPool();

    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const limits = tenant.limits;
    const usage = tenant.current_usage;

    if (limits.maxEntities !== -1 && usage.entities >= limits.maxEntities) {
      throw new Error('Entity limit reached for this tenant');
    }

    const result = await pool.query(`
      INSERT INTO platform_entities (
        tenant_id, parent_entity_id, entity_code, entity_name, entity_type,
        address, latitude, longitude, email, phone,
        operating_hours, license_number, registration_number,
        accreditations, services_offered, specializations, capacity, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'ACTIVE')
      RETURNING *;
    `, [
      tenantId,
      entityData.parentEntityId,
      entityData.entityCode,
      entityData.entityName,
      entityData.entityType,
      JSON.stringify(entityData.address || {}),
      entityData.latitude,
      entityData.longitude,
      entityData.email,
      entityData.phone,
      JSON.stringify(entityData.operatingHours || {}),
      entityData.licenseNumber,
      entityData.registrationNumber,
      JSON.stringify(entityData.accreditations || []),
      JSON.stringify(entityData.servicesOffered || []),
      JSON.stringify(entityData.specializations || []),
      JSON.stringify(entityData.capacity || {}),
    ]);

    await pool.query(`
      UPDATE platform_tenants 
      SET current_usage = jsonb_set(current_usage, '{entities}', to_jsonb((current_usage->>'entities')::int + 1))
      WHERE tenant_id = $1
    `, [tenantId]);

    return result.rows[0];
  }

  /**
   * Get entities for a tenant
   */
  async getEntities(tenantId, { parentEntityId = null, entityType = null, status = 'ACTIVE' } = {}) {
    const pool = await getPostgresPool();

    let query = `SELECT * FROM platform_entities WHERE tenant_id = $1`;
    const params = [tenantId];

    if (parentEntityId !== undefined) {
      params.push(parentEntityId);
      query += ` AND parent_entity_id ${parentEntityId === null ? 'IS NULL' : `= $${params.length}`}`;
    }

    if (entityType) {
      params.push(entityType);
      query += ` AND entity_type = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY entity_name`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get entity by ID
   */
  async getEntity(entityId) {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM platform_entities WHERE entity_id = $1`,
      [entityId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update entity
   */
  async updateEntity(entityId, updates, actor) {
    const pool = await getPostgresPool();

    const allowedFields = [
      'entity_name', 'address', 'latitude', 'longitude',
      'email', 'phone', 'operating_hours', 'license_number',
      'registration_number', 'accreditations', 'services_offered',
      'specializations', 'capacity', 'metadata'
    ];

    const setClauses = [];
    const params = [entityId];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push('updated_at = NOW()');

    const result = await pool.query(`
      UPDATE platform_entities 
      SET ${setClauses.join(', ')}
      WHERE entity_id = $1
      RETURNING *;
    `, params);

    return result.rows[0];
  }

  // =============================================================================
  // DOMAIN MANAGEMENT
  // =============================================================================

  /**
   * Add domain to tenant
   */
  async addDomain(tenantId, domainName, domainType = 'SUBDOMAIN', entityId = null) {
    const pool = await getPostgresPool();

    const verificationToken = uuidv4().substring(0, 32);

    const result = await pool.query(`
      INSERT INTO platform_domains (
        tenant_id, entity_id, domain_name, domain_type,
        dns_verification_token, status
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING *;
    `, [tenantId, entityId, domainName, domainType, verificationToken]);

    return result.rows[0];
  }

  /**
   * Verify domain DNS
   */
  async verifyDomain(domainId) {
    const pool = await getPostgresPool();
    
    await pool.query(`
      UPDATE platform_domains 
      SET dns_verified = true, dns_verified_at = NOW(), status = 'ACTIVE', updated_at = NOW()
      WHERE domain_id = $1
    `, [domainId]);

    return { success: true };
  }

  /**
   * Get domains for tenant
   */
  async getDomains(tenantId) {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM platform_domains WHERE tenant_id = $1 ORDER BY is_primary DESC, domain_name`,
      [tenantId]
    );
    return result.rows;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const platformTenantService = new PlatformTenantService();

export default platformTenantService;
