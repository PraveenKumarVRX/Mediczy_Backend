/**
 * Clinic Staff Management Controller
 * Allows clinic admin to create, update, and manage staff
 */

import User from '../models/postgres/user.model.postgres.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { validationResult } from 'express-validator';
import { Op } from 'sequelize';

/**
 * Create clinic staff (doctor, nurse, or doctor assistant)
 */
export const createClinicStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { clinicId } = req.params;
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      role, // 'doctor', 'nurse', or 'doctor_assistant'
      license_number,
      qualification,
      specialization,
      department,
      experience_years
    } = req.body;

    // Verify clinic exists and clinic admin is from this clinic
    const clinic = await Tenant.findByPk(clinicId);
    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found'
      });
    }

    // Verify clinic admin token's organization_id matches clinicId
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage staff for your clinic'
      });
    }

    console.log(`🏥 Creating ${role} in clinic:`, { clinic_name: clinic.name, email });

    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create staff user
    const staff = await User.create({
      email,
      password, // Will be hashed by model hook
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      dateOfBirth: new Date(), // Default date - can be updated later
      gender: 'Other', // Default - can be updated later
      role,
      organization_id: clinicId,
      organization_type: 'clinic',
      tenant_id: clinicId,
      status: 'active',
      is_verified: true,
      verified_at: new Date(),
      permissions: {
        appointments: true,
        patient_management: true,
        prescriptions: role === 'doctor',
        lab_tests: role === 'doctor',
        notes: true,
        billing: false
      },
      scope: {
        clinic_id: clinicId,
        access_type: role === 'doctor' ? 'full_access' : 'limited_access'
      },
      metadata: {
        license_number: license_number || null,
        qualification: qualification || null,
        specialization: specialization || null,
        department: department || null,
        experience_years: experience_years || 0,
        created_by_clinic_admin: true,
        clinic_name: clinic.name
      }
    });

    console.log(`✅ ${role} created successfully:`, { user_id: staff.id, email });

    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully`,
      data: {
        staff: {
          id: staff.id,
          email: staff.email,
          first_name: staff.firstName,
          last_name: staff.lastName,
          phone: staff.phoneNumber,
          role: staff.role,
          status: staff.status,
          metadata: staff.metadata
        }
      }
    });
  } catch (error) {
    console.error('❌ Error creating clinic staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create staff',
      error: error.message
    });
  }
};

/**
 * List clinic staff
 */
export const listClinicStaff = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { role, status, search, limit = 20, offset = 0 } = req.query;

    // Verify clinic admin token's organization_id matches clinicId
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view staff for your clinic'
      });
    }

    const where = {
      organization_id: parseInt(clinicId),
      role: {
        [Op.in]: ['doctor', 'nurse', 'doctor_assistant']
      }
    };

    if (role) where.role = role;
    if (status) where.status = status;

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'role', 'status', 'metadata', 'createdAt']
    });

    res.json({
      success: true,
      data: {
        staff: rows,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Error listing clinic staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list staff',
      error: error.message
    });
  }
};

/**
 * Get individual staff details
 */
export const getClinicStaffDetails = async (req, res) => {
  try {
    const { clinicId, staffId } = req.params;

    // Verify clinic admin token's organization_id matches clinicId
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view staff for your clinic'
      });
    }

    const staff = await User.findOne({
      where: {
        id: parseInt(staffId),
        organization_id: parseInt(clinicId),
        role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant'] }
      },
      attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'role', 'status', 'permissions', 'scope', 'metadata', 'createdAt', 'updatedAt']
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    res.json({
      success: true,
      data: {
        staff
      }
    });
  } catch (error) {
    console.error('❌ Error getting staff details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get staff details',
      error: error.message
    });
  }
};

/**
 * Update clinic staff
 */
export const updateClinicStaff = async (req, res) => {
  try {
    const { clinicId, staffId } = req.params;
    const { phone, license_number, qualification, specialization, department, experience_years, status } = req.body;

    // Verify clinic admin token's organization_id matches clinicId
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage staff for your clinic'
      });
    }

    const staff = await User.findOne({
      where: {
        id: parseInt(staffId),
        organization_id: parseInt(clinicId),
        role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant'] }
      }
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    // Update fields
    if (phone) staff.phone = phone;
    if (status) staff.status = status;

    // Update metadata
    if (license_number || qualification || specialization || department || experience_years !== undefined) {
      staff.metadata = {
        ...staff.metadata,
        license_number: license_number || staff.metadata?.license_number,
        qualification: qualification || staff.metadata?.qualification,
        specialization: specialization || staff.metadata?.specialization,
        department: department || staff.metadata?.department,
        experience_years: experience_years !== undefined ? experience_years : staff.metadata?.experience_years
      };
    }

    await staff.save();

    console.log(`✅ Staff updated:`, { staff_id: staff.id, email: staff.email });

    res.json({
      success: true,
      message: 'Staff updated successfully',
      data: {
        staff: {
          id: staff.id,
          email: staff.email,
          first_name: staff.firstName,
          last_name: staff.lastName,
          phone: staff.phoneNumber,
          role: staff.role,
          status: staff.status,
          metadata: staff.metadata
        }
      }
    });
  } catch (error) {
    console.error('❌ Error updating staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update staff',
      error: error.message
    });
  }
};

/**
 * Delete clinic staff (soft delete)
 */
export const deleteClinicStaff = async (req, res) => {
  try {
    const { clinicId, staffId } = req.params;

    // Verify clinic admin token's organization_id matches clinicId
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage staff for your clinic'
      });
    }

    const staff = await User.findOne({
      where: {
        id: parseInt(staffId),
        organization_id: parseInt(clinicId),
        role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant'] }
      }
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    // Soft delete: mark as inactive
    staff.status = 'inactive';
    await staff.save();

    console.log(`✅ Staff deleted (soft delete):`, { staff_id: staff.id });

    res.json({
      success: true,
      message: 'Staff deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff',
      error: error.message
    });
  }
};

/**
 * Get clinic staff statistics
 */
export const getClinicStaffStats = async (req, res) => {
  try {
    const { clinicId } = req.params;

    // Verify clinic admin token's organization_id matches clinicId
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view stats for your clinic'
      });
    }

    const doctorCount = await User.count({
      where: {
        organization_id: parseInt(clinicId),
        role: 'doctor',
        status: 'active'
      }
    });

    const nurseCount = await User.count({
      where: {
        organization_id: parseInt(clinicId),
        role: 'nurse',
        status: 'active'
      }
    });

    const assistantCount = await User.count({
      where: {
        organization_id: parseInt(clinicId),
        role: 'doctor_assistant',
        status: 'active'
      }
    });

    const totalStaff = doctorCount + nurseCount + assistantCount;

    res.json({
      success: true,
      data: {
        staff_statistics: {
          total_staff: totalStaff,
          doctors: doctorCount,
          nurses: nurseCount,
          assistants: assistantCount
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting staff stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get staff statistics',
      error: error.message
    });
  }
};
