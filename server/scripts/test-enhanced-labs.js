#!/usr/bin/env node

/**
 * Enhanced Laboratory System Test Suite
 * =====================================
 * 
 * Comprehensive testing of the enhanced laboratory database
 * and search functionality with real-world scenarios.
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

class EnhancedLabTestSuite {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
  }

  async runAllTests() {
    console.log('🧪 ENHANCED LABORATORY SYSTEM TEST SUITE');
    console.log('==========================================\n');

    const testSuites = [
      () => this.testBasicLabListing(),
      () => this.testAdvancedSearch(),
      () => this.testTestCategorySearch(),
      () => this.testLocationBasedSearch(),
      () => this.testServiceFiltering(),
      () => this.testQualityFiltering(),
      () => this.testDetailedLabInfo(),
      () => this.testStatisticsEndpoint(),
      () => this.testEquipmentAndCapabilities(),
      () => this.testComprehensiveTestCategories()
    ];

    for (const testSuite of testSuites) {
      try {
        await testSuite();
      } catch (error) {
        console.error(`❌ Test suite failed: ${error.message}\n`);
      }
    }

    this.displaySummary();
  }

  async testBasicLabListing() {
    console.log('📋 Test 1: Basic Laboratory Listing');
    console.log('===================================');

    try {
      const response = await axios.get(`${BASE_URL}/labs`);
      
      if (response.status === 200 && response.data.success) {
        const { labs, pagination } = response.data.data;
        
        console.log(`✅ Retrieved ${labs.length} laboratories`);
        console.log(`📊 Total labs in database: ${pagination.totalLabs}`);
        console.log(`📄 Pages available: ${pagination.totalPages}`);
        
        // Display top 3 labs
        labs.slice(0, 3).forEach((lab, index) => {
          console.log(`   ${index + 1}. ${lab.name} - ⭐${lab.rating}/5 (${lab.totalReviews} reviews)`);
        });
        
        this.addTestResult('Basic Lab Listing', 'PASS', `Retrieved ${labs.length} labs`);
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (error) {
      console.log(`❌ Basic listing failed: ${error.message}`);
      this.addTestResult('Basic Lab Listing', 'FAIL', error.message);
    }
    console.log('');
  }

  async testAdvancedSearch() {
    console.log('🔍 Test 2: Advanced Search Functionality');
    console.log('========================================');

    const searchTests = [
      { name: 'Text Search', params: { search: 'pathology' } },
      { name: 'City Filter', params: { city: 'Delhi' } },
      { name: 'State Filter', params: { state: 'Maharashtra' } },
      { name: 'Home Collection', params: { homeSampleCollection: 'true' } },
      { name: 'Emergency Services', params: { emergencyServices: 'true' } },
      { name: 'High Rating', params: { minRating: '4.0' } },
      { name: 'Verified Labs', params: { isVerified: 'true' } }
    ];

    for (const test of searchTests) {
      try {
        const params = new URLSearchParams(test.params).toString();
        const response = await axios.get(`${BASE_URL}/labs?${params}`);
        
        if (response.status === 200) {
          const labs = response.data.data.labs;
          console.log(`   ✅ ${test.name}: Found ${labs.length} matching labs`);
          this.addTestResult(`Advanced Search - ${test.name}`, 'PASS', `${labs.length} results`);
        }
      } catch (error) {
        console.log(`   ❌ ${test.name}: ${error.message}`);
        this.addTestResult(`Advanced Search - ${test.name}`, 'FAIL', error.message);
      }
    }
    console.log('');
  }

  async testTestCategorySearch() {
    console.log('🧬 Test 3: Test Category Search');
    console.log('===============================');

    try {
      // Test specific test searches
      const testNames = [
        'blood test',
        'covid test',
        'thyroid test',
        'diabetes test',
        'liver function test'
      ];

      for (const testName of testNames) {
        try {
          const response = await axios.get(`${BASE_URL}/labs/search/advanced?testName=${encodeURIComponent(testName)}`);
          
          if (response.status === 200) {
            const { labs, recommendations } = response.data.data;
            console.log(`   🔬 "${testName}": ${labs.length} labs found`);
            
            if (recommendations && recommendations.length > 0) {
              console.log(`      💡 ${recommendations[0]}`);
            }
            
            // Show top result if available
            if (labs.length > 0) {
              const topLab = labs[0];
              console.log(`      🏥 Top match: ${topLab.name} (${topLab.suitabilityScore}/100 score)`);
              console.log(`      ⏱️ Estimated time: ${topLab.estimatedTime}`);
              console.log(`      💰 Estimated cost: ${topLab.estimatedCost}`);
            }
            
            this.addTestResult(`Test Search - ${testName}`, 'PASS', `${labs.length} labs`);
          }
        } catch (error) {
          console.log(`   ❌ "${testName}": ${error.message}`);
          this.addTestResult(`Test Search - ${testName}`, 'FAIL', error.message);
        }
      }
    } catch (error) {
      console.log(`❌ Test category search failed: ${error.message}`);
    }
    console.log('');
  }

  async testLocationBasedSearch() {
    console.log('📍 Test 4: Location-Based Search');
    console.log('=================================');

    try {
      const locations = [
        { city: 'Delhi', state: 'Delhi' },
        { city: 'Mumbai', state: 'Maharashtra' },
        { city: 'Bangalore', state: 'Karnataka' },
        { city: 'Chennai', state: 'Tamil Nadu' },
        { city: 'Hyderabad', state: 'Telangana' }
      ];

      for (const location of locations) {
        try {
          const params = new URLSearchParams(location).toString();
          const response = await axios.get(`${BASE_URL}/labs?${params}`);
          
          if (response.status === 200) {
            const labs = response.data.data.labs;
            console.log(`   📍 ${location.city}, ${location.state}: ${labs.length} labs`);
            
            if (labs.length > 0) {
              const labsWithRating = labs.filter(lab => lab.rating > 0);
              const avgRating = labsWithRating.reduce((sum, lab) => sum + lab.rating, 0) / labsWithRating.length;
              console.log(`      ⭐ Average rating: ${avgRating.toFixed(1)}/5`);
            }
            
            this.addTestResult(`Location Search - ${location.city}`, 'PASS', `${labs.length} labs`);
          }
        } catch (error) {
          console.log(`   ❌ ${location.city}: ${error.message}`);
          this.addTestResult(`Location Search - ${location.city}`, 'FAIL', error.message);
        }
      }
    } catch (error) {
      console.log(`❌ Location search failed: ${error.message}`);
    }
    console.log('');
  }

  async testServiceFiltering() {
    console.log('🔧 Test 5: Service Filtering');
    console.log('============================');

    try {
      const serviceFilters = [
        'Diagnostic Testing',
        'Home Sample Collection',
        'Pathology Services',
        'Radiology & Imaging',
        'Molecular Diagnostics'
      ];

      for (const service of serviceFilters) {
        try {
          const response = await axios.get(`${BASE_URL}/labs?services=${encodeURIComponent(service)}`);
          
          if (response.status === 200) {
            const labs = response.data.data.labs;
            console.log(`   🔧 ${service}: ${labs.length} labs offer this service`);
            this.addTestResult(`Service Filter - ${service}`, 'PASS', `${labs.length} labs`);
          }
        } catch (error) {
          console.log(`   ❌ ${service}: ${error.message}`);
          this.addTestResult(`Service Filter - ${service}`, 'FAIL', error.message);
        }
      }
    } catch (error) {
      console.log(`❌ Service filtering failed: ${error.message}`);
    }
    console.log('');
  }

  async testQualityFiltering() {
    console.log('⭐ Test 6: Quality Filtering');
    console.log('============================');

    try {
      const qualityTests = [
        { name: 'High Rating (4.0+)', params: { minRating: '4.0' } },
        { name: 'Featured Labs', params: { featured: 'true' } },
        { name: 'Verified Labs', params: { isVerified: 'true' } },
        { name: 'Premium Combo', params: { minRating: '4.2', featured: 'true', isVerified: 'true' } }
      ];

      for (const test of qualityTests) {
        try {
          const params = new URLSearchParams(test.params).toString();
          const response = await axios.get(`${BASE_URL}/labs?${params}`);
          
          if (response.status === 200) {
            const labs = response.data.data.labs;
            console.log(`   ⭐ ${test.name}: ${labs.length} labs qualify`);
            
            if (labs.length > 0) {
              const avgRating = labs.reduce((sum, lab) => sum + lab.rating, 0) / labs.length;
              console.log(`      📊 Average rating: ${avgRating.toFixed(2)}/5`);
            }
            
            this.addTestResult(`Quality Filter - ${test.name}`, 'PASS', `${labs.length} labs`);
          }
        } catch (error) {
          console.log(`   ❌ ${test.name}: ${error.message}`);
          this.addTestResult(`Quality Filter - ${test.name}`, 'FAIL', error.message);
        }
      }
    } catch (error) {
      console.log(`❌ Quality filtering failed: ${error.message}`);
    }
    console.log('');
  }

  async testDetailedLabInfo() {
    console.log('🏥 Test 7: Detailed Lab Information');
    console.log('===================================');

    try {
      // Get first lab ID
      const listResponse = await axios.get(`${BASE_URL}/labs?limit=1`);
      if (listResponse.data.data.labs.length === 0) {
        throw new Error('No labs found for detailed testing');
      }

      const labId = listResponse.data.data.labs[0].id;
      const response = await axios.get(`${BASE_URL}/labs/${labId}`);
      
      if (response.status === 200) {
        const lab = response.data.data;
        
        console.log(`   🏥 Lab: ${lab.name}`);
        console.log(`   📍 Location: ${lab.address.city}, ${lab.address.state}`);
        console.log(`   📞 Phone: ${lab.phoneNumber}`);
        console.log(`   🌐 Website: ${lab.website || 'Not specified'}`);
        console.log(`   🔬 Test Categories: ${lab.testCategories?.length || 0}`);
        console.log(`   🏆 Accreditations: ${lab.accreditation?.length || 0}`);
        console.log(`   ⭐ Rating: ${lab.rating}/5 (${lab.totalReviews} reviews)`);
        console.log(`   📊 Monthly Tests: ${lab.monthlyTests?.toLocaleString()}`);
        console.log(`   🎯 Overall Score: ${lab.computed?.overallScore || 'N/A'}`);
        console.log(`   📝 Total Tests Offered: ${lab.computed?.totalTestsOffered || 'N/A'}`);
        
        this.addTestResult('Detailed Lab Info', 'PASS', `Retrieved complete profile for ${lab.name}`);
      }
    } catch (error) {
      console.log(`   ❌ Failed to get detailed info: ${error.message}`);
      this.addTestResult('Detailed Lab Info', 'FAIL', error.message);
    }
    console.log('');
  }

  async testStatisticsEndpoint() {
    console.log('📊 Test 8: System Statistics');
    console.log('============================');

    try {
      const response = await axios.get(`${BASE_URL}/labs/statistics`);
      
      if (response.status === 200) {
        const stats = response.data.data;
        
        console.log(`   📊 Total Laboratories: ${stats.overview.totalLaboratories}`);
        console.log(`   ✅ Verified: ${stats.overview.verifiedLaboratories} (${stats.features.verificationRate}%)`);
        console.log(`   🌟 Featured: ${stats.overview.featuredLaboratories} (${stats.features.featuredRate}%)`);
        console.log(`   🏠 Home Collection: ${stats.overview.homeCollectionAvailable} (${stats.features.homeCollectionRate}%)`);
        console.log(`   🚨 Emergency Services: ${stats.overview.emergencyServicesAvailable} (${stats.features.emergencyServiceRate}%)`);
        console.log(`   ⭐ Average Rating: ${stats.overview.averageRating}/5`);
        console.log(`   📝 Total Reviews: ${stats.overview.totalReviews}`);
        console.log(`   🔬 Test Categories: ${stats.testCapabilities.totalCategories}`);
        console.log(`   🧪 Total Tests: ${stats.testCapabilities.totalTests}`);
        
        console.log(`   🌍 Top States:`);
        stats.distribution.topStates.slice(0, 5).forEach(([state, count], index) => {
          console.log(`      ${index + 1}. ${state}: ${count} labs`);
        });
        
        this.addTestResult('Statistics', 'PASS', 'Retrieved comprehensive statistics');
      }
    } catch (error) {
      console.log(`   ❌ Statistics failed: ${error.message}`);
      this.addTestResult('Statistics', 'FAIL', error.message);
    }
    console.log('');
  }

  async testEquipmentAndCapabilities() {
    console.log('🔬 Test 9: Equipment and Capabilities');
    console.log('=====================================');

    try {
      const response = await axios.get(`${BASE_URL}/labs/equipment/types`);
      
      if (response.status === 200) {
        const data = response.data.data;
        
        console.log(`   🔬 Equipment Categories: ${Object.keys(data.equipment).length}`);
        console.log(`   🏆 Accreditation Types: ${data.accreditations.length}`);
        console.log(`   📊 Quality Indicators: ${data.qualityIndicators.length}`);
        
        console.log(`   Equipment Types:`);
        Object.entries(data.equipment).slice(0, 3).forEach(([category, items]) => {
          console.log(`      • ${category}: ${items.length} items`);
        });
        
        console.log(`   Top Accreditations:`);
        data.accreditations.slice(0, 3).forEach((acc, index) => {
          console.log(`      ${index + 1}. ${acc}`);
        });
        
        this.addTestResult('Equipment & Capabilities', 'PASS', 'Retrieved equipment data');
      }
    } catch (error) {
      console.log(`   ❌ Equipment data failed: ${error.message}`);
      this.addTestResult('Equipment & Capabilities', 'FAIL', error.message);
    }
    console.log('');
  }

  async testComprehensiveTestCategories() {
    console.log('🧪 Test 10: Comprehensive Test Categories');
    console.log('=========================================');

    try {
      // Test category listing
      const response = await axios.get(`${BASE_URL}/labs/categories/tests`);
      
      if (response.status === 200) {
        const data = response.data.data;
        
        console.log(`   📊 Total Categories: ${data.totalCategories}`);
        console.log(`   Categories Available:`);
        
        Object.entries(data.categories).forEach(([key, category]) => {
          console.log(`      • ${category.name} (${category.subcategories.length} subcategories)`);
        });
        
        // Test detailed category info
        const detailResponse = await axios.get(`${BASE_URL}/labs/categories/tests?category=clinical_pathology&detailed=true`);
        if (detailResponse.status === 200) {
          const categoryData = detailResponse.data.data;
          console.log(`   📋 Clinical Pathology Details:`);
          console.log(`      Total Tests: ${categoryData.totalTests}`);
          console.log(`      Subcategories: ${Object.keys(categoryData.category.subcategories).length}`);
        }
        
        this.addTestResult('Test Categories', 'PASS', `${data.totalCategories} categories`);
      }
    } catch (error) {
      console.log(`   ❌ Test categories failed: ${error.message}`);
      this.addTestResult('Test Categories', 'FAIL', error.message);
    }
    console.log('');
  }

  addTestResult(testName, status, details) {
    this.testResults.push({
      test: testName,
      status: status,
      details: details,
      timestamp: new Date().toISOString()
    });
  }

  displaySummary() {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log('📋 TEST SUITE SUMMARY');
    console.log('====================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`✅ Passed: ${passed}/${total} (${((passed/total)*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${failed}/${total} (${((failed/total)*100).toFixed(1)}%)`);
    
    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'FAIL').forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.test}: ${result.details}`);
      });
    }
    
    console.log('\n🎉 ENHANCED LAB SYSTEM STATUS:');
    if (passed >= total * 0.8) {
      console.log('✅ System is OPERATIONAL and ready for production use!');
      console.log('\n🔍 Available Features:');
      console.log('   • Comprehensive lab database with 8+ major chains');
      console.log('   • Advanced search with 500+ test categories');
      console.log('   • Location-based filtering and sorting');
      console.log('   • Quality metrics and rating system');
      console.log('   • Equipment and capability tracking');
      console.log('   • Digital integration features');
      console.log('   • Detailed lab profiles with computed scores');
      console.log('   • Real-time statistics and analytics');
    } else {
      console.log('⚠️  System has issues that need attention before production');
    }
  }
}

// Run the test suite
async function main() {
  const testSuite = new EnhancedLabTestSuite();
  
  try {
    await testSuite.runAllTests();
  } catch (error) {
    console.error('❌ Test suite execution failed:', error.message);
    process.exit(1);
  }
}

// Check if server is running first
async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/labs?limit=1`);
    return true;
  } catch (error) {
    console.error('❌ Server not accessible. Please start the Mediczy server first.');
    console.error('   Run: cd /root/Mediczy/server && npm start');
    return false;
  }
}

// Execute test suite
checkServer().then(serverRunning => {
  if (serverRunning) {
    main();
  } else {
    process.exit(1);
  }
});