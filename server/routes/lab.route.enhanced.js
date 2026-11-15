import express from 'express';
import { Op, Sequelize } from 'sequelize';
import Lab from '../models/postgres/lab.model.postgres.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import { Appointment, LabTest } from '../models/index.js';
import { ensureLabAppointmentHistory } from '../services/lab-appointment-history.service.js';
import { Order as BillingOrder } from '../models/billing.model.intelligent.js';
import { authUser } from '../middleware/auth.middleware.js';
import { orchestrator } from '../db/orchestrator.js';
import { sanitiseContact } from '../utils/placeholder-contact.js';
import { priceLabBooking, LabPricingError, listBookableLabTests, CORPORATE_BENEFIT_SOURCES } from '../services/lab-booking-pricing.service.js';

const router = express.Router();

/**
 * Enhanced Laboratory Routes
 * =========================
 *
 * Comprehensive laboratory management with advanced search,
 * filtering, and detailed information retrieval.
 */

/**
 * Proximity search over the lab directory.
 *
 * `latitude`, `longitude` and `radius` were accepted by GET / and then
 * dropped on the floor: results came back sorted by rating, so the "nearest
 * lab" to a user in Bengaluru was one 287 km away in Chennai. 2,414 of 2,428
 * labs carry address->'coordinates', so the data was there all along.
 *
 * The coordinates are JSONB text, so the regex guard matters: one row with a
 * non-numeric lat would otherwise fail the cast and 500 the whole listing.
 */
const LAB_LAT = `(address->'coordinates'->>'lat')::double precision`;
const LAB_LNG = `(address->'coordinates'->>'lng')::double precision`;
const LAB_HAS_COORDS = `address->'coordinates'->>'lat' ~ '^-?[0-9]+(\\.[0-9]+)?$' AND address->'coordinates'->>'lng' ~ '^-?[0-9]+(\\.[0-9]+)?$'`;

/** Finite number in range, or null — never interpolate an unvalidated value into SQL. */
const coordinate = (value, limit) => {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

/**
 * Haversine distance in km as a SQL expression, or null when no usable point
 * was supplied. LEAST/GREATEST clamp the cosine: floating point can push it
 * just outside [-1, 1], and acos() of 1.0000000001 is an error, not a rounding
 * issue. NULL for labs without coordinates, so they sort last.
 */
function labDistanceSql(latitude, longitude) {
  const lat = coordinate(latitude, 90);
  const lng = coordinate(longitude, 180);
  if (lat === null || lng === null) return null;
  return `(CASE WHEN ${LAB_HAS_COORDS} THEN
    6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(${lat})) * cos(radians(${LAB_LAT})) * cos(radians(${LAB_LNG}) - radians(${lng}))
      + sin(radians(${lat})) * sin(radians(${LAB_LAT}))
    )))
  ELSE NULL END)`;
}

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

    // Proximity: when the caller gives a point, restrict to labs that have
    // coordinates, optionally inside `radius` km, and sort nearest-first.
    const distanceSql = labDistanceSql(latitude, longitude);
    if (distanceSql) {
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push(Sequelize.literal(LAB_HAS_COORDS));
      const radiusKm = Number(radius);
      if (Number.isFinite(radiusKm) && radiusKm > 0) {
        whereConditions[Op.and].push(Sequelize.literal(`${distanceSql} <= ${radiusKm}`));
      }
    }

    // Build order clause - for pincode search, show exact matches first
    let orderClause = [[sortBy, sortOrder.toUpperCase()]];
    if (distanceSql) {
      // Nearest first. An explicit sortBy still breaks ties.
      orderClause = [[Sequelize.literal(`${distanceSql} ASC NULLS LAST`)], ['rating', 'DESC']];
    } else if (pincode) {
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
      ...(distanceSql
        ? { attributes: { include: [[Sequelize.literal(distanceSql), 'distanceKm']] } }
        : {}),
      order: orderClause,
      limit: parseInt(limit),
      offset: offset
    });

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);

    // Surface the distance and a flat coordinate pair. The client could not
    // show "2.3 km away" or drop a map pin before, because neither was in the
    // payload — the map just said "Location unavailable".
    const labsOut = labs.map((lab) => {
      const row = typeof lab.toJSON === 'function' ? lab.toJSON() : { ...lab };
      const coords = row.address?.coordinates;
      const lat = Number(coords?.lat);
      const lng = Number(coords?.lng);
      row.coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      const km = Number(row.distanceKm);
      row.distanceKm = Number.isFinite(km) ? Math.round(km * 10) / 10 : null;
      // 2,363 of 2,428 labs carry a seeded +91-90000000xx number. That range is
      // live, so showing it invites a patient to call a stranger.
      const contact = sanitiseContact({ phone: row.phoneNumber, email: row.email });
      row.phoneNumber = contact.phone;
      row.email = contact.email;
      row.contactUnavailable = contact.placeholder;
      return row;
    });

    res.json({
      success: true,
      total,
      count: labs.length,
      labs: labsOut,
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
 * Validate a POST /labs/book body, load the lab and family member, and price
 * it. Shared by /book and /book/quote so the quote is exactly what booking
 * charges. Returns { error: {status, body} } or the prepared booking.
 */
/** Run `work` in a transaction whose RLS user is the caller (for FORCED-RLS tables). */
async function withUserRls(req, work) {
  const transaction = await FamilyMember.sequelize.transaction();
  try {
    await FamilyMember.sequelize.query(
      "SELECT set_config('app.current_org_id', '0', true), set_config('app.current_user_id', :uid, true)",
      { replacements: { uid: String(req.user?.id ?? '') }, transaction }
    );
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

/** True when the user holds this package now (active status, inside its validity window). */
async function hasActivePackage(userId, packageId) {
  const uid = Number(userId);
  if (!Number.isSafeInteger(uid) || uid <= 0) return false;
  const rows = await FamilyMember.sequelize.query(
    `SELECT 1 FROM user_health_packages
      WHERE "userId" = :uid AND "packageId" = :pid
        AND LOWER(COALESCE(status, 'active')) = 'active'
        AND ("validFrom" IS NULL OR "validFrom" <= NOW())
        AND ("validTo" IS NULL OR "validTo" >= NOW())
      LIMIT 1`,
    { replacements: { uid, pid: String(packageId) }, type: Sequelize.QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function prepareLabBooking(req, { requireSchedule }) {
  const {
    labId,
    appointmentDate,
    appointmentTime,
    serviceType, // 'checkup' or 'diagnostic'
    tests = [],
    bookingFor = 'self',
    familyMemberId,
    corporateBenefitSource,
    corporatePackageId,
    familyDiscountedPrice
  } = req.body || {};

  if (!labId || (requireSchedule && (!appointmentDate || !appointmentTime))) {
    return { error: { status: 400, body: {
      success: false,
      message: requireSchedule ? 'Lab ID, appointment date, and time are required' : 'Lab ID is required'
    } } };
  }

  if (!serviceType || !['checkup', 'diagnostic'].includes(serviceType)) {
    return { error: { status: 400, body: {
      success: false,
      message: 'Service type must be either "checkup" or "diagnostic"'
    } } };
  }

  const lab = await Lab.findByPk(labId);
  if (!lab) {
    return { error: { status: 404, body: { success: false, message: 'Lab not found' } } };
  }

  let familyMember = null;
  if (bookingFor === 'family' || familyMemberId) {
    if (!familyMemberId) {
      return { error: { status: 400, body: {
        success: false,
        message: 'Family member is required for a family health checkup booking'
      } } };
    }

    // family_members has FORCED row-level security: outside a transaction that
    // sets app.current_user_id this lookup silently finds nothing.
    familyMember = await withUserRls(req, (transaction) => FamilyMember.findOne({
      where: {
        id: familyMemberId,
        userId: req.user?.id,
        isActive: true
      },
      transaction,
    }));

    if (!familyMember) {
      return { error: { status: 400, body: {
        success: false,
        message: 'Selected family member was not found on your profile'
      } } };
    }
  }

  // A corporate-benefit booking is free (or at the benefit's family price) only
  // when this account really holds the package: an active, in-date row in
  // user_health_packages. Before, any client could send these two fields and
  // book at ₹0.
  if (CORPORATE_BENEFIT_SOURCES.includes(corporateBenefitSource)) {
    const entitled = corporatePackageId && await hasActivePackage(req.user?.id, corporatePackageId);
    if (!entitled) {
      return { error: { status: 403, body: {
        success: false,
        errorCode: 'PACKAGE_NOT_ENTITLED',
        message: 'This health package is not active on your account. Book the tests individually or contact your HR team.'
      } } };
    }
  }

  let pricing;
  try {
    pricing = await priceLabBooking({
      tests,
      corporateBenefitSource,
      corporatePackageId,
      isFamilyBooking: Boolean(familyMember),
      familyDiscountedPrice,
    });
  } catch (err) {
    if (err instanceof LabPricingError) return { error: { status: err.statusCode, body: err.toJSON() } };
    throw err;
  }

  return { lab, familyMember, pricing };
}

/** The quote both endpoints return: what the patient will be charged, and why. */
const labBookingQuote = (lab, serviceType, pricing) => ({
  labId: lab.id,
  labName: lab.name,
  serviceType,
  currency: pricing.currency,
  tests: pricing.tests,
  testsSubtotal: pricing.testsSubtotal,
  collectionFee: pricing.collectionFee,
  totalFee: pricing.totalFee,
  paymentRequired: pricing.paymentRequired,
  basis: pricing.basis,
});

/**
 * POST /api/labs/book/quote
 * Price a booking before it is made. Takes the POST /labs/book body (the
 * appointment date/time are optional here) and returns the total /labs/book
 * will charge for it — the same pricing function computes both. Creates
 * nothing.
 */
router.post('/book/quote', authUser, async (req, res) => {
  try {
    const prepared = await prepareLabBooking(req, { requireSchedule: false });
    if (prepared.error) return res.status(prepared.error.status).json(prepared.error.body);
    const { lab, pricing } = prepared;
    return res.json({ success: true, quote: labBookingQuote(lab, req.body.serviceType, pricing) });
  } catch (error) {
    console.error('[Lab Booking] quote error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to price this booking right now' });
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
      symptoms,
      notes,
      patientName,
      patientPhone,
      patientAddress,
      prescriptionUrl,
      corporateBenefitSource,
      corporatePackageId,
      corporatePackageName,
      corporatePackagePrice,
      familyDiscountPercent
    } = req.body;

    const prepared = await prepareLabBooking(req, { requireSchedule: true });
    if (prepared.error) return res.status(prepared.error.status).json(prepared.error.body);
    const { lab, familyMember, pricing } = prepared;

    // Server-priced (services/lab-booking-pricing.service.js): catalogue
    // prices, never the client's, and no invented base fee (QA-07).
    const tests = pricing.tests;
    const testFees = pricing.testsSubtotal;
    const collectionFee = pricing.collectionFee;
    const totalFee = pricing.totalFee;
    const safeDiscountedPrice = pricing.basis === 'corporate-family-discount' ? pricing.totalFee : null;

    // Create appointment inside an RLS-scoped transaction. `appointments` enforces FORCE RLS and
    // the global rls-context middleware's GUC is not guaranteed on this Sequelize pooled connection,
    // so the insert must set current_user_id()/current_org_id() here. Without it the insert failed
    // with "new row violates row-level security policy for table appointments" -> "Failed to book
    // lab appointment". The row's userId = this user satisfies the tenant-isolation policy.
    const labBookingTx = await Appointment.sequelize.transaction();
    let appointment;
    let labTest;
    try {
      const orgRaw = Number(req.user?.organization_id ?? req.user?.organizationId);
      const orgId = Number.isFinite(orgRaw) && orgRaw > 0 ? orgRaw : 0;
      await Appointment.sequelize.query(
        "SELECT set_config('app.current_org_id', :org, true), set_config('app.current_user_id', :uid, true)",
        { replacements: { org: String(orgId), uid: String(req.user?.id ?? '') }, transaction: labBookingTx }
      );
      appointment = await Appointment.create({
      userId: req.user?.id,
      organization_id: orgId || null,
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
        testFees,
        collectionFee,
        pricingBasis: pricing.basis,
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
      }, { transaction: labBookingTx });
      // Do not acknowledge a booking unless the patient history row is also
      // durable. A failure here rolls the appointment back as well.
      labTest = await ensureLabAppointmentHistory(appointment, { LabTest, transaction: labBookingTx });
      await labBookingTx.commit();
    } catch (txErr) {
      await labBookingTx.rollback().catch(() => {});
      throw txErr;
    }

    console.log('[Lab Booking] ✅ Appointment created:', {
      id: appointment.id,
      userId: req.user?.id,
      labId,
      patientName,
      appointmentDate,
      appointmentTime
    });

    // Payment bridge: a fee-bearing lab booking also gets a billing Order (orderType lab_test) linked
    // to the appointment, so the app pays via the existing /billing/payments/razorpay/create + /verify
    // (which also yields Payment records and refunds). verify propagates 'paid' back to the appointment.
    let paymentOrder = null;
    if (Number(totalFee) > 0) {
      try {
        paymentOrder = await BillingOrder.create({
          orderNumber: `LABAPT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: req.user.id,
          orderType: 'lab_test',
          status: 'pending',
          subtotal: Number(totalFee),
          total: Number(totalFee),
          currency: 'INR',
          metadata: { source: 'lab_appointment', appointmentId: appointment.id, labTestId: labTest.id, labId, labName: lab.name },
          notes: (tests || []).map(t => t.name).filter(Boolean).join(', '),
        });
      } catch (ordErr) {
        console.error('[Lab Booking] payment order create failed (booking still valid):', ordErr.message);
      }
    }
    const paymentRequired = Number(totalFee) > 0;

    res.status(201).json({
      success: true,
      message: 'Lab appointment booked successfully',
      // This is the ID accepted by /lab-tests/:id. Keep appointment.id for
      // existing web clients; it is a different entity and may differ.
      labTestId: labTest.id,
      data: labTest,
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
        status: 'scheduled',
        paymentStatus: paymentRequired ? 'payment_pending' : 'not_required'
      },
      payment: { required: paymentRequired, orderId: paymentOrder?.id || null, amount: Number(totalFee) || 0, currency: 'INR' },
      // The same object POST /labs/book/quote returns for this body.
      quote: labBookingQuote(lab, serviceType, pricing)
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
 * GET /api/labs/:labId/slots?date=YYYY-MM-DD — bookable slots for a lab on a date.
 * Uses the lab's configured slots (metadata.slots) or a default working set, marking slots
 * already taken by lab appointments that day as unavailable.
 */
router.get('/:labId/slots', authUser, async (req, res) => {
  try {
    const labId = Number(req.params.labId);
    const date = String(req.query.date || '');
    if (!Number.isFinite(labId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'A valid labId and date (YYYY-MM-DD) are required' });
    }
    const lab = await Lab.findByPk(labId);
    if (!lab) return res.status(404).json({ success: false, message: 'Lab not found' });
    const configured = Array.isArray(lab.metadata?.slots) && lab.metadata.slots.length ? lab.metadata.slots.map(String) : null;
    const base = configured || ['08:00', '09:00', '10:00', '11:00', '12:00', '16:00', '17:00', '18:00'];
    // appointments has no clinicId column; lab appointments carry the lab id in doctorDetails.labId.
    const booked = await Appointment.findAll({
      where: { type: 'lab', appointmentDate: date, status: { [Op.in]: ['scheduled', 'confirmed', 'rescheduled'] } },
      attributes: ['appointmentTime', 'doctorDetails'],
    });
    const taken = new Set(booked.filter((b) => Number(b.doctorDetails?.labId) === labId).map((b) => b.appointmentTime));
    const slots = base.map((t, i) => ({ id: `slot-${i + 1}`, label: t, value: t, available: !taken.has(t) }));
    return res.json({ success: true, date, labId: String(labId), slots });
  } catch (error) {
    console.error('[labs] slots error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load available slots' });
  }
});

/**
 * GET /api/labs/:labId/tests
 * The tests this lab can be booked for, priced from the bookable catalogue —
 * the same rows POST /cart/add accepts and POST /labs/book charges.
 *
 * QA-06: labs without a `testCatalog` (2,381 of 2,418 active labs) used to get
 * eight hardcoded sample tests (ids 1-8, "CBC ₹500"); none is in the catalogue,
 * so the cart refused every one. The per-lab `testCatalog` JSON (37 labs, two
 * seeded templates whose codes mostly match nothing in the catalogue) is not a
 * price list booking can honour, so it is not listed either.
 */
router.get('/:labId/tests', async (req, res) => {
  try {
    const labId = Number(req.params.labId);
    if (!Number.isInteger(labId) || labId <= 0) {
      return res.status(404).json({ success: false, message: 'Laboratory not found' });
    }
    const lab = await Lab.findOne({ where: { id: labId, status: 'active' }, attributes: ['id'] });
    if (!lab) {
      return res.status(404).json({ success: false, message: 'Laboratory not found' });
    }
    const serviceType = typeof req.query.serviceType === 'string' ? req.query.serviceType : undefined;
    const tests = await listBookableLabTests({ serviceType });
    res.json({
      success: true,
      labId: String(labId),
      priceSource: 'catalog',
      tests
    });
  } catch (error) {
    console.error('Get tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tests'
    });
  }
});


export default router;
