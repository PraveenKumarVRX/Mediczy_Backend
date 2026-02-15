#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';

const BASE_URL = 'http://localhost:8888';
const SIB_URL = 'http://localhost:8001';

const log = {
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  test: (msg) => console.log(chalk.cyan(`🧪 ${msg}`)),
  header: (msg) => console.log(chalk.bold.cyan(`\n${'='.repeat(70)}\n${msg}\n${'='.repeat(70)}`))
};

async function testSIBHealth() {
  log.header('TEST 1: SIB Health Check');
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp-production/sib/health`);
    log.success('SIB Health endpoint responding');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    log.error(`SIB Health check failed: ${error.message}`);
    return null;
  }
}

async function testSIBDirectEndpoint() {
  log.header('TEST 2: Direct SIB FastAPI Health (Port 8001)');
  try {
    const response = await axios.get(`${SIB_URL}/health`, { timeout: 5000 });
    log.success('Direct SIB FastAPI responding');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    log.error(`Direct SIB endpoint failed: ${error.message}`);
    return null;
  }
}

async function testSIBChatEndpoint() {
  log.header('TEST 3: Direct SIB Chat Endpoint (Port 8001)');
  try {
    const response = await axios.post(`${SIB_URL}/chat`, {
      message: 'Hello, I have a fever',
      phone_number: '+919876543210',
      session_id: 'test_session_001',
      patient_id: 'test_patient_1',
      user_context: {
        is_known_user: false,
        phone_number: '+919876543210'
      }
    }, { timeout: 8000 });
    
    log.success('Direct SIB Chat endpoint responding');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    log.error(`Direct SIB chat endpoint failed: ${error.message}`);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function testWhatsAppSIBTest(phoneNumber, message) {
  log.header(`TEST 4: WhatsApp SIB Test - "${message}"`);
  try {
    const response = await axios.post(`${BASE_URL}/api/whatsapp-production/sib/test`, {
      phoneNumber,
      message
    });
    
    log.success('WhatsApp SIB test responding');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    log.error(`WhatsApp SIB test failed: ${error.message}`);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function testMultipleMessages() {
  log.header('TEST 5: Testing Repetitiveness - Multiple Different Messages');
  
  const testMessages = [
    { phone: '+919876543210', msg: 'I have a fever' },
    { phone: '+919876543210', msg: 'My head is hurting badly' },
    { phone: '+918765432109', msg: 'I need to book an appointment' },
    { phone: '+918765432109', msg: 'What are your consultation fees?' },
    { phone: '+918765432109', msg: 'prescription refill' }
  ];

  const responses = [];
  
  for (const test of testMessages) {
    log.test(`Testing: "${test.msg}"`);
    try {
      const response = await axios.post(`${BASE_URL}/api/whatsapp-production/sib/test`, {
        phoneNumber: test.phone,
        message: test.msg
      });
      
      if (response.data?.response?.response) {
        const answer = response.data.response.response;
        console.log(`→ ${answer.substring(0, 100)}...`);
        responses.push({
          message: test.msg,
          response: answer,
          provider: response.data.response.provider || 'unknown'
        });
      }
    } catch (error) {
      log.warn(`Failed: ${error.message}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Analyze responses
  log.header('RESPONSE ANALYSIS');
  
  const uniqueResponses = new Set(responses.map(r => r.response));
  log.info(`Total messages tested: ${responses.length}`);
  log.info(`Unique responses: ${uniqueResponses.size}`);
  log.info(`Repetition ratio: ${((1 - uniqueResponses.size / responses.length) * 100).toFixed(1)}%`);
  
  console.log('\nDetailed responses:');
  responses.forEach((r, i) => {
    console.log(`\n${i + 1}. Message: "${r.message}"`);
    console.log(`   Provider: ${r.provider}`);
    console.log(`   Response: ${r.response.substring(0, 150)}...`);
  });
  
  return responses;
}

async function analyzeSIBConfiguration() {
  log.header('TEST 6: SIB Configuration Analysis');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp-production/sib/health`);
    
    if (response.data?.configuration) {
      console.log('Configuration:');
      console.log(JSON.stringify(response.data.configuration, null, 2));
    }
    
    if (response.data?.sibBrain) {
      console.log('\nSIB Brain Status:');
      console.log(JSON.stringify(response.data.sibBrain, null, 2));
    }
  } catch (error) {
    log.error(`Failed to get configuration: ${error.message}`);
  }
}

async function main() {
  console.clear();
  console.log(chalk.bold.magenta(`
╔═══════════════════════════════════════════════════════════════════╗
║           SIB FASTAPI COMPREHENSIVE TEST SUITE                    ║
║         Testing WhatsApp Response Repetitiveness                  ║
╚═══════════════════════════════════════════════════════════════════╝
  `));

  // Run all tests
  await testSIBHealth();
  await testSIBDirectEndpoint();
  await testSIBChatEndpoint();
  await testWhatsAppSIBTest('+919876543210', 'I have a fever');
  await testMultipleMessages();
  await analyzeSIBConfiguration();

  log.header('SUMMARY');
  log.info('Test suite completed. Check responses above for repetitiveness patterns.');
  log.info('\nIf responses are repetitive:');
  log.info('1. SIB FastAPI model may have limited training data');
  log.info('2. Response templates might be hardcoded');
  log.info('3. Model temperature/sampling settings may need adjustment');
}

main().catch(error => {
  log.error(`Test suite failed: ${error.message}`);
  process.exit(1);
});
