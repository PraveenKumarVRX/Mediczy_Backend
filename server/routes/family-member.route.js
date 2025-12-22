/**
 * Family Member Routes
 * Handles family member CRUD operations with membership validation
 */

import express from 'express';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';
import { validateFamilyMemberAddition, getFamilyMemberLimits } from '../services/family-member-validation.service.js';

const router = express.Router();

/**
 * GET /api/family-members/limits
 * Get family member limits based on membership type
 */
router.get('/limits', authUser, async (req, res) => {
  try {
    const limits = await getFamilyMemberLimits(req.user.id);
    
    res.json({
      success: true,
      limits
    });
  } catch (error) {
    console.error('Get family member limits error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get family member limits',
      error: error.message
    });
  }
});

/**
 * GET /api/family-members
 * Get all family members for the logged-in user
 */
router.get('/', authUser, async (req, res) => {
  try {
    const familyMembers = await FamilyMember.findAll({
      where: {
        userId: req.user.id,
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: familyMembers
    });
  } catch (error) {
    console.error('Get family members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch family members',
      error: error.message
    });
  }
});

/**
 * GET /api/family-members/:id
 * Get a specific family member
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const familyMember = await FamilyMember.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });
    
    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }
    
    res.json({
      success: true,
      data: familyMember
    });
  } catch (error) {
    console.error('Get family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch family member',
      error: error.message
    });
  }
});

/**
 * POST /api/family-members
 * Add a new family member with membership validation
 */
router.post('/', authUser, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      relationship,
      dateOfBirth,
      gender,
      phoneNumber,
      email,
      bloodType,
      allergies,
      medications,
      chronicConditions,
      abhaHealthId,
      medicalHistory,
      emergencyContact
    } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !relationship || !gender) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firstName, lastName, relationship, gender'
      });
    }

    // Validate family member addition based on membership type
    const validation = await validateFamilyMemberAddition(req.user.id, relationship);
    
    if (!validation.allowed) {
      return res.status(403).json({
        success: false,
        message: validation.reason
      });
    }
    
    // Check if ABHA ID already exists
    if (abhaHealthId) {
      const existingMember = await FamilyMember.findOne({
        where: { abhaHealthId }
      });
      
      if (existingMember) {
        return res.status(400).json({
          success: false,
          message: 'This ABHA Health ID is already registered'
        });
      }
    }
    
    const familyMember = await FamilyMember.create({
      userId: req.user.id,
      firstName,
      lastName,
      relationship: relationship.toLowerCase(),
      dateOfBirth,
      gender,
      phoneNumber,
      email,
      bloodType,
      allergies: allergies || [],
      medications: medications || [],
      chronicConditions: chronicConditions || [],
      abhaHealthId,
      medicalHistory: medicalHistory || {},
      emergencyContact: emergencyContact || {}
    });
    
    res.status(201).json({
      success: true,
      message: 'Family member added successfully',
      data: familyMember,
      remaining: validation.remaining
    });
  } catch (error) {
    console.error('Create family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add family member',
      error: error.message
    });
  }
});

/**
 * PUT /api/family-members/:id
 * Update a family member
 */
router.put('/:id', authUser, async (req, res) => {
  try {
    const familyMember = await FamilyMember.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });
    
    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }
    
    const {
      firstName,
      lastName,
      relationship,
      dateOfBirth,
      gender,
      phoneNumber,
      email,
      bloodType,
      allergies,
      medications,
      chronicConditions,
      abhaHealthId,
      medicalHistory,
      emergencyContact,
      profileImage
    } = req.body;
    
    // Check if ABHA ID already exists (excluding current member)
    if (abhaHealthId && abhaHealthId !== familyMember.abhaHealthId) {
      const existingMember = await FamilyMember.findOne({
        where: { abhaHealthId }
      });
      
      if (existingMember) {
        return res.status(400).json({
          success: false,
          message: 'This ABHA Health ID is already registered'
        });
      }
    }
    
    await familyMember.update({
      firstName: firstName || familyMember.firstName,
      lastName: lastName || familyMember.lastName,
      relationship: relationship || familyMember.relationship,
      dateOfBirth: dateOfBirth !== undefined ? dateOfBirth : familyMember.dateOfBirth,
      gender: gender || familyMember.gender,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : familyMember.phoneNumber,
      email: email !== undefined ? email : familyMember.email,
      bloodType: bloodType !== undefined ? bloodType : familyMember.bloodType,
      allergies: allergies !== undefined ? allergies : familyMember.allergies,
      medications: medications !== undefined ? medications : familyMember.medications,
      chronicConditions: chronicConditions !== undefined ? chronicConditions : familyMember.chronicConditions,
      abhaHealthId: abhaHealthId !== undefined ? abhaHealthId : familyMember.abhaHealthId,
      medicalHistory: medicalHistory !== undefined ? medicalHistory : familyMember.medicalHistory,
      emergencyContact: emergencyContact !== undefined ? emergencyContact : familyMember.emergencyContact,
      profileImage: profileImage !== undefined ? profileImage : familyMember.profileImage
    });
    
    res.json({
      success: true,
      message: 'Family member updated successfully',
      data: familyMember
    });
  } catch (error) {
    console.error('Update family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update family member',
      error: error.message
    });
  }
});

/**
 * DELETE /api/family-members/:id
 * Delete (soft delete) a family member
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const familyMember = await FamilyMember.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });
    
    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }
    
    // Soft delete
    await familyMember.update({ isActive: false });
    
    res.json({
      success: true,
      message: 'Family member removed successfully'
    });
  } catch (error) {
    console.error('Delete family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove family member',
      error: error.message
    });
  }
});

export default router;
