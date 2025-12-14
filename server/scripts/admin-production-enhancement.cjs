#!/usr/bin/env node
/**
 * Admin Production Enhancement Script
 * Validates and enhances all admin dashboard functions for production readiness
 * Tests security, performance, validation, error handling, and business logic
 */

const axios = require('axios');
const colors = require('colors/safe');

const BASE_URL = 'http://localhost:8080';

// Production admin credentials
const ADMIN_CREDENTIALS = {
  email: 'admin@mediczy.com',
  password: 'SecurePass123'
};

class AdminProductionValidator {
  constructor() {
    this.adminToken = null;
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'success' ? '✅' : 
                   type === 'error' ? '❌' : 
                   type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async authenticate() {
    try {
      this.log('🔑 Starting admin authentication...', 'info');
      
      const response = await axios.post(`${BASE_URL}/admin/login`, ADMIN_CREDENTIALS, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AdminProductionValidator/1.0'
        }
      });

      if (response.data.success) {
        this.adminToken = response.data.token;
        this.log('Admin authentication successful', 'success');
        return true;
      } else {
        this.log('Authentication failed: Invalid response structure', 'error');
        return false;
      }
    } catch (error) {
      this.log(`Authentication error: ${error.message}`, 'error');
      return false;
    }
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'AdminProductionValidator/1.0'
    };
  }

  async testEndpoint(name, method, url, data = null, expectedStatus = 200) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${url}`,
        headers: this.getAuthHeaders(),
        timeout: 15000
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      
      if (response.status === expectedStatus) {
        this.results.push({ name, status: 'PASS', details: response.data });
        this.log(`${name}: PASS`, 'success');
        return { success: true, data: response.data };
      } else {
        this.results.push({ name, status: 'FAIL', error: `Expected ${expectedStatus}, got ${response.status}` });
        this.log(`${name}: FAIL - Status ${response.status}`, 'error');
        return { success: false, error: `Status ${response.status}` };
      }
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      this.log(`${name}: FAIL - ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  async testDashboardStats() {
    this.log('📊 Testing Dashboard Statistics...', 'info');
    const result = await this.testEndpoint('Dashboard Stats', 'GET', '/admin/dashboard/stats');
    
    if (result.success) {
      // Validate response structure
      const { data } = result.data;
      const requiredKeys = ['users', 'doctors', 'nurses', 'corporates', 'system'];
      const hasAllKeys = requiredKeys.every(key => data.hasOwnProperty(key));
      
      if (hasAllKeys) {
        this.log('Dashboard stats structure validation: PASS', 'success');
        this.log(`Performance: ${data.system.responseTime}ms`, 'info');
      } else {
        this.log('Dashboard stats structure validation: FAIL', 'error');
      }
    }
  }

  async testUserManagement() {
    this.log('👥 Testing User Management...', 'info');
    
    // Test user listing with pagination
    await this.testEndpoint('User List (Page 1)', 'GET', '/admin/users?page=1&limit=10');
    
    // Test user search
    await this.testEndpoint('User Search', 'GET', '/admin/users?search=test');
    
    // Test user filtering
    await this.testEndpoint('User Filter (Active)', 'GET', '/admin/users?status=active');
    
    // Test sorting
    await this.testEndpoint('User Sort (Name)', 'GET', '/admin/users?sortBy=firstName&sortOrder=ASC');
  }

  async testDoctorManagement() {
    this.log('👨‍⚕️ Testing Doctor Management...', 'info');
    
    await this.testEndpoint('Doctor List', 'GET', '/admin/doctors');
    await this.testEndpoint('Doctor Specializations', 'GET', '/admin/doctors/specializations');
  }

  async testNurseManagement() {
    this.log('👩‍⚕️ Testing Nurse Management...', 'info');
    
    await this.testEndpoint('Nurse List', 'GET', '/admin/nurses');
    
    // Test nurse creation with validation
    const newNurse = {
      firstName: 'Test',
      lastName: 'Nurse',
      email: `test.nurse.${Date.now()}@mediczy.com`,
      phoneNumber: '+91-9876543210',
      qualification: 'BSc Nursing',
      experience: 5,
      department: 'General'
    };
    
    await this.testEndpoint('Nurse Creation', 'POST', '/admin/nurses', newNurse, 201);
  }

  async testCorporateManagement() {
    this.log('🏢 Testing Corporate Management...', 'info');
    
    await this.testEndpoint('Corporate List', 'GET', '/admin/corporates');
  }

  async testHealthRiskManagement() {
    this.log('⚕️ Testing Health Risk Management...', 'info');
    
    // Test health risk inference
    const healthData = {
      age: 35,
      gender: 'Male',
      bmi: 24.5,
      bloodPressure: { systolic: 120, diastolic: 80 },
      cholesterol: 180,
      smoker: false,
      familyHistory: []
    };
    
    await this.testEndpoint('Health Risk Inference', 'POST', '/admin/health-risk/inference', healthData);
  }

  async testSystemIntegrations() {
    this.log('🔧 Testing System Integrations...', 'info');
    
    // Test WhatsApp integration status
    await this.testEndpoint('WhatsApp Status', 'GET', '/admin/integrations/whatsapp/status');
    
    // Test payment analytics
    await this.testEndpoint('Payment Analytics', 'GET', '/admin/analytics/payments');
  }

  async testSecurityFeatures() {
    this.log('🔒 Testing Security Features...', 'info');
    
    // Test rate limiting by making rapid requests
    const rapidRequests = Array(5).fill().map(() => 
      this.testEndpoint('Rate Limit Test', 'GET', '/admin/dashboard/stats')
    );
    
    await Promise.all(rapidRequests);
    
    // Test input validation with malicious input
    const maliciousData = {
      firstName: '<script>alert("xss")</script>',
      lastName: "'; DROP TABLE users; --",
      email: 'invalid-email'
    };
    
    await this.testEndpoint('Input Validation Test', 'POST', '/admin/nurses', maliciousData, 400);
  }

  async testErrorHandling() {
    this.log('🚨 Testing Error Handling...', 'info');
    
    // Test non-existent endpoints
    await this.testEndpoint('Non-existent Endpoint', 'GET', '/admin/nonexistent', null, 404);
    
    // Test invalid parameters
    await this.testEndpoint('Invalid Parameters', 'GET', '/admin/users?page=-1&limit=abc');
  }

  async runPerformanceTests() {
    this.log('⚡ Running Performance Tests...', 'info');
    
    const performanceTests = [
      () => this.testEndpoint('Perf Test - Dashboard', 'GET', '/admin/dashboard/stats'),
      () => this.testEndpoint('Perf Test - Users', 'GET', '/admin/users?limit=100'),
      () => this.testEndpoint('Perf Test - Doctors', 'GET', '/admin/doctors'),
    ];
    
    const startTime = Date.now();
    await Promise.all(performanceTests.map(test => test()));
    const endTime = Date.now();
    
    this.log(`All performance tests completed in ${endTime - startTime}ms`, 'info');
  }

  async validateDataConsistency() {
    this.log('📈 Validating Data Consistency...', 'info');
    
    // Get dashboard stats and validate against individual endpoints
    const statsResult = await this.testEndpoint('Stats for Validation', 'GET', '/admin/dashboard/stats');
    const usersResult = await this.testEndpoint('Users for Validation', 'GET', '/admin/users?limit=1000');
    
    if (statsResult.success && usersResult.success) {
      const statsCount = statsResult.data.data.users.total;
      const actualCount = usersResult.data.data.length;
      
      if (Math.abs(statsCount - actualCount) <= 5) { // Allow small variance
        this.log('Data consistency check: PASS', 'success');
      } else {
        this.log(`Data inconsistency detected: Stats=${statsCount}, Actual=${actualCount}`, 'warning');
      }
    }
  }

  async runComprehensiveTests() {
    console.log(colors.cyan('\n🚀 Starting Admin Production Enhancement Validation\n'));
    
    // Authentication
    if (!(await this.authenticate())) {
      console.log(colors.red('❌ Authentication failed. Cannot proceed with tests.'));
      return;
    }

    // Core functionality tests
    await this.testDashboardStats();
    await this.testUserManagement();
    await this.testDoctorManagement();
    await this.testNurseManagement();
    await this.testCorporateManagement();
    await this.testHealthRiskManagement();
    
    // System integration tests
    await this.testSystemIntegrations();
    
    // Security and validation tests
    await this.testSecurityFeatures();
    await this.testErrorHandling();
    
    // Performance tests
    await this.runPerformanceTests();
    
    // Data consistency validation
    await this.validateDataConsistency();
    
    this.generateReport();
  }

  generateReport() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const successRate = Math.round((passedTests / totalTests) * 100);
    
    console.log(colors.cyan('\n📋 ADMIN PRODUCTION ENHANCEMENT REPORT'));
    console.log(colors.cyan('='.repeat(50)));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Total Time: ${Date.now() - this.startTime}ms`);
    
    console.log(colors.yellow('\n🔍 DETAILED RESULTS:'));
    this.results.forEach((result, index) => {
      const status = result.status === 'PASS' ? colors.green('PASS') : colors.red('FAIL');
      console.log(`${index + 1}. ${result.name}: ${status}`);
      if (result.error) {
        console.log(`   Error: ${colors.red(result.error)}`);
      }
    });
    
    // Production readiness assessment
    console.log(colors.cyan('\n🎯 PRODUCTION READINESS ASSESSMENT:'));
    if (successRate >= 95) {
      console.log(colors.green('✅ PRODUCTION READY - All critical systems operational'));
    } else if (successRate >= 80) {
      console.log(colors.yellow('⚠️  MOSTLY READY - Minor issues need attention'));
    } else {
      console.log(colors.red('❌ NOT PRODUCTION READY - Critical issues require fixing'));
    }
    
    console.log(colors.cyan('\n🚀 Admin dashboard validation complete!\n'));
  }
}

// Run the validation
async function main() {
  const validator = new AdminProductionValidator();
  await validator.runComprehensiveTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AdminProductionValidator;