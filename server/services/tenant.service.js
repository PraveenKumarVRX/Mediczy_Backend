/**
 * Tenant Onboarding Service
 * Handles complete organization registration workflow
 */

import Tenant from '../models/postgres/tenant.model.postgres.js';
import { User } from '../models/index.js';
import bcrypt from 'bcrypt';
// Email service will be added later
const sendEmail = async () => { console.log('Email service placeholder'); };

/**
 * Complete tenant onboarding workflow
 */
export async function onboardTenant(data) {
  const {
    // Organization details
    name,
    type,
    email,
    phone,
    website,
    address,
    registration_number,
    tax_id,
    
    // Plan selection
    plan = 'free',
    billing_cycle = 'monthly',
    
    // Owner details
    owner_first_name,
    owner_last_name,
    owner_email,
    owner_password,
    owner_phone,
    
    // Optional customization
    branding,
    settings
  } = data;
  
  try {
    // Step 1: Create tenant
    const slug = generateSlug(name);
    const subdomain = slug.substring(0, 63);
    
    const tenant = await Tenant.create({
      name,
      slug,
      subdomain,
      type,
      email,
      phone,
      website,
      address: address || {},
      registration_number,
      tax_id,
      plan,
      billing_cycle,
      plan_start_date: new Date(),
      plan_end_date: calculatePlanEndDate(plan, billing_cycle),
      status: 'pending',
      branding: branding || {},
      settings: settings || {},
      limits: getPlanLimits(plan),
      usage: {
        users: 0,
        doctors: 0,
        appointments_this_month: 0,
        storage_gb: 0
      },
      features: getPlanFeatures(plan)
    });
    
    // Step 2: Create owner admin account
    const hashedPassword = await bcrypt.hash(owner_password, 10);
    
    const owner = await User.create({
      firstName: owner_first_name,
      lastName: owner_last_name,
      email: owner_email,
      password: hashedPassword,
      phoneNumber: owner_phone,
      dateOfBirth: new Date('1990-01-01'), // Placeholder
      gender: 'Other',
      role: 'admin',
      tenant_id: tenant.id,
      organization_id: tenant.id,
      organization_type: type,
      isVerified: false,
      metadata: {
        is_tenant_owner: true,
        onboarded_at: new Date()
      }
    });
    
    // Step 3: Update tenant with owner_id
    await tenant.update({ owner_id: owner.id });
    
    // Step 4: Send verification email
    await sendVerificationEmail(tenant, owner);
    
    // Step 5: Create initial data (roles, permissions, etc.)
    await createInitialData(tenant);
    
    // Step 6: Increment usage
    await tenant.incrementUsage('users', 1);
    
    return {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subdomain: tenant.subdomain,
        type: tenant.type,
        plan: tenant.plan,
        access_url: `https://${tenant.subdomain}.mayden.in`,
        status: tenant.status
      },
      owner: {
        id: owner.id,
        email: owner.email,
        name: `${owner.firstName} ${owner.lastName}`
      }
    };
  } catch (error) {
    console.error('Tenant onboarding error:', error);
    throw error;
  }
}

/**
 * Generate URL-safe slug from name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Calculate plan end date
 */
function calculatePlanEndDate(plan, billing_cycle) {
  if (plan === 'free') return null;
  
  const now = new Date();
  switch (billing_cycle) {
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'quarterly':
      return new Date(now.setMonth(now.getMonth() + 3));
    case 'annual':
      return new Date(now.setFullYear(now.getFullYear() + 1));
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

/**
 * Get plan limits
 */
function getPlanLimits(plan) {
  const limits = {
    free: {
      users: 10,
      doctors: 3,
      appointments_per_month: 50,
      storage_gb: 2
    },
    basic: {
      users: 50,
      doctors: 10,
      appointments_per_month: 500,
      storage_gb: 20
    },
    professional: {
      users: 200,
      doctors: 50,
      appointments_per_month: 2000,
      storage_gb: 100
    },
    enterprise: {
      users: -1, // Unlimited
      doctors: -1,
      appointments_per_month: -1,
      storage_gb: -1
    }
  };
  
  return limits[plan] || limits.free;
}

/**
 * Get plan features
 */
function getPlanFeatures(plan) {
  const features = {
    free: {
      appointments: true,
      telemedicine: false,
      prescriptions: true,
      lab_tests: false,
      pharmacy: false,
      insurance: false,
      ai_assistant: false,
      analytics: false
    },
    basic: {
      appointments: true,
      telemedicine: true,
      prescriptions: true,
      lab_tests: true,
      pharmacy: true,
      insurance: false,
      ai_assistant: false,
      analytics: true
    },
    professional: {
      appointments: true,
      telemedicine: true,
      prescriptions: true,
      lab_tests: true,
      pharmacy: true,
      insurance: true,
      ai_assistant: true,
      analytics: true
    },
    enterprise: {
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
  };
  
  return features[plan] || features.free;
}

/**
 * Send verification email
 */
async function sendVerificationEmail(tenant, owner) {
  try {
    const verificationLink = `https://mayden.in/verify-organization?token=${owner.id}-${tenant.id}`;
    
    await sendEmail({
      to: owner.email,
      subject: `Welcome to ${tenant.name} on Mediczy!`,
      html: `
        <h1>Welcome to Mediczy!</h1>
        <p>Your organization <strong>${tenant.name}</strong> has been successfully registered.</p>
        <p><strong>Access URL:</strong> <a href="https://${tenant.subdomain}.mayden.in">https://${tenant.subdomain}.mayden.in</a></p>
        <p><strong>Plan:</strong> ${tenant.plan}</p>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>Thank you for choosing Mediczy!</p>
      `
    });
  } catch (error) {
    console.warn('Failed to send verification email:', error.message);
  }
}

/**
 * Create initial data for tenant
 */
async function createInitialData(tenant) {
  // TODO: Create default roles and permissions
  // TODO: Create sample appointment slots
  // TODO: Setup default settings
  console.log(`Creating initial data for tenant ${tenant.id}`);
}

/**
 * Upgrade tenant plan
 */
export async function upgradePlan(tenantId, newPlan, billing_cycle = 'monthly') {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  
  const newLimits = getPlanLimits(newPlan);
  const newFeatures = getPlanFeatures(newPlan);
  const plan_end_date = calculatePlanEndDate(newPlan, billing_cycle);
  
  await tenant.update({
    plan: newPlan,
    billing_cycle,
    plan_start_date: new Date(),
    plan_end_date,
    limits: newLimits,
    features: newFeatures
  });
  
  return tenant;
}

/**
 * Check if tenant can create resource
 */
export async function checkTenantLimit(tenantId, limitType) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  
  return !tenant.hasReachedLimit(limitType);
}

export default {
  onboardTenant,
  upgradePlan,
  checkTenantLimit
};
