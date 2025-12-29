#!/usr/bin/env node

/**
 * Test Script: Dr. iSHA Medication Suggestion Functionality
 * Tests whether Dr. iSHA properly suggests medications based on symptoms
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8000';
const API_KEY = process.env.API_KEY || 'test-token';

// Test cases for medication suggestions
const testCases = [
  {
    name: 'Cold and Runny Nose',
    query: 'I have a cold and my nose is running',
    expectedMeds: ['Cetirizine', 'Saline', 'Amoxicillin'],
    description: 'User asking for medication for cold symptoms'
  },
  {
    name: 'Fever and Headache',
    query: 'I have a fever and severe headache. Suggest me some medication',
    expectedMeds: ['Paracetamol', 'Ibuprofen', 'fever'],
    description: 'User explicitly asking for medication suggestions'
  },
  {
    name: 'Nausea and Vomiting',
    query: 'i feel nauseous and i am vomiting. what medicine should i take',
    expectedMeds: ['Metoclopramide', 'Ondansetron', 'Domperidone'],
    description: 'User asking for medication for nausea'
  },
  {
    name: 'Stomach Pain',
    query: 'severe stomach pain and acidity. suggest me some medication',
    expectedMeds: ['Pantoprazole', 'Omeprazole', 'Ranitidine'],
    description: 'User asking for medication for stomach issues'
  },
  {
    name: 'Diarrhea',
    query: 'I have diarrhea for 2 days. What pills should I take?',
    expectedMeds: ['Loperamide', 'Metronidazole', 'ORS'],
    description: 'User asking for diarrhea medication'
  }
];

async function testMedicationSuggestions() {
  console.log('🧪 Testing Dr. iSHA Medication Suggestion Functionality\n');
  console.log('='.repeat(70));
  
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    console.log(`   Expected: ${testCase.expectedMeds.join(', ')}`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/medical-ai/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          query: testCase.query,
          language: 'en',
          userContext: {
            age: 30,
            gender: 'male',
            medicalHistory: []
          }
        })
      });

      if (!response.ok) {
        console.log(`   ❌ FAILED: HTTP ${response.status} ${response.statusText}`);
        failedTests++;
        continue;
      }

      const result = await response.json();
      const aiResponse = result.data.response || result.response || '';
      
      // Check if medications are mentioned in the response
      const hasMedications = testCase.expectedMeds.some(med => 
        aiResponse.toLowerCase().includes(med.toLowerCase())
      );

      if (hasMedications) {
        console.log(`   ✅ PASSED: Medications detected in response`);
        
        // Extract medication mentions
        const mentionedMeds = testCase.expectedMeds.filter(med =>
          aiResponse.toLowerCase().includes(med.toLowerCase())
        );
        console.log(`   Found: ${mentionedMeds.join(', ')}`);
        
        // Check if dosages are mentioned
        const hasDosages = /(\d+)\s*(mg|ml|tabs?|capsule)/gi.test(aiResponse);
        if (hasDosages) {
          console.log(`   ✅ Dosages included in response`);
        } else {
          console.log(`   ⚠️  No dosages found (might be in fallback mode)`);
        }
        
        passedTests++;
      } else {
        console.log(`   ❌ FAILED: No medications suggested in response`);
        console.log(`   Response: ${aiResponse.substring(0, 200)}...`);
        failedTests++;
      }

      // Show provider used
      console.log(`   Provider: ${result.data.provider || 'unknown'}`);
      console.log(`   Model: ${result.data.model || 'unknown'}`);
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failedTests++;
    }

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Test Results:`);
  console.log(`   Passed: ${passedTests}/${testCases.length}`);
  console.log(`   Failed: ${failedTests}/${testCases.length}`);
  console.log(`   Success Rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);

  if (passedTests === testCases.length) {
    console.log('\n✅ All tests passed! Medication suggestions are working correctly.');
  } else if (passedTests > 0) {
    console.log('\n⚠️  Some tests failed. Please check the responses above.');
  } else {
    console.log('\n❌ All tests failed. Medication suggestions may not be working.');
  }
}

// Run tests
testMedicationSuggestions().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});
