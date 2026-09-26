import express from 'express';
import { Op, Sequelize } from 'sequelize';
import Lab from '../models/postgres/lab.model.postgres.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import { Appointment } from '../models/index.js';
import { authUser } from '../middleware/auth.middleware.js';
import { orchestrator } from '../db/orchestrator.js';

const router = express.Router();

/**
 * Enhanced Laboratory Routes
 * =========================
 * 
 * Comprehensive laboratory management with advanced search,
 * filtering, and detailed information retrieval.
 */

// GET /api/labs - Enhanced lab search and listing
router.get('/', async (req, res) => {
  try {
    const {
      // Search parameters
      search,
      city,
      state,
      pincode,
      
      // Service filters
      services,
      testCategories,
      accreditation,
      
      // Feature filters
      homeSampleCollection,
      emergencyServices,
      isVerified,
      featured,
      
      // Quality filters
      minRating,
      maxPrice,
      
      // Geographic filters
      latitude,
      longitude,
      radius,
      
      // Sorting and pagination
      sortBy = 'rating',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
      
      // Response format
      includeDetails = false
    } = req.query;

    // Build where conditions
    let whereConditions = { status: 'active' };
    
    // Multi-word cross-field search: split into tokens, each token must match
    // name OR address (city/street/state) OR services OR testCatalog
    if (search) {
      const tokens = search.trim().split(/\s+/).filter(w => w.length >= 2);
      if (tokens.length === 0) {
        // no-op
      } else if (tokens.length === 1) {
        // Single word — fast OR across all fields
        const t = tokens[0].replace(/'/g, "''");
        whereConditions[Op.or] = [
          { name: { [Op.iLike]: `%${t}%` } },
          Sequelize.literal(`address->>'city' ILIKE '%${t}%'`),
          Sequelize.literal(`address->>'street' ILIKE '%${t}%'`),
          Sequelize.literal(`address->>'state' ILIKE '%${t}%'`),
          Sequelize.literal(`services::text ILIKE '%${t}%'`),
          Sequelize.literal(`"testCatalog"::text ILIKE '%${t}%'`)
        ];
      } else {
        // Multiple words — EACH token must match at least one field (AND of ORs)
        // This lets "agilus ashok nagar" match labs named Agilus in Ashok Nagar
        whereConditions[Op.and] = whereConditions[Op.and] || [];
        for (const token of tokens) {
          const t = token.replace(/'/g, "''");
          whereConditions[Op.and].push(Sequelize.literal(`(
            name ILIKE '%${t}%'
            OR address->>'city' ILIKE '%${t}%'
            OR address->>'street' ILIKE '%${t}%'
            OR address->>'state' ILIKE '%${t}%'
            OR services::text ILIKE '%${t}%'
            OR "testCatalog"::text ILIKE '%${t}%'
          )`));
        }
      }
    }
    
    // Location filters - use JSONB operators for PostgreSQL
    // Store search words for sorting later
    let searchWords = [];
    if (city) {
      // Case-insensitive city search - search in city, street, and state fields
      // Split search query into words and match ANY word in address fields
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      searchWords = city.trim().split(/\s+/).filter(w => w.length >= 2);
      
      if (searchWords.length > 0) {
        // Build OR conditions for each word across all address fields
        const wordConditions = searchWords.map(word => {
          const wordEscaped = word.replace(/'/g, "''");
          return `(
            "address"->>'city' ILIKE '%${wordEscaped}%' 
            OR "address"->>'street' ILIKE '%${wordEscaped}%'
            OR "address"->>'state' ILIKE '%${wordEscaped}%'
            OR "address"->>'zipCode' ILIKE '%${wordEscaped}%'
          )`;
        });
        
        // Match ANY word (more inclusive search) - will sort by relevance later
        whereConditions[Op.and].push(
          Sequelize.literal(`(${wordConditions.join(' OR ')})`)
        );
      }
    }
    
    if (state) {
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push(
        Sequelize.literal(`"address"->>'state' ILIKE '%${state.replace(/'/g, "''")}%'`)
      );
    }
    
    if (pincode) {
      const pincodeEscaped = pincode.replace(/'/g, "''");
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      
      // First try exact match, if no results, search by prefix (first 3 digits = region)
      // Indian pincodes: first 3 digits represent the region/district
      const pincodePrefix = pincodeEscaped.substring(0, 3);
      whereConditions[Op.and].push(
        Sequelize.literal(`"address"->>'zipCode' LIKE '${pincodePrefix}%'`)
      );
    }
    
    // Service filters
    if (services) {
      const serviceList = services.split(',');
      const svc = serviceList[0].replace(/'/g, "''");
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push(
        Sequelize.literal(`services::text ILIKE '%${svc}%'`)
      );
    }
    
    if (testCategories) {
      const categoryList = testCategories.split(',');
      const cat = categoryList[0].replace(/'/g, "''");
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push(
        Sequelize.literal(`"testCatalog"::text ILIKE '%${cat}%'`)
      );
    }
    
    if (accreditation) {
      whereConditions.accreditation = { [Op.iLike]: `%${accreditation}%` };
    }
    
    // Feature filters - facilities is JSONB array in PostgreSQL
    // Skip these filters for now as they require JSONB queries
    
    // Quality filters
    if (minRating) {
      whereConditions.rating = {
        [Op.gte]: parseFloat(minRating)
      };
    }
    
    if (isVerified !== undefined) {
      whereConditions.isVerified = isVerified === 'true';
    }
    
    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build order clause - for pincode search, show exact matches first
    let orderClause = [[sortBy, sortOrder.toUpperCase()]];
    if (pincode) {
      // Sort by exact pincode match first, then by rating
      orderClause = [
        [Sequelize.literal(`CASE WHEN "address"->>'zipCode' = '${pincode.replace(/'/g, "''")}' THEN 0 ELSE 1 END`), 'ASC'],
        ['rating', 'DESC']
      ];
    } else if (searchWords && searchWords.length > 1) {
      // For multi-word city search, sort by number of matching words (relevance)
      const relevanceScores = searchWords.map(word => {
        const wordEscaped = word.replace(/'/g, "''");
        return `CASE WHEN (
          "address"->>'city' ILIKE '%${wordEscaped}%' 
          OR "address"->>'street' ILIKE '%${wordEscaped}%'
          OR "address"->>'state' ILIKE '%${wordEscaped}%'
        ) THEN 1 ELSE 0 END`;
      });
      orderClause = [
        [Sequelize.literal(`(${relevanceScores.join(' + ')})`), 'DESC'],
        ['rating', 'DESC']
      ];
    }
    
    // Execute query
    const { rows: labs, count: total } = await Lab.findAndCountAll({
      where: whereConditions,
      order: orderClause,
      limit: parseInt(limit),
      offset: offset
    });
    
    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      success: true,
      total,
      count: labs.length,
      labs,
      searchedPincode: pincode || null,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalLabs: total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('Error fetching labs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch laboratories',
      error: error.message
    });
  }
});

// GET /api/labs/:id - Get detailed lab information

// ─────────────────────────────────────────────────────────────────
// GET /api/labs/team-bookings
// Returns lab appointments booked by the currently logged-in team/user
// ─────────────────────────────────────────────────────────────────
router.get('/team-bookings', authUser, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [appointments, total] = await Promise.all([
      Appointment.findAll({
        where: { userId: req.user.id, type: 'lab' },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset
      }),
      Appointment.count({ where: { userId: req.user.id, type: 'lab' } })
    ]);

    return res.json({
      success: true,
      total,
      page: parseInt(page),
      appointments: appointments.map(a => ({
        id: a.id,
        patientName: a.patientName,
        patientPhone: a.patientPhone,
        labName: a.clinicName,
        labAddress: a.clinicAddress,
        appointmentDate: a.appointmentDate,
        appointmentTime: a.appointmentTime,
        status: a.status,
        serviceType: a.metadata?.serviceType,
        testType: a.metadata?.testType,
        totalFee: a.metadata?.totalFee,
        notes: a.patientDetails?.notes,
        bookedAt: a.createdAt
      }))
    });
  } catch (err) {
    console.error('[Labs] GET /team-bookings error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/labs/search/advanced - Advanced search with test-specific queries
router.get('/search/advanced', async (req, res) => {
  try {
    const {
      testName,
      testCategory,
      urgentTest,
      priceRange,
      homeCollection,
      reportTime,
      equipment,
      location
    } = req.query;
    
    let searchConditions = { status: 'active' };
    let recommendations = [];
    
    // Test-specific search
    if (testName) {
      const relevantCategories = findTestCategories(testName);
      if (relevantCategories.length > 0) {
        searchConditions[Op.or] = relevantCategories.map(category => (
          Sequelize.literal(`"testCatalog"::text ILIKE '%${category.replace(/'/g,"''")}%'`)
        ));
        recommendations.push(`Test "${testName}" is typically available in ${relevantCategories.join(', ')} categories`);
      }
    }
    
    // Category-based filtering
    if (testCategory) {
      searchConditions[Op.and] = searchConditions[Op.and] || [];
      searchConditions[Op.and].push(
        Sequelize.literal(`"testCatalog"::text ILIKE '%${testCategory.replace(/'/g,"''")}%'`)
      );
    }
    
    // Urgent test requirements
    if (urgentTest === 'true') {
      searchConditions.emergencyServices = true;
      recommendations.push('Showing labs with emergency/urgent testing capabilities');
    }
    
    // Home collection filter
    if (homeCollection === 'true') {
      searchConditions.homeSampleCollection = true;
    }
    
    // Equipment-based search
    if (equipment) {
      searchConditions.equipment = {
        [Op.like]: `%${equipment}%`
      };
    }
    
    const labs = await Lab.findAll({
      where: searchConditions,
      order: [
        ['featured', 'DESC'],
        ['rating', 'DESC'],
        ['totalReviews', 'DESC']
      ],
      limit: 50
    });
    
    // Enhanced results with test availability prediction
    const enhancedResults = labs.map(lab => ({
      ...lab.toJSON(),
      testAvailability: predictTestAvailability(lab, testName),
      estimatedCost: estimateTestCost(lab, testName),
      estimatedTime: estimateReportTime(lab, testName),
      suitabilityScore: calculateSuitabilityScore(lab, req.query)
    }));
    
    res.json({
      success: true,
      data: {
        labs: enhancedResults,
        recommendations,
        searchCriteria: req.query,
        totalResults: enhancedResults.length
      }
    });
    
  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({
      success: false,
      message: 'Advanced search failed',
      error: error.message
    });
  }
});

// GET /api/labs/categories/tests - Get comprehensive test categories
router.get('/categories/tests', (req, res) => {
  try {
    const { category, detailed = false } = req.query;
    const TEST_CATEGORIES = Lab.COMPREHENSIVE_TEST_CATEGORIES || {};

    if (category) {
      const categoryData = TEST_CATEGORIES[category];
      if (!categoryData) {
        return res.status(404).json({
          success: false,
          message: 'Test category not found'
        });
      }
      
      res.json({
        success: true,
        data: {
          category: categoryData,
          totalTests: Object.values(categoryData.subcategories || {})
            .reduce((total, sub) => total + (sub.tests?.length || 0), 0)
        }
      });
    } else {
      const categories = detailed === 'true' 
        ? TEST_CATEGORIES
        : Object.keys(TEST_CATEGORIES).reduce((acc, key) => {
            acc[key] = {
              name: TEST_CATEGORIES[key].name,
              subcategories: Object.keys(TEST_CATEGORIES[key].subcategories || {})
            };
            return acc;
          }, {});
      
      res.json({
        success: true,
        data: {
          categories,
          totalCategories: Object.keys(TEST_CATEGORIES).length
        }
      });
    }
  } catch (error) {
    console.error('Error fetching test categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test categories',
      error: error.message
    });
  }
});

// GET /api/labs/equipment/types - Get equipment categories and capabilities
router.get('/equipment/types', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        equipment: Lab.EQUIPMENT_CATEGORIES,
        accreditations: Lab.ACCREDITATION_TYPES,
        qualityIndicators: Lab.QUALITY_INDICATORS
      }
    });
  } catch (error) {
    console.error('Error fetching equipment types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment types',
      error: error.message
    });
  }
});

// GET /api/labs/statistics - Get comprehensive lab statistics
router.get('/statistics', async (req, res) => {
  try {
    const [
      totalLabs,
      verifiedLabs,
      featuredLabs,
      homeCollectionLabs,
      emergencyLabs,
      avgRating,
      totalReviews,
      categoryStats,
      stateStats
    ] = await Promise.all([
      Lab.count({ where: { status: 'active' } }),
      Lab.count({ where: { status: 'active', isVerified: true } }),
      Lab.count({ where: { status: 'active', featured: true } }),
      Lab.count({ where: { status: 'active', homeSampleCollection: true } }),
      Lab.count({ where: { status: 'active', emergencyServices: true } }),
      Lab.findOne({
        where: { status: 'active' },
        attributes: [[Lab.sequelize.fn('AVG', Lab.sequelize.col('rating')), 'avgRating']]
      }),
      Lab.findOne({
        where: { status: 'active' },
        attributes: [[Lab.sequelize.fn('SUM', Lab.sequelize.col('totalReviews')), 'totalReviews']]
      }),
      Lab.findAll({
        where: { status: 'active' },
        attributes: ['address']
      }),
      Lab.findAll({
        where: { status: 'active' },
        attributes: ['address']
      })
    ]);
    
    // Process state statistics
    const stateDistribution = {};
    stateStats.forEach(lab => {
      try {
        const address = typeof lab.address === 'string' ? JSON.parse(lab.address) : lab.address;
        const state = address.state || 'Unknown';
        stateDistribution[state] = (stateDistribution[state] || 0) + 1;
      } catch (e) {
        stateDistribution['Unknown'] = (stateDistribution['Unknown'] || 0) + 1;
      }
    });
    
    res.json({
      success: true,
      data: {
        overview: {
          totalLaboratories: totalLabs,
          verifiedLaboratories: verifiedLabs,
          featuredLaboratories: featuredLabs,
          homeCollectionAvailable: homeCollectionLabs,
          emergencyServicesAvailable: emergencyLabs,
          averageRating: parseFloat(avgRating?.dataValues?.avgRating || 0).toFixed(2),
          totalReviews: parseInt(totalReviews?.dataValues?.totalReviews || 0)
        },
        distribution: {
          byState: stateDistribution,
          topStates: Object.entries(stateDistribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
        },
        features: {
          verificationRate: ((verifiedLabs / totalLabs) * 100).toFixed(1),
          homeCollectionRate: ((homeCollectionLabs / totalLabs) * 100).toFixed(1),
          emergencyServiceRate: ((emergencyLabs / totalLabs) * 100).toFixed(1),
          featuredRate: ((featuredLabs / totalLabs) * 100).toFixed(1)
        },
        testCapabilities: Lab.COMPREHENSIVE_TEST_CATEGORIES ? {
          totalCategories: Object.keys(Lab.COMPREHENSIVE_TEST_CATEGORIES).length,
          totalTests: Object.values(Lab.COMPREHENSIVE_TEST_CATEGORIES)
            .reduce((total, category) => {
              return total + Object.values(category.subcategories || {})
                .reduce((subTotal, sub) => subTotal + (sub.tests?.length || 0), 0);
            }, 0)
        } : { totalCategories: 0, totalTests: 0 }
      }
    });
    
  } catch (error) {
    console.error('Error fetching lab statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch laboratory statistics',
      error: error.message
    });
  }
});

// Helper functions
function findTestCategories(testName) {
  const categories = [];
  const lowerTestName = testName.toLowerCase();
  
  Object.entries(Lab.COMPREHENSIVE_TEST_CATEGORIES || {}).forEach(([categoryKey, categoryData]) => {
    Object.values(categoryData.subcategories || {}).forEach(subcategory => {
      if (subcategory.tests && subcategory.tests.some(test => 
        test.toLowerCase().includes(lowerTestName) || lowerTestName.includes(test.toLowerCase())
      )) {
        categories.push(categoryKey);
      }
    });
  });
  
  return categories;
}

function predictTestAvailability(lab, testName) {
  if (!testName || !lab.testCategories) return 'Unknown';
  
  const relevantCategories = findTestCategories(testName);
  const hasRelevantCategory = relevantCategories.some(cat => lab.testCategories.includes(cat));
  
  if (hasRelevantCategory) {
    return lab.isVerified ? 'Very Likely' : 'Likely';
  }
  
  return 'Possible';
}

function estimateTestCost(lab, testName) {
  // Basic cost estimation logic
  const baseCost = {
    'blood': 200,
    'urine': 150,
    'genetic': 5000,
    'imaging': 1500,
    'culture': 800
  };
  
  if (!testName) return 'Contact lab for pricing';
  
  const lowerTestName = testName.toLowerCase();
  for (const [type, cost] of Object.entries(baseCost)) {
    if (lowerTestName.includes(type)) {
      const multiplier = lab.featured ? 1.2 : lab.rating > 4.0 ? 1.1 : 1.0;
      return `₹${Math.round(cost * multiplier)} - ₹${Math.round(cost * multiplier * 1.5)}`;
    }
  }
  
  return 'Contact lab for pricing';
}

function estimateReportTime(lab, testName) {
  if (!lab.turnaroundTime || !testName) return 'Contact lab for timing';
  
  const lowerTestName = testName.toLowerCase();
  
  if (lowerTestName.includes('culture')) return '2-7 days';
  if (lowerTestName.includes('genetic') || lowerTestName.includes('dna')) return '7-14 days';
  if (lowerTestName.includes('urgent') || lowerTestName.includes('stat')) return '1-2 hours';
  if (lowerTestName.includes('blood') || lowerTestName.includes('urine')) return '4-6 hours';
  
  return lab.turnaroundTime.routine_tests || 'Same day';
}

function calculateSuitabilityScore(lab, criteria) {
  let score = 0;
  
  // Base score from rating
  score += (lab.rating || 0) * 20;
  
  // Verification bonus
  if (lab.isVerified) score += 10;
  
  // Home collection if requested
  if (criteria.homeCollection === 'true' && lab.homeSampleCollection) score += 15;
  
  // Emergency services if urgent
  if (criteria.urgentTest === 'true' && lab.emergencyServices) score += 20;
  
  // Featured labs get slight boost
  if (lab.featured) score += 5;
  
  return Math.min(100, Math.round(score));
}

// GET /api/labs/:id - Get single lab details (must be after all named routes)
router.get('/:id', async (req, res) => {
  try {
    const labId = parseInt(req.params.id);
    if (!labId || isNaN(labId)) {
      return res.status(404).json({ success: false, message: 'Laboratory not found' });
    }
    const lab = await Lab.findOne({
      where: { 
        id: labId,
        status: 'active' 
      }
    });
    
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Laboratory not found'
      });
    }
    
    // Enhanced response with additional computed fields
    const enhancedLab = {
      ...lab.toJSON(),
      computed: {
        totalTestsOffered: lab.testCatalog ?
          Object.keys(lab.testCatalog).length : 0,
        accreditationScore: (lab.accreditation?.length || 0) * 20,
        digitalScore: lab.digitalFeatures ? 
          Object.values(lab.digitalFeatures).filter(Boolean).length * 10 : 0,
        serviceScore: (lab.services?.length || 0) * 5,
        overallScore: function() {
          return this.accreditationScore + this.digitalScore + this.serviceScore;
        }
      }
    };
    
    enhancedLab.computed.overallScore = enhancedLab.computed.overallScore();
    
    res.json({
      success: true,
      data: enhancedLab
    });
    
  } catch (error) {
    console.error('Error fetching lab details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch laboratory details',
      error: error.message
    });
  }
});

/**
 * POST /api/labs/book
 * Book a lab test appointment
 */
router.post('/book', authUser, async (req, res) => {
  try {
    const {
      labId,
      appointmentDate,
      appointmentTime,
      serviceType, // 'checkup' or 'diagnostic'
      testType,
      tests = [],
      symptoms,
      notes,
      patientName,
      patientPhone,
      patientAddress,
      prescriptionUrl,
      bookingFor = 'self',
      familyMemberId,
      corporateBenefitSource,
      corporatePackageId,
      corporatePackageName,
      corporatePackagePrice,
      familyDiscountPercent,
      familyDiscountedPrice
    } = req.body;

    // Validate required fields
    if (!labId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'Lab ID, appointment date, and time are required'
      });
    }

    if (!serviceType || !['checkup', 'diagnostic'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: 'Service type must be either "checkup" or "diagnostic"'
      });
    }

    // Calculate estimated fee based on service type
    let baseFee = serviceType === 'checkup' ? 1500 : 2500;
    let testFees = tests.reduce((sum, test) => sum + (Number(test.price) || 0), 0);
    let totalFee = baseFee + testFees;

    // Get lab details
    const lab = await Lab.findByPk(labId);
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    let familyMember = null;
    if (bookingFor === 'family' || familyMemberId) {
      if (!familyMemberId) {
        return res.status(400).json({
          success: false,
          message: 'Family member is required for a family health checkup booking'
        });
      }

      familyMember = await FamilyMember.findOne({
        where: {
          id: familyMemberId,
          userId: req.user?.id,
          isActive: true
        }
      });

      if (!familyMember) {
        return res.status(400).json({
          success: false,
          message: 'Selected family member was not found on your profile'
        });
      }
    }

    const isCorporateBenefitBooking = ['corporate-benefit', 'corporate-family-benefit'].includes(corporateBenefitSource);
    const requestedDiscountedPrice = Number(familyDiscountedPrice);
    const safeDiscountedPrice = Number.isFinite(requestedDiscountedPrice) && requestedDiscountedPrice >= 0
      ? requestedDiscountedPrice
      : null;

    if (isCorporateBenefitBooking) {
      baseFee = 0;
      if (familyMember && safeDiscountedPrice !== null) {
        testFees = safeDiscountedPrice;
        totalFee = safeDiscountedPrice;
      } else if (corporatePackageId) {
        testFees = 0;
        totalFee = 0;
      } else {
        totalFee = testFees;
      }
    }

    // Create appointment record in database
    const appointment = await Appointment.create({
      userId: req.user?.id,
      patientName: familyMember
        ? `${familyMember.firstName || ''} ${familyMember.lastName || ''}`.trim()
        : patientName || req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Patient',
      patientEmail: req.user?.email || null,
      patientPhone: familyMember?.phoneNumber || patientPhone || req.user?.phoneNumber || req.user?.phone || '',
      patientDetails: {
        address: patientAddress || {},
        symptoms: symptoms || '',
        notes: notes || '',
        bookingFor: familyMember ? 'family' : 'self',
        familyMemberId: familyMember ? familyMember.id : null,
        relationship: familyMember ? familyMember.relationship : null
      },
      doctorName: 'Lab',
      specialization: 'Laboratory',
      doctorDetails: {
        labId,
        labName: lab.name,
        labAddress: lab.address,
        labPhone: lab.phone
      },
      appointmentDate,
      appointmentTime,
      consultationType: 'lab-test',
      channel: 'lab',
      clinicId: labId,
      clinicName: lab.name,
      clinicAddress: lab.address,
      status: 'scheduled',
      type: 'lab',
      meetingLink: null,
      description: `Lab appointment for ${serviceType} - ${testType}`,
      metadata: {
        serviceType,
        testType,
        tests,
        totalFee,
        baseFee,
        testFees,
        prescriptionUrl: prescriptionUrl || null,
        corporateBenefitSource: corporateBenefitSource || null,
        corporatePackageId: corporatePackageId || null,
        corporatePackageName: corporatePackageName || null,
        corporatePackagePrice: corporatePackagePrice || null,
        familyDiscountPercent: familyMember ? familyDiscountPercent || null : null,
        familyDiscountedPrice: familyMember ? safeDiscountedPrice : null,
        bookingFor: familyMember ? 'family' : 'self',
        familyMemberId: familyMember ? familyMember.id : null
      }
    });

    console.log('[Lab Booking] ✅ Appointment created:', {
      id: appointment.id,
      userId: req.user?.id,
      labId,
      patientName,
      appointmentDate,
      appointmentTime
    });

    res.status(201).json({
      success: true,
      message: 'Lab appointment booked successfully',
      appointment: {
        id: appointment.id,
        patientName: appointment.patientName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        labName: lab.name,
        labAddress: lab.address,
        serviceType,
        testType,
        tests,
        totalFee,
        status: 'scheduled'
      }
    });
  } catch (error) {
    console.error('[Lab Booking] ❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book lab appointment',
      error: error.message
    });
  }
});

/**
 * GET /api/labs/:labId/tests
 * Get available tests for a lab
 */
router.get('/:labId/tests', async (req, res) => {
  try {
    const { labId } = req.params;
    const { serviceType } = req.query;

    // Fallback sample tests used when lab has no real catalog
    const fallbackTests = {
      checkup: [
        { id: 1, name: 'Complete Blood Count (CBC)', price: 500, duration: '2 hours' },
        { id: 2, name: 'Lipid Profile', price: 800, duration: '4 hours' },
        { id: 3, name: 'Blood Sugar (Fasting)', price: 200, duration: '1 hour' },
        { id: 4, name: 'Thyroid Profile', price: 1200, duration: '6 hours' }
      ],
      diagnostic: [
        { id: 5, name: 'X-Ray', price: 1500, duration: '30 minutes' },
        { id: 6, name: 'Ultrasound', price: 2000, duration: '45 minutes' },
        { id: 7, name: 'ECG', price: 800, duration: '15 minutes' },
        { id: 8, name: 'MRI Scan', price: 8000, duration: '1 hour' }
      ]
    };

    // Try to use real testCatalog data from the database
    const lab = await Lab.findByPk(labId, { attributes: ['id', 'testCatalog'] });
    let availableTests = null;

    if (lab && lab.testCatalog && typeof lab.testCatalog === 'object' && !Array.isArray(lab.testCatalog)) {
      const catalog = lab.testCatalog;
      // Flatten all categories into a single array, ensuring every test has a price
      const allTests = Object.values(catalog)
        .filter(Array.isArray)
        .flat()
        .filter(t => t && t.name)
        .map((t, idx) => ({
          id: t.code || `${labId}-${idx + 1}`,
          name: t.name,
          price: (t.price && !isNaN(Number(t.price))) ? Number(t.price) : null,
          duration: t.duration || 'Contact lab'
        }));

      if (allTests.length > 0) {
        // Only use real data if at least some tests have prices
        const withPrice = allTests.filter(t => t.price !== null);
        if (withPrice.length > 0) {
          // Ensure all tests have a price (null → 0 to show as "Contact for pricing")
          availableTests = serviceType
            ? allTests.filter(t =>
                (serviceType === 'checkup'
                  ? ['CBC', 'blood', 'sugar', 'thyroid', 'urine'].some(k => t.name.toLowerCase().includes(k))
                  : ['x-ray', 'ultrasound', 'ecg', 'mri', 'scan', 'imaging'].some(k => t.name.toLowerCase().includes(k))
                )
              )
            : allTests;
          if (availableTests.length === 0) availableTests = allTests; // fallback to all if filter produces nothing
        }
      }
    }

    // Fall back to hardcoded tests if no real catalog
    if (!availableTests) {
      availableTests = serviceType
        ? fallbackTests[serviceType] || []
        : [...fallbackTests.checkup, ...fallbackTests.diagnostic];
    }

    res.json({
      success: true,
      tests: availableTests
    });
  } catch (error) {
    console.error('Get tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tests',
      error: error.message
    });
  }
});


export default router;
