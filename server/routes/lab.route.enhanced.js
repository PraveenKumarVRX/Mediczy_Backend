import express from 'express';
import { Op } from 'sequelize';
import Lab from '../models/postgres/lab.model.postgres.js';
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
    
    // Text search across name, services, and test categories
    if (search) {
      whereConditions[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { services: { [Op.like]: `%${search}%` } },
        { testCategories: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Location filters
    if (city) {
      whereConditions['address'] = {
        [Op.like]: `%"city":"${city}"%`
      };
    }
    
    if (state) {
      whereConditions['address'] = {
        ...whereConditions['address'],
        [Op.like]: `%"state":"${state}"%`
      };
    }
    
    if (pincode) {
      whereConditions['address'] = {
        ...whereConditions['address'],
        [Op.like]: `%"pincode":"${pincode}"%`
      };
    }
    
    // Service filters
    if (services) {
      const serviceList = services.split(',');
      // For MariaDB, convert array to JSON string search
      whereConditions.services = {
        [Op.like]: `%${serviceList[0]}%` // For now, search for the first service
      };
    }
    
    if (testCategories) {
      const categoryList = testCategories.split(',');
      // For MariaDB, convert array to JSON string search
      whereConditions.testCategories = {
        [Op.like]: `%${categoryList[0]}%` // For now, search for the first category
      };
    }
    
    if (accreditation) {
      const accreditationList = accreditation.split(',');
      // For MariaDB, convert array to JSON string search
      whereConditions.accreditation = {
        [Op.like]: `%${accreditationList[0]}%` // For now, search for the first accreditation
      };
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
    
    // Execute query
    const { rows: labs, count: total } = await Lab.findAndCountAll({
      where: whereConditions,
      order: [[sortBy, sortOrder.toUpperCase()]],
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
router.get('/:id', async (req, res) => {
  try {
    const lab = await Lab.findOne({
      where: { 
        id: req.params.id,
        isActive: true 
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
        totalTestsOffered: lab.testCategories ? 
          lab.testCategories.reduce((total, category) => {
            const categoryData = Lab.COMPREHENSIVE_TEST_CATEGORIES[category];
            if (categoryData) {
              return total + Object.values(categoryData.subcategories || {})
                .reduce((subTotal, sub) => subTotal + (sub.tests?.length || 0), 0);
            }
            return total;
          }, 0) : 0,
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
    
    let searchConditions = { isActive: true };
    let recommendations = [];
    
    // Test-specific search
    if (testName) {
      const relevantCategories = findTestCategories(testName);
      if (relevantCategories.length > 0) {
        searchConditions[Op.or] = relevantCategories.map(category => ({
          testCategories: { [Op.like]: `%${category}%` }
        }));
        recommendations.push(`Test "${testName}" is typically available in ${relevantCategories.join(', ')} categories`);
      }
    }
    
    // Category-based filtering
    if (testCategory) {
      searchConditions.testCategories = {
        [Op.like]: `%${testCategory}%`
      };
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
    
    if (category) {
      const categoryData = Lab.COMPREHENSIVE_TEST_CATEGORIES[category];
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
        ? Lab.COMPREHENSIVE_TEST_CATEGORIES
        : Object.keys(Lab.COMPREHENSIVE_TEST_CATEGORIES).reduce((acc, key) => {
            acc[key] = {
              name: Lab.COMPREHENSIVE_TEST_CATEGORIES[key].name,
              subcategories: Object.keys(Lab.COMPREHENSIVE_TEST_CATEGORIES[key].subcategories || {})
            };
            return acc;
          }, {});
      
      res.json({
        success: true,
        data: {
          categories,
          totalCategories: Object.keys(Lab.COMPREHENSIVE_TEST_CATEGORIES).length
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
      Lab.count({ where: { isActive: true } }),
      Lab.count({ where: { isActive: true, isVerified: true } }),
      Lab.count({ where: { isActive: true, featured: true } }),
      Lab.count({ where: { isActive: true, homeSampleCollection: true } }),
      Lab.count({ where: { isActive: true, emergencyServices: true } }),
      Lab.findOne({
        where: { isActive: true },
        attributes: [[Lab.sequelize.fn('AVG', Lab.sequelize.col('rating')), 'avgRating']]
      }),
      Lab.findOne({
        where: { isActive: true },
        attributes: [[Lab.sequelize.fn('SUM', Lab.sequelize.col('totalReviews')), 'totalReviews']]
      }),
      Lab.findAll({
        where: { isActive: true },
        attributes: ['testCategories'],
        group: ['testCategories']
      }),
      Lab.findAll({
        where: { isActive: true },
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
        testCapabilities: {
          totalCategories: Object.keys(Lab.COMPREHENSIVE_TEST_CATEGORIES).length,
          totalTests: Object.values(Lab.COMPREHENSIVE_TEST_CATEGORIES)
            .reduce((total, category) => {
              return total + Object.values(category.subcategories || {})
                .reduce((subTotal, sub) => subTotal + (sub.tests?.length || 0), 0);
            }, 0)
        }
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
  
  Object.entries(Lab.COMPREHENSIVE_TEST_CATEGORIES).forEach(([categoryKey, categoryData]) => {
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

/**
 * POST /api/labs/book
 * Book a lab test appointment
 */
router.post('/book', async (req, res) => {
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
      prescriptionUrl
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
    const baseFee = serviceType === 'checkup' ? 1500 : 2500;
    const testFees = tests.reduce((sum, test) => sum + (test.price || 0), 0);
    const totalFee = baseFee + testFees;

    // Create appointment record
    const appointment = {
      id: `lab-appt-${Date.now()}`,
      labId,
      patientName: patientName || 'Patient',
      patientPhone: patientPhone || '',
      appointmentDate,
      appointmentTime,
      serviceType,
      testType: testType || '',
      tests,
      symptoms: symptoms || '',
      notes: notes || '',
      patientAddress: patientAddress || {},
      prescriptionUrl: prescriptionUrl || null,
      status: 'scheduled',
      bookingTime: new Date().toISOString(),
      fee: totalFee,
      reportStatus: 'pending'
    };

    // TODO: Store in database once LabAppointment model is created

    res.json({
      success: true,
      message: 'Lab appointment booked successfully',
      appointment
    });
  } catch (error) {
    console.error('Lab booking error:', error);
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

    // TODO: Fetch from database
    // For now return sample tests
    const tests = {
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

    const availableTests = serviceType ? tests[serviceType] || [] : [...tests.checkup, ...tests.diagnostic];

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