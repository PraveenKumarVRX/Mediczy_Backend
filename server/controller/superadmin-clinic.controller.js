/**
 * Super Admin - Clinic Management Controller
 * Handles clinic creation, admin setup, and management
 */

import Tenant from '../models/postgres/tenant.model.postgres.js';
import User from '../models/postgres/user.model.postgres.js';
import OrganizationAdmin from '../models/postgres/organization-admin.model.postgres.js';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { JWT_CONFIG } from '../config/auth.config.js';

const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * Create new clinic and clinic admin
 * Super admin (admin@mediczy.com) creates clinic and clinic admin user
 */
export const createClinicWithAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    // Extract clinic and admin data
    const {
      // Clinic information
      clinic_name,
      clinic_email,
      clinic_phone,
      clinic_type = 'clinic',
      clinic_slug,
      clinic_address,
      clinic_city,
      clinic_state,
      clinic_pincode,
      registration_number,
      tax_id,

      // Clinic admin information
      admin_email,
      admin_password,
      admin_first_name,
      admin_last_name,

      // Plan
      plan = 'basic',

      // Optional settings
      timezone = 'Asia/Kolkata',
      language = 'en',
      currency = 'INR'
    } = req.body;

    // Validate required fields
    if (!clinic_name || !clinic_email || !clinic_phone || !admin_email || !admin_password || !admin_first_name || !admin_last_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: clinic_name, clinic_email, clinic_phone, admin_email, admin_password, admin_first_name, admin_last_name'
      });
    }

    console.log('🏥 Creating new clinic:', { clinic_name, clinic_email, admin_email });

    // Check if clinic email already exists
    const existingClinic = await Tenant.findOne({
      where: { email: clinic_email }
    });

    if (existingClinic) {
      return res.status(409).json({
        success: false,
        message: 'Clinic with this email already exists'
      });
    }

    // Check if admin email already exists
    const existingAdminEmail = await Tenant.findOne({
      where: { admin_email }
    });

    if (existingAdminEmail) {
      return res.status(409).json({
        success: false,
        message: 'Admin email already registered for another clinic'
      });
    }

    // Check if user with admin email exists
    const existingUser = await User.findOne({
      where: { email: admin_email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User account with this email already exists'
      });
    }

    // Generate clinic slug if not provided; subdomain mirrors DNS label (e.g. ajdental)
    const slug = clinic_slug || clinic_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const subdomain = String(req.body.clinic_subdomain || slug).toLowerCase().trim().slice(0, 63);

    // Create clinic tenant
    const clinic = await Tenant.create({
      name: clinic_name,
      email: clinic_email,
      phone: clinic_phone,
      type: clinic_type,
      slug: slug,
      subdomain,
      admin_email: admin_email,
      admin_password: admin_password, // Will be hashed by model hook
      registration_number: registration_number || null,
      tax_id: tax_id || null,
      plan: plan,
      status: 'active',
      is_verified: true,
      verified_at: new Date(),
      address: {
        street: clinic_address || '',
        city: clinic_city || '',
        state: clinic_state || '',
        pincode: clinic_pincode || ''
      },
      settings: {
        timezone,
        language,
        currency,
        date_format: 'DD/MM/YYYY',
        time_format: '24h'
      },
      metadata: {
        created_by_super_admin: true,
        created_at: new Date().toISOString()
      }
    });

    console.log('✅ Clinic created:', { clinic_id: clinic.id, clinic_name: clinic.name });

    // Create clinic admin user
    const adminUser = await User.create({
      email: admin_email,
      password: admin_password, // Will be hashed by model hook
      firstName: admin_first_name,
      lastName: admin_last_name,
      phoneNumber: clinic_phone,
      dateOfBirth: new Date(), // Default - can be updated later
      gender: 'Other', // Default - can be updated later
      role: 'clinic_admin',
      organization_id: clinic.id,
      organization_type: 'clinic',
      tenant_id: clinic.id,
      status: 'active',
      is_verified: true,
      verified_at: new Date(),
      permissions: {
        staff_management: true,
        staff_creation: true,
        staff_edit: true,
        staff_delete: true,
        appointments: true,
        reports: true,
        billing: false,
        settings: true
      },
      scope: {
        clinic_id: clinic.id,
        access_type: 'full_clinic'
      }
    });

    console.log('✅ Clinic admin user created:', { user_id: adminUser.id, email: adminUser.email });

    // Create organization admin mapping
    const orgAdmin = await OrganizationAdmin.create({
      user_id: adminUser.id,
      tenant_id: clinic.id,
      admin_role: 'org_admin',
      permissions: {
        staff_management: true,
        staff_creation: true,
        staff_edit: true,
        staff_delete: true,
        appointments: true,
        reports: true,
        settings: true
      },
      scope: {
        clinic_id: clinic.id,
        access_type: 'full_clinic'
      },
      is_primary: true,
      status: 'active'
    });

    console.log('✅ Organization admin mapping created:', { org_admin_id: orgAdmin.id });

    // Update clinic with admin user ID
    clinic.admin_user_id = adminUser.id;
    clinic.admin_users = [adminUser.id];
    await clinic.save();

    // Provision hospitals login row so subdomain /login works
    let clinicPortal = null;
    try {
      const { provisionClinicPortal } = await import('../services/clinic-portal.service.js');
      clinicPortal = await provisionClinicPortal({
        tenantId: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain || subdomain,
        slug: clinic.slug || slug,
        email: admin_email,
        password: admin_password,
        phone: clinic_phone,
        plan,
        city: clinic_city,
        specialty: 'dental',
        code: String(clinic.subdomain || subdomain || 'CLINIC').toUpperCase(),
        admin_first_name,
        admin_last_name,
        registrationNumber: registration_number,
      });
    } catch (portalErr) {
      console.error('Clinic portal hospital provisioning failed:', portalErr);
    }

    // Generate JWT token for clinic admin
    const token = jwt.sign(
      {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        organization_id: clinic.id,
        tenant_id: clinic.id,
        type: 'clinic_admin'
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log('✅ Clinic creation successful:', clinic_name);

    res.status(201).json({
      success: true,
      message: 'Clinic and admin created successfully',
      data: {
        clinic: {
          id: clinic.id,
          uid: clinic.uid,
          name: clinic.name,
          email: clinic.email,
          phone: clinic.phone,
          type: clinic.type,
          slug: clinic.slug,
          status: clinic.status,
          plan: clinic.plan,
          address: clinic.address
        },
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          first_name: adminUser.firstName,
          last_name: adminUser.lastName,
          role: adminUser.role
        },
        token: token,
        portal: clinicPortal,
        login_url: clinic.subdomain ? `https://${clinic.subdomain}.mediqzy.com/login` : null,
      }
    });
  } catch (error) {
    console.error('❌ Error creating clinic with admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create clinic',
      error: error.message
    });
  }
};

/**
 * List all clinics (super admin only)
 */
export const listClinics = async (req, res) => {
  try {
    const { status, plan, type, search, limit = 20, offset = 0 } = req.query;

    const where = { type: 'clinic' };

    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (type) where.type = type;
    if (search) {
      where[require('sequelize').Op.or] = [
        { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { email: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { admin_email: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Tenant.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'uid', 'name', 'email', 'phone', 'slug', 'type', 'status', 'plan', 'admin_email', 'admin_user_id', 'createdAt']
    });

    res.json({
      success: true,
      data: {
        clinics: rows,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Error listing clinics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list clinics',
      error: error.message
    });
  }
};

/**
 * Get clinic details by ID (super admin only)
 */
export const getClinicDetails = async (req, res) => {
  try {
    const { clinicId } = req.params;

    const clinic = await Tenant.findByPk(clinicId, {
      include: [
        {
          model: User,
          as: 'admin',
          where: { role: 'clinic_admin' },
          required: false,
          attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'status', 'createdAt']
        }
      ]
    });

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found'
      });
    }

    // Count staff
    const staffCount = await User.count({
      where: {
        organization_id: clinic.id,
        role: { [require('sequelize').Op.in]: ['doctor', 'nurse', 'doctor_assistant'] }
      }
    });

    res.json({
      success: true,
      data: {
        clinic: {
          id: clinic.id,
          uid: clinic.uid,
          name: clinic.name,
          email: clinic.email,
          phone: clinic.phone,
          type: clinic.type,
          slug: clinic.slug,
          status: clinic.status,
          plan: clinic.plan,
          address: clinic.address,
          registration_number: clinic.registration_number,
          tax_id: clinic.tax_id,
          admin_email: clinic.admin_email,
          created_at: clinic.createdAt,
          updated_at: clinic.updatedAt
        },
        admin: clinic.admin ? {
          id: clinic.admin.id,
          email: clinic.admin.email,
          first_name: clinic.admin.firstName,
          last_name: clinic.admin.lastName,
          phone: clinic.admin.phoneNumber,
          status: clinic.admin.status
        } : null,
        staff_count: staffCount
      }
    });
  } catch (error) {
    console.error('❌ Error getting clinic details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get clinic details',
      error: error.message
    });
  }
};

/**
 * Update clinic (super admin only)
 */
export const updateClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { status, plan, name, email, phone, address, settings } = req.body;

    const clinic = await Tenant.findByPk(clinicId);

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found'
      });
    }

    // Update fields
    if (name) clinic.name = name;
    if (phone) clinic.phone = phone;
    if (status) clinic.status = status;
    if (plan) clinic.plan = plan;
    if (address) clinic.address = address;
    if (settings) clinic.settings = { ...clinic.settings, ...settings };

    await clinic.save();

    console.log('✅ Clinic updated:', { clinic_id: clinic.id, clinic_name: clinic.name });

    res.json({
      success: true,
      message: 'Clinic updated successfully',
      data: {
        clinic: {
          id: clinic.id,
          name: clinic.name,
          email: clinic.email,
          phone: clinic.phone,
          status: clinic.status,
          plan: clinic.plan,
          address: clinic.address
        }
      }
    });
  } catch (error) {
    console.error('❌ Error updating clinic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update clinic',
      error: error.message
    });
  }
};

/**
 * Delete clinic (super admin only - soft delete)
 */
export const deleteClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;

    const clinic = await Tenant.findByPk(clinicId);

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found'
      });
    }

    // Soft delete: mark as cancelled
    clinic.status = 'cancelled';
    await clinic.save();

    console.log('✅ Clinic deleted (soft delete):', { clinic_id: clinic.id });

    res.json({
      success: true,
      message: 'Clinic deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting clinic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete clinic',
      error: error.message
    });
  }
};
