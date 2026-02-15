#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';

const SIB_URL = 'http://localhost:8001';

const log = {
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  test: (msg) => console.log(chalk.cyan(`🧪 ${msg}`)),
  header: (msg) => console.log(chalk.bold.cyan(`\n${'='.repeat(70)}\n${msg}\n${'='.repeat(70)}`))
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDirectSIBChat() {
  log.header('DIRECT SIB FASTAPI RESPONSE TEST');
  
  // Define test cases to detect repetitiveness
  const testMessages = [
    'I have a fever',
    'I\'m having chest pain',
    'My blood pressure is high',
    'I need a doctor appointment',
    'What should I do for allergies?',
    'I have severe headache',
    'Can you refill my prescription?',
    'I\'m feeling dizzy',
    'How much is a consultation?',
    'Emergency help - can\'t breathe'
  ];
  
  const responses = [];
  
  log.test(`Testing ${testMessages.length} different messages...\n`);
  
  for (let i = 0; i < testMessages.length; i++) {
    const message = testMessages[i];
    log.test(`[${i + 1}/${testMessages.length}] "${message}"`);
    
    try {
      const response = await axios.post(`${SIB_URL}/chat`, {
        message: message,
        phone_number: '+919876543210',
        session_id: `test_${i}_${Date.now()}`,
        patient_id: `test_patient_${i}`,
        user_context: {
          is_known_user: false,
          phone_number: '+919876543210'
        }
      }, { 
        timeout: 8000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      let answer = response.data.chat_answer;
      if (Array.isArray(answer)) {
        answer = answer[0] || answer;
      }
      
      const answerStr = String(answer || '').trim();
      console.log(`   → Length: ${answerStr.length} chars`);
      console.log(`   → Provider: ${response.data.provider || 'sib-brain'}`);
      console.log(`   → Preview: ${answerStr.substring(0, 80)}...`);
      console.log();
      
      responses.push({
        message,
        response: answerStr,
        provider: response.data.provider || 'sib',
        length: answerStr.length
      });
      
      await sleep(500); // Delay between requests
      
    } catch (error) {
      log.error(`${message}: ${error.message}`);
      console.log();
    }
  }
  
  // Analysis
  log.header('RESPONSE ANALYSIS & REPETITIVENESS DETECTION');
  
  const uniqueResponses = new Set(responses.map(r => r.response));
  const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length;
  
  log.info(`Total messages tested: ${responses.length}`);
  log.info(`Unique responses: ${uniqueResponses.size}`);
  log.info(`Repetition ratio: ${((1 - uniqueResponses.size / responses.length) * 100).toFixed(1)}%`);
  log.info(`Average response length: ${avgLength.toFixed(0)} characters`);
  
  // Check for template patterns
  const responseText = responses.map(r => r.response).join('\n\n');
  const hasStructuredTemplate = responseText.includes('**') || responseText.includes('Understanding') || responseText.includes('Recommended');
  
  if (hasStructuredTemplate) {
    log.warn('Structured template detected - responses use markdown formatting');
  }
  
  // Find most common response patterns
  const responsePatterns = new Map();
  responses.forEach(r => {
    const firstLine = r.response.split('\n')[0].substring(0, 50);
    responsePatterns.set(firstLine, (responsePatterns.get(firstLine) || 0) + 1);
  });
  
  log.header('RESPONSE PATTERN ANALYSIS');
  const patterns = Array.from(responsePatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  patterns.forEach(([ pattern, count ], i) => {
    log.info(`Pattern ${i + 1} (${count}x): "${pattern}..."`);
  });
  
  log.header('DETAILED RESPONSE DUMP');
  responses.forEach((r, i) => {
    console.log(`\n${i + 1}. MESSAGE: "${r.message}"`);
    console.log(`   RESPONSE:\n${r.response}`);
    console.log(`   ${'─'.repeat(70)}`);
  });
  
  // Recommendations
  log.header('FINDINGS & RECOMMENDATIONS');
  
  if (uniqueResponses.size <= 2) {
    log.warn('CRITICAL: Responses are highly repetitive (≤2 unique responses)');
    log.info('Possible causes:');
    log.info('  1. SIB model fallback mode is activated');
    log.info('  2. Database is not connected (responses use default template)');
    log.info('  3. Chat endpoint configuration issue');
  } else if (uniqueResponses.size < responses.length * 0.5) {
    log.warn('HIGH: Responses show significant repetition (>50% duplicate)');
    log.info('Possible causes:');
    log.info('  1. Limited model training data');
    log.info('  2. Model temperature too low (increase for diversity)');
    log.info('  3. Intent detection is grouping different messages');
  } else {
    log.success('GOOD: Responses show good variety and differentiation');
  }
  
  console.log();
}

async function main() {
  console.clear();
  console.log(chalk.bold.magenta(`
╔═══════════════════════════════════════════════════════════════════╗
║           DIRECT SIB FASTAPI RESPONSE TEST                        ║
║         Analyzing Response Repetitiveness & Quality               ║
╚═══════════════════════════════════════════════════════════════════╝
  `));

  await testDirectSIBChat();
  
  log.header('TEST COMPLETE');
  log.success('Analysis finished. Review findings above.');
}

main().catch(error => {
  log.error(`Test failed: ${error.message}`);
  process.exit(1);
});
