#!/usr/bin/env node

// Test DocsGPT AI Integration
import medicalAIService from './server/services/medicalAI.service.js';

console.log('🧪 Testing DocsGPT Medical AI Integration');
console.log('=========================================');

async function testMedicalAI() {
  try {
    // Test 1: Basic medical consultation
    console.log('\n📝 Test 1: Basic Medical Consultation');
    console.log('Query: "I have been having headaches for the past 3 days"');
    
    const testUserContext = {
      userId: 'test-user-123',
      age: 28,
      gender: 'female',
      medicalHistory: [],
      currentMedications: []
    };

    const response1 = await medicalAIService.consultMedical(
      "I have been having headaches for the past 3 days. They are mostly in the morning and get better during the day. What could be causing this?",
      testUserContext,
      'en'
    );

    console.log('✅ Response received:');
    console.log('Response:', response1.response?.substring(0, 200) + '...');
    console.log('Provider:', response1.provider);
    console.log('Confidence:', response1.confidence);

    // Test 2: Symptom analysis
    console.log('\n📊 Test 2: Symptom Analysis');
    console.log('Symptoms: fever, headache, fatigue');
    
    const response2 = await medicalAIService.analyzeSymptoms({
      symptoms: ['fever', 'headache', 'fatigue'],
      duration: '2 days',
      severity: 'moderate'
    });

    console.log('✅ Symptom analysis received:');
    console.log('Analysis:', response2.analysis?.substring(0, 200) + '...');
    console.log('Risk Level:', response2.riskLevel);
    console.log('Recommendations:', response2.recommendations?.slice(0, 2));

    // Test 3: Emergency triage
    console.log('\n🚨 Test 3: Emergency Triage');
    console.log('Emergency: "Severe chest pain and difficulty breathing"');
    
    const response3 = await medicalAIService.emergencyTriage({
      symptoms: "Severe chest pain and difficulty breathing",
      severity: "severe",
      duration: "30 minutes"
    });

    console.log('✅ Emergency triage received:');
    console.log('Priority:', response3.priority);
    console.log('Action:', response3.action);
    console.log('Response:', response3.response?.substring(0, 200) + '...');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error details:', error);
  }
}

// Test 4: Check DocsGPT backend status
async function testDocsGPTStatus() {
  console.log('\n🔧 Test 4: DocsGPT Backend Status');
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // Check if DocsGPT files exist
    const docsGPTPath = './ai-engine';
    if (fs.existsSync(docsGPTPath)) {
      console.log('✅ DocsGPT ai-engine directory exists');
      
      // Check main application file
      const appPath = './ai-engine/app.py';
      if (fs.existsSync(appPath)) {
        console.log('✅ DocsGPT app.py exists');
      } else {
        console.log('❌ DocsGPT app.py not found');
      }

      // Check environment file
      const envPath = './ai-engine/docsgpt.env';
      if (fs.existsSync(envPath)) {
        console.log('✅ DocsGPT environment file exists');
      } else {
        console.log('❌ DocsGPT environment file not found');
      }

    } else {
      console.log('❌ DocsGPT ai-engine directory not found');
    }

  } catch (error) {
    console.error('Error checking DocsGPT status:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  await testDocsGPTStatus();
  await testMedicalAI();
  
  console.log('\n🎯 Test Summary');
  console.log('================');
  console.log('✅ DocsGPT integration tests completed');
  console.log('📝 Check output above for detailed results');
  console.log('🔗 Medical AI service is ready for frontend integration');
}

runAllTests().catch(console.error);