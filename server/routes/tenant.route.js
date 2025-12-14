/**
 * Tenant Management Routes
 * Organization CRUD, settings, subscription management
 */

import express from 'express';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * POST /api/tenants/register
 * Register new organization (public)
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      type,
      email,
      phone,
      address,
      registration_number,
      plan = 'free',
      owner_email,
      owner_password
    } = req.body;
    
    // Validate required fields
    if (!name || !type || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Generate slug and subdomain
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const subdomain = slug.substring(0, 63); // DNS label limit
    
    // Check if slug/subdomain already exists
    const existing = await Tenant.findOne({
      where: {
        [Tenant.sequelize.Op.or]: [
          { slug },
          { subdomain }
        ]
      }
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Organization name already taken'
      });
    }
    
    // Create tenant
    const tenant = await Tenant.create({
      name,
      slug,
      subdomain,
      type,
      email,
      phone,
      address: address || {},
      plan,
      status: 'pending'
    });
    
    // TODO: Create owner user account
    // TODO: Send verification email
    // TODO: Setup initial data (roles, permissions)
    
    res.status(201).json({
      success: true,
      message: 'Organization registered successfully',
      data: {
        tenant_id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        access_url: `https://${tenant.subdomain}.mayden.in`,
        status: tenant.status
      }
    });
  } catch (error) {
    console.error('Tenant registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * GET /api/tenants/current
 * Get current tenant details
 */
router.get('/current', requireTenant, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.tenant.id,
        name: req.tenant.name,
        type: req.tenant.type,
        subdomain: req.tenant.subdomain,
        custom_domain: req.tenant.custom_domain,
        plan: req.tenant.plan,
        status: req.tenant.status,
        limits: req.tenant.limits,
        usage: req.tenant.usage,
        features: req.tenant.features,
        branding: req.tenant.branding,
        settings: req.tenant.settings
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant details',
      error: error.message
    });
  }
});

/**
 * PUT /api/tenants/current
 * Update tenant settings
 */
router.put('/current', requireTenant, authUser, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      website,
      address,
      settings,
      branding
    } = req.body;
    
    // Only allow certain fields to be updated
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    if (website) updates.website = website;
    if (address) updates.address = address;
    if (settings) updates.settings = { ...req.tenant.settings, ...settings };
    if (branding) updates.branding = { ...req.tenant.branding, ...branding };
    
    await req.tenant.update(updates);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: req.tenant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Update failed',
      error: error.message
    });
  }
});

/**
 * GET /api/tenants/current/usage
 * Get usage statistics
 */
router.get('/current/usage', requireTenant, authUser, async (req, res) => {
  try {
    const usage = req.tenant.usage;
    const limits = req.tenant.limits;
    
    const stats = {
      users: {
        current: usage.users || 0,
        limit: limits.users,
        percentage: ((usage.users || 0) / limits.users) * 100
      },
      doctors: {
        current: usage.doctors || 0,
        limit: limits.doctors,
        percentage: ((usage.doctors || 0) / limits.doctors) * 100
      },
      appointments: {
        current: usage.appointments_this_month || 0,
        limit: limits.appointments_per_month,
        percentage: ((usage.appointments_this_month || 0) / limits.appointments_per_month) * 100
      },
      storage: {
        current: usage.storage_gb || 0,
        limit: limits.storage_gb,
        percentage: ((usage.storage_gb || 0) / limits.storage_gb) * 100
      }
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch usage',
      error: error.message
    });
  }
});

/**
 * POST /api/tenants/current/upgrade
 * Request plan upgrade
 */
router.post('/current/upgrade', requireTenant, authUser, async (req, res) => {
  try {
    const { plan } = req.body;
    
    const validPlans = ['free', 'basic', 'professional', 'enterprise'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan'
      });
    }
    
    // TODO: Integrate payment gateway
    // TODO: Update plan limits based on new plan
    // TODO: Send confirmation email
    
    res.json({
      success: true,
      message: 'Plan upgrade requested. Payment link sent to email.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Upgrade request failed',
      error: error.message
    });
  }
});

/**
 * GET /api/tenants/check-availability
 * Check if organization name/subdomain is available
 */
router.get('/check-availability', async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name parameter required'
      });
    }
    
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const existing = await Tenant.findOne({
      where: { slug }
    });
    
    res.json({
      success: true,
      available: !existing,
      suggested_subdomain: slug
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Check failed',
      error: error.message
    });
  }
});

/**
 * GET /api/tenants/plans
 * Get available subscription plans
 */
router.get('/plans', async (req, res) => {
  const plans = {
    free: {
      name: 'Free',
      price: 0,
      currency: 'INR',
      billing: 'monthly',
      limits: {
        users: 10,
        doctors: 3,
        appointments_per_month: 50,
        storage_gb: 2
      },
      features: {
        appointments: true,
        telemedicine: false,
        prescriptions: true,
        lab_tests: false,
        pharmacy: false,
        insurance: false,
        ai_assistant: false,
        analytics: false
      }
    },
    basic: {
      name: 'Basic',
      price: 2999,
      currency: 'INR',
      billing: 'monthly',
      limits: {
        users: 50,
        doctors: 10,
        appointments_per_month: 500,
        storage_gb: 20
      },
      features: {
        appointments: true,
        telemedicine: true,
        prescriptions: true,
        lab_tests: true,
        pharmacy: true,
        insurance: false,
        ai_assistant: false,
        analytics: true
      }
    },
    professional: {
      name: 'Professional',
      price: 9999,
      currency: 'INR',
      billing: 'monthly',
      limits: {
        users: 200,
        doctors: 50,
        appointments_per_month: 2000,
        storage_gb: 100
      },
      features: {
        appointments: true,
        telemedicine: true,
        prescriptions: true,
        lab_tests: true,
        pharmacy: true,
        insurance: true,
        ai_assistant: true,
        analytics: true
      }
    },
    enterprise: {
      name: 'Enterprise',
      price: null, // Custom pricing
      currency: 'INR',
      billing: 'annual',
      limits: {
        users: -1, // Unlimited
        doctors: -1,
        appointments_per_month: -1,
        storage_gb: -1
      },
      features: {
        appointments: true,
        telemedicine: true,
        prescriptions: true,
        lab_tests: true,
        pharmacy: true,
        insurance: true,
        ai_assistant: true,
        analytics: true,
        custom_integrations: true,
        dedicated_support: true,
        sla: true
      }
    }
  };
  
  res.json({
    success: true,
    data: plans
  });
});

export default router;
