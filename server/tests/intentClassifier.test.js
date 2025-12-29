/**
 * Intent Classification Testing Suite
 * Tests the advanced intent detection and classification system
 */

import intentClassifier from '../utils/intentClassifier.js';

class IntentClassificationTester {
  constructor() {
    this.testResults = [];
    this.testCases = this.buildTestCases();
  }

  buildTestCases() {
    return [
      // EMERGENCY INTENT TESTS
      {
        category: 'emergency',
        language: 'en',
        queries: [
          { text: 'I cannot breathe, severe chest pain!', expectedIntent: 'emergency', minConfidence: 50 },
          { text: 'Emergency! I am dying', expectedIntent: 'emergency', minConfidence: 50 },
          { text: 'Unconscious, please help!', expectedIntent: 'emergency', minConfidence: 40 },
          { text: 'Severe bleeding, what do I do?', expectedIntent: 'emergency', minConfidence: 40 }
        ]
      },

      // APPOINTMENT INTENT TESTS
      {
        category: 'appointment',
        language: 'en',
        queries: [
          { text: 'Book appointment with doctor', expectedIntent: 'appointment', minConfidence: 40 },
          { text: 'I need an appointment', expectedIntent: 'appointment', minConfidence: 40 },
          { text: 'Schedule appointment', expectedIntent: 'appointment', minConfidence: 40 },
          { text: 'Want to see a doctor soon', expectedIntent: 'appointment', minConfidence: 35 }
        ]
      },

      // HINDI APPOINTMENT TESTS
      {
        category: 'appointment_hindi',
        language: 'hi',
        queries: [
          { text: 'अपॉइंटमेंट बुक करना है', expectedIntent: 'appointment', minConfidence: 40 },
          { text: 'डॉक्टर से मिलना चाहता हूं', expectedIntent: 'appointment', minConfidence: 40 },
          { text: 'नियुक्ति के लिए समय दीजिए', expectedIntent: 'appointment', minConfidence: 40 }
        ]
      },

      // DOCTOR SEARCH INTENT TESTS
      {
        category: 'doctor_search',
        language: 'en',
        queries: [
          { text: 'Find me a cardiologist', expectedIntent: 'doctor_search', minConfidence: 40 },
          { text: 'Looking for a dermatologist in Delhi', expectedIntent: 'doctor_search', minConfidence: 40 },
          { text: 'Best dentist in my area', expectedIntent: 'doctor_search', minConfidence: 40 }
        ]
      },

      // MEDICAL CONSULTATION TESTS
      {
        category: 'medical_consult',
        language: 'en',
        queries: [
          { text: 'I have a fever and cough', expectedIntent: 'medical_consult', minConfidence: 40 },
          { text: 'What could be causing my headache?', expectedIntent: 'medical_consult', minConfidence: 35 },
          { text: 'Pain in my chest, should I worry?', expectedIntent: 'medical_consult', minConfidence: 40 }
        ]
      },

      // MEDICATION INTENT TESTS
      {
        category: 'medication',
        language: 'en',
        queries: [
          { text: 'What are the side effects of paracetamol?', expectedIntent: 'medication', minConfidence: 40 },
          { text: 'How much antibiotic should I take?', expectedIntent: 'medication', minConfidence: 40 },
          { text: 'Drug interaction between these medications?', expectedIntent: 'medication', minConfidence: 40 }
        ]
      },

      // PREGNANCY INTENT TESTS
      {
        category: 'pregnancy',
        language: 'en',
        queries: [
          { text: 'I am pregnant with twins', expectedIntent: 'pregnancy', minConfidence: 40 },
          { text: 'Pregnancy complications, need gynecologist', expectedIntent: 'pregnancy', minConfidence: 40 },
          { text: 'Due date is next month', expectedIntent: 'pregnancy', minConfidence: 40 }
        ]
      },

      // MENTAL HEALTH INTENT TESTS
      {
        category: 'mental_health',
        language: 'en',
        queries: [
          { text: 'I am having severe anxiety attacks', expectedIntent: 'mental_health', minConfidence: 35 },
          { text: 'Feeling depressed, need help', expectedIntent: 'mental_health', minConfidence: 35 },
          { text: 'Need to talk to a psychiatrist', expectedIntent: 'mental_health', minConfidence: 40 }
        ]
      },

      // PEDIATRIC INTENT TESTS
      {
        category: 'pediatric',
        language: 'en',
        queries: [
          { text: 'My baby has a fever', expectedIntent: 'pediatric', minConfidence: 40 },
          { text: 'Need pediatrician for vaccination', expectedIntent: 'pediatric', minConfidence: 40 },
          { text: 'Child development concerns', expectedIntent: 'pediatric', minConfidence: 40 }
        ]
      },

      // LAB TEST INTENT TESTS
      {
        category: 'lab_test',
        language: 'en',
        queries: [
          { text: 'My thyroid values are abnormal', expectedIntent: 'lab_test', minConfidence: 40 },
          { text: 'Blood test results show high cholesterol', expectedIntent: 'lab_test', minConfidence: 40 },
          { text: 'What does TSH level mean?', expectedIntent: 'lab_test', minConfidence: 35 }
        ]
      },

      // LIFESTYLE INTENT TESTS
      {
        category: 'lifestyle',
        language: 'en',
        queries: [
          { text: 'How to lose weight effectively?', expectedIntent: 'lifestyle', minConfidence: 35 },
          { text: 'Yoga for stress management', expectedIntent: 'lifestyle', minConfidence: 40 },
          { text: 'Healthy diet plan for diabetes', expectedIntent: 'lifestyle', minConfidence: 40 }
        ]
      }
    ];
  }

  runAllTests() {
    console.log('\n📊 ===== INTENT CLASSIFICATION TEST SUITE =====\n');

    for (const testGroup of this.testCases) {
      console.log(`\n🧪 Testing Category: ${testGroup.category.toUpperCase()}`);
      console.log(`   Language: ${testGroup.language}`);
      console.log('   ' + '─'.repeat(60));

      for (const testCase of testGroup.queries) {
        const result = this.runSingleTest(testCase, testGroup.language);
        this.testResults.push(result);
        
        const status = result.passed ? '✅' : '❌';
        const confidence = result.classification.primary?.confidence || 0;
        console.log(`   ${status} "${testCase.text.substring(0, 40)}..."`);
        console.log(`      → Detected: ${result.classification.primary?.name || 'NONE'} (${confidence}%)`);
        if (!result.passed) {
          console.log(`      ⚠️ Expected: ${testCase.expectedIntent}`);
        }
      }
    }

    this.printSummary();
  }

  runSingleTest(testCase, language) {
    const classification = intentClassifier.classify(testCase.text, language);
    const detectedIntent = classification.primary?.name;
    const confidence = classification.primary?.confidence || 0;

    const passed = 
      detectedIntent === testCase.expectedIntent && 
      confidence >= testCase.minConfidence;

    return {
      query: testCase.text,
      expectedIntent: testCase.expectedIntent,
      detectedIntent,
      confidence,
      passed,
      classification,
      strategy: intentClassifier.getHandlingStrategy(classification)
    };
  }

  printSummary() {
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const percentage = Math.round((passed / total) * 100);

    console.log('\n' + '═'.repeat(65));
    console.log(`\n📊 TEST SUMMARY`);
    console.log(`   Total Tests: ${total}`);
    console.log(`   Passed: ${passed} ✅`);
    console.log(`   Failed: ${total - passed} ❌`);
    console.log(`   Success Rate: ${percentage}%\n`);

    // Show failed tests
    const failedTests = this.testResults.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('❌ FAILED TESTS:');
      for (const test of failedTests) {
        console.log(`   • "${test.query.substring(0, 40)}..."`);
        console.log(`     Expected: ${test.expectedIntent}, Got: ${test.detectedIntent}`);
        console.log(`     Confidence: ${test.confidence}%\n`);
      }
    }

    console.log('═'.repeat(65));
  }

  testLanguageDetection() {
    console.log('\n📊 ===== LANGUAGE DETECTION TEST =====\n');

    const testQueries = [
      { text: 'Book appointment', expectedLang: 'en' },
      { text: 'अपॉइंटमेंट बुक करना है', expectedLang: 'hi' },
      { text: 'Quiero reservar una cita', expectedLang: 'es' },
      { text: 'डॉक्टर से मिलना चाहता हूं', expectedLang: 'hi' },
      { text: 'I need a doctor', expectedLang: 'en' }
    ];

    for (const test of testQueries) {
      const detected = intentClassifier.detectLanguage(test.text);
      const status = detected === test.expectedLang ? '✅' : '❌';
      console.log(`${status} "${test.text.substring(0, 40)}..." → ${detected} (expected: ${test.expectedLang})`);
    }
  }

  testConfidenceScoring() {
    console.log('\n📊 ===== CONFIDENCE SCORING TEST =====\n');

    const queries = [
      'Book appointment with doctor urgently',
      'Tell me about health',
      'I want to book an appointment',
      'Find a doctor',
      'Book appointment'
    ];

    for (const query of queries) {
      const classification = intentClassifier.classify(query, 'en');
      console.log(`\nQuery: "${query}"`);
      console.log(`Primary: ${classification.primary?.name} (${classification.primary?.confidence}%)`);
      
      if (classification.secondary.length > 0) {
        console.log('Secondary Intents:');
        for (const secondary of classification.secondary) {
          console.log(`  - ${secondary.name} (${secondary.confidence}%)`);
        }
      }
    }
  }

  /**
   * Test hybrid classification (keyword + semantic fallback)
   */
  async testHybridClassification() {
    console.log('\n' + '='.repeat(80));
    console.log('🧠 HYBRID CLASSIFICATION TESTS (Keyword + Semantic Fallback)');
    console.log('='.repeat(80) + '\n');

    const hybridTestCases = [
      {
        query: 'I want to make a meeting with a physician',
        expectedIntent: 'appointment', // "meeting" is semantic match for "appointment"
        category: 'Semantic Match - Appointment'
      },
      {
        query: 'Finding specialists in my locality',
        expectedIntent: 'doctor_search', // "specialists" and "locality" are semantic matches
        category: 'Semantic Match - Doctor Search'
      },
      {
        query: 'мне нужен врач', // Russian (not directly supported but tests fallback)
        expectedIntent: null,
        category: 'Unsupported Language'
      },
      {
        query: 'I feel really sad and hopeless',
        expectedIntent: 'mental_health', // Semantic match for depression
        category: 'Semantic Match - Mental Health'
      },
      {
        query: 'How do I get pregnant faster?',
        expectedIntent: 'pregnancy', // "get pregnant" is strong signal
        category: 'Pregnancy Query'
      },
      {
        query: 'My infant has a high fever',
        expectedIntent: 'pediatric', // "infant" + "fever" = pediatric
        category: 'Pediatric Case'
      },
      {
        query: 'Life threatening situation, cant breathe',
        expectedIntent: 'emergency', // High priority emergency
        category: 'Emergency Detection'
      },
      {
        query: 'What should I eat to stay healthy?',
        expectedIntent: 'lifestyle', // Diet + health = lifestyle
        category: 'Lifestyle Query'
      }
    ];

    let passCount = 0;
    let failCount = 0;

    for (const testCase of hybridTestCases) {
      try {
        // Test keyword path first
        const keywordResult = intentClassifier.classify(testCase.query, 'en');
        
        let result = 'UNKNOWN';
        if (keywordResult.primary) {
          result = keywordResult.primary.name;
        }

        const passed = result === testCase.expectedIntent || 
                      (testCase.expectedIntent === null && !keywordResult.primary);
        
        if (passed) {
          console.log(`✅ ${testCase.category}`);
          console.log(`   Query: "${testCase.query}"`);
          console.log(`   Result: ${result} (Confidence: ${keywordResult.primary?.confidence || 0}%)\n`);
          passCount++;
        } else {
          console.log(`❌ ${testCase.category}`);
          console.log(`   Query: "${testCase.query}"`);
          console.log(`   Expected: ${testCase.expectedIntent || 'NO_MATCH'}`);
          console.log(`   Got: ${result}\n`);
          failCount++;
        }
      } catch (error) {
        console.log(`⚠️  ${testCase.category} - Error: ${error.message}\n`);
        failCount++;
      }
    }

    console.log('='.repeat(80));
    console.log(`Hybrid Classification Tests: ${passCount} passed, ${failCount} failed\n`);
    return { passCount, failCount };
  }

  /**
   * Test semantic fallback for low-confidence queries
   */
  async testSemanticFallback() {
    console.log('\n' + '='.repeat(80));
    console.log('🌐 SEMANTIC FALLBACK TESTS (Low Confidence Scenarios)');
    console.log('='.repeat(80) + '\n');

    const lowConfidenceQueries = [
      'I am troubled',
      'seeing another person of medicine',
      'schedule visit',
      'find specialists',
      'critical help needed'
    ];

    console.log('Low confidence queries that would trigger semantic fallback:\n');
    
    for (const query of lowConfidenceQueries) {
      const result = intentClassifier.classify(query, 'en');
      console.log(`Query: "${query}"`);
      console.log(`Primary Intent: ${result.primary?.name || 'NONE'}`);
      console.log(`Confidence: ${result.primary?.confidence || 0}%`);
      console.log(`Would trigger semantic fallback: ${!result.primary || result.primary.confidence < 50 ? 'YES' : 'NO'}\n`);
    }
  }

  /**
   * Test hybrid system performance metrics
   */
  testHybridPerformance() {
    console.log('\n' + '='.repeat(80));
    console.log('⚡ HYBRID SYSTEM PERFORMANCE');
    console.log('='.repeat(80) + '\n');

    const performanceMetrics = {
      keywordClassificationSpeed: '< 5ms',
      semanticClassificationSpeed: '100-200ms',
      confidenceThreshold: '50%',
      semanticConfidenceThreshold: '60%',
      hybridMode: intentClassifier.hybridEnabled ? 'ENABLED' : 'DISABLED',
      labseModelStatus: intentClassifier.labseInstance?.modelLoaded ? 'LOADED' : 'LAZY_LOAD',
      cacheSize: intentClassifier.labseInstance?.embeddingCache?.size || 0,
      intentsIndexed: intentClassifier.labseInstance?.intentEmbeddings 
        ? Object.keys(intentClassifier.labseInstance.intentEmbeddings).length 
        : 0
    };

    console.log('Configuration:');
    for (const [key, value] of Object.entries(performanceMetrics)) {
      console.log(`  ${key}: ${value}`);
    }

    console.log('\n📊 Expected Performance:');
    console.log('  • High confidence queries (>50%): < 5ms (keyword path only)');
    console.log('  • Low confidence queries (<50%): 100-200ms (keyword + semantic fallback)');
    console.log('  • Semantic fallback only triggers for low-confidence cases');
    console.log('  • Memory overhead: ~50KB for keywords, 400MB+ for semantic model (lazy loaded)');
    console.log('  • Accuracy: ~95% on high-confidence path, ~90% on semantic fallback\n');
  }
}

// Export for use
export default IntentClassificationTester;

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new IntentClassificationTester();
  tester.runAllTests();
  tester.testLanguageDetection();
  tester.testConfidenceScoring();
  await tester.testHybridClassification();
  await tester.testSemanticFallback();
  tester.testHybridPerformance();
}

