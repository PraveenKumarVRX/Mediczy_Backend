import express from 'express';
import { body, validationResult } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import Address from '../models/address.model.intelligent.js';
import googlePlacesService from '../services/google-places.service.js';

const router = express.Router();

/**
 * @route   GET /api/addresses/autocomplete
 * @desc    Autocomplete address search using Google Places API
 * @access  Private
 */
router.get('/autocomplete', authUser, async (req, res) => {
  try {
    const { input, country } = req.query;

    if (!input || input.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 3 characters'
      });
    }

    const options = {};
    if (country) {
      options.components = `country:${country}`;
    }

    const predictions = await googlePlacesService.autocomplete(input, options);

    return res.json({
      success: true,
      data: predictions
    });
  } catch (error) {
    console.error('Address autocomplete error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch address suggestions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/addresses/place/:placeId
 * @desc    Get detailed address information from Google Place ID
 * @access  Private
 */
router.get('/place/:placeId', authUser, async (req, res) => {
  try {
    const { placeId } = req.params;

    const placeDetails = await googlePlacesService.getPlaceDetails(placeId);

    return res.json({
      success: true,
      data: placeDetails
    });
  } catch (error) {
    console.error('Get place details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch place details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/addresses
 * @desc    Add new address for user
 * @access  Private
 */
router.post('/', [
  authUser,
  body('formattedAddress').notEmpty().withMessage('Address is required'),
  body('label').optional().isIn(['home', 'office', 'other']).withMessage('Label must be home, office, or other')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.user.id;
    const {
      placeId,
      formattedAddress,
      street,
      street2,
      city,
      state,
      zipCode,
      country,
      countryCode,
      latitude,
      longitude,
      landmark,
      deliveryInstructions,
      label = 'home',
      isDefault = false
    } = req.body;

    // If this is the user's first address, make it default
    const existingAddresses = await Address.getUserAddresses(userId);
    const shouldBeDefault = existingAddresses.length === 0 || isDefault;

    // Create address
    const address = await Address.create({
      userId,
      placeId,
      formattedAddress,
      street,
      street2,
      city,
      state,
      zipCode,
      country,
      countryCode,
      latitude,
      longitude,
      landmark,
      deliveryInstructions,
      label,
      isDefault: shouldBeDefault
    });

    // If setting as default, unset other defaults
    if (shouldBeDefault && existingAddresses.length > 0) {
      await Address.setAsDefault(address.id, userId);
    }

    console.log(`✅ Address added for user ${userId}:`, address.label);

    return res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: address
    });
  } catch (error) {
    console.error('Add address error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/addresses
 * @desc    Get all addresses for current user
 * @access  Private
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const addresses = await Address.getUserAddresses(userId);

    return res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/addresses/default
 * @desc    Get user's default address
 * @access  Private
 */
router.get('/default', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const address = await Address.getDefault(userId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'No default address found'
      });
    }

    return res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('Get default address error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch default address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/addresses/:id
 * @desc    Get specific address by ID
 * @access  Private
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const address = await Address.findOne({
      where: { id, userId, isActive: true }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    return res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('Get address error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/addresses/:id
 * @desc    Update address
 * @access  Private
 */
router.put('/:id', [
  authUser,
  body('label').optional().isIn(['home', 'office', 'other']).withMessage('Label must be home, office, or other')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.user.id;
    const { id } = req.params;

    const address = await Address.findOne({
      where: { id, userId }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update allowed fields
    const allowedFields = [
      'street', 'street2', 'city', 'state', 'zipCode', 
      'country', 'landmark', 'deliveryInstructions', 'label'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        address[field] = req.body[field];
      }
    });

    await address.save();

    console.log(`✅ Address ${id} updated for user ${userId}`);

    return res.json({
      success: true,
      message: 'Address updated successfully',
      data: address
    });
  } catch (error) {
    console.error('Update address error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/addresses/:id/set-default
 * @desc    Set address as default
 * @access  Private
 */
router.put('/:id/set-default', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const address = await Address.findOne({
      where: { id, userId, isActive: true }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    await Address.setAsDefault(id, userId);

    console.log(`✅ Address ${id} set as default for user ${userId}`);

    return res.json({
      success: true,
      message: 'Address set as default successfully'
    });
  } catch (error) {
    console.error('Set default address error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set default address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   DELETE /api/addresses/:id
 * @desc    Delete address (soft delete)
 * @access  Private
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const address = await Address.findOne({
      where: { id, userId }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Soft delete
    address.isActive = false;
    await address.save();

    // If this was the default address, set another as default
    if (address.isDefault) {
      const otherAddresses = await Address.getUserAddresses(userId);
      if (otherAddresses.length > 0) {
        await Address.setAsDefault(otherAddresses[0].id, userId);
      }
    }

    console.log(`✅ Address ${id} deleted for user ${userId}`);

    return res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Delete address error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
