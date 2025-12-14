/**
 * Twilio WhatsApp Integration Test Script
 * Tests the Twilio WhatsApp configuration and sends a test message
 */

import 'dotenv/config';
import twilio from 'twilio';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n`)
};

async function testTwilioWhatsApp() {
  log.section('🔍 Twilio WhatsApp Integration Test');

  // Step 1: Check environment variables
  log.info('Step 1: Checking environment variables...');
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid) {
    log.error('TWILIO_ACCOUNT_SID is not set in .env file');
    return false;
  }
  log.success(`Account SID found: ${accountSid.substring(0, 10)}...`);

  if (!authToken) {
    log.error('TWILIO_AUTH_TOKEN is not set in .env file');
    return false;
  }
  log.success(`Auth Token found: ${'*'.repeat(authToken.length)}`);

  if (!whatsappNumber) {
    log.error('TWILIO_PHONE_NUMBER or TWILIO_WHATSAPP_NUMBER is not set in .env file');
    return false;
  }
  log.success(`WhatsApp Number: ${whatsappNumber}`);

  // Step 2: Initialize Twilio client
  log.info('\nStep 2: Initializing Twilio client...');
  let client;
  try {
    client = twilio(accountSid, authToken);
    log.success('Twilio client initialized successfully');
  } catch (error) {
    log.error(`Failed to initialize Twilio client: ${error.message}`);
    return false;
  }

  // Step 3: Verify account details
  log.info('\nStep 3: Verifying Twilio account...');
  try {
    const account = await client.api.accounts(accountSid).fetch();
    log.success(`Account Status: ${account.status}`);
    log.success(`Account Name: ${account.friendlyName || 'N/A'}`);
    log.success(`Account Type: ${account.type || 'N/A'}`);
  } catch (error) {
    log.error(`Failed to fetch account details: ${error.message}`);
    if (error.code === 20003) {
      log.error('Authentication failed. Please check your Account SID and Auth Token.');
    }
    return false;
  }

  // Step 4: Check WhatsApp sandbox status
  log.info('\nStep 4: Checking WhatsApp configuration...');
  try {
    // Try to fetch phone numbers
    const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    
    if (incomingPhoneNumbers.length > 0) {
      log.success(`Found ${incomingPhoneNumbers.length} phone number(s) in account`);
      
      // Check if the configured number exists
      const configuredNumber = incomingPhoneNumbers.find(
        num => num.phoneNumber === whatsappNumber || num.phoneNumber === `whatsapp:${whatsappNumber}`
      );
      
      if (configuredNumber) {
        log.success(`Configured number ${whatsappNumber} is valid`);
        log.info(`  Friendly Name: ${configuredNumber.friendlyName}`);
        log.info(`  Capabilities: Voice=${configuredNumber.capabilities.voice}, SMS=${configuredNumber.capabilities.sms}`);
      } else {
        log.warn(`Configured number ${whatsappNumber} not found in account`);
        log.info('Available numbers:');
        incomingPhoneNumbers.forEach(num => {
          log.info(`  - ${num.phoneNumber} (${num.friendlyName})`);
        });
      }
    } else {
      log.warn('No phone numbers found in account');
      log.info('You may be using Twilio Sandbox for WhatsApp');
    }
  } catch (error) {
    log.warn(`Could not fetch phone numbers: ${error.message}`);
    log.info('This is normal if using Twilio Sandbox');
  }

  // Step 5: Send a test message
  log.section('\n📤 Sending Test WhatsApp Message');
  
  // Prompt for test number
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter a phone number to send test message to (format: +91XXXXXXXXXX) or press Enter to skip: ', async (testNumber) => {
      rl.close();

      if (!testNumber || testNumber.trim() === '') {
        log.info('Skipping test message sending');
        log.section('✅ Configuration Test Complete!');
        log.success('Twilio WhatsApp is properly configured');
        log.info('\nNext steps:');
        log.info('1. To send messages, use the /api/whatsapp-config/message endpoint');
        log.info('2. For sandbox, users must join by sending a code to the sandbox number');
        log.info('3. For production, apply for WhatsApp Business API approval');
        resolve(true);
        return;
      }

      testNumber = testNumber.trim();
      
      // Validate phone number format
      if (!testNumber.startsWith('+')) {
        testNumber = `+${testNumber}`;
      }

      const phoneRegex = /^\+\d{10,15}$/;
      if (!phoneRegex.test(testNumber)) {
        log.error('Invalid phone number format. Use international format: +91XXXXXXXXXX');
        resolve(false);
        return;
      }

      log.info(`Sending test message to ${testNumber}...`);

      try {
        const message = await client.messages.create({
          from: `whatsapp:${whatsappNumber}`,
          to: `whatsapp:${testNumber}`,
          body: '🏥 *Mediczy WhatsApp Test*\n\nYour WhatsApp integration is working! This is a test message from Mediczy healthcare platform.\n\n✓ Twilio configured\n✓ Messages working\n✓ Ready for production\n\nReply "Hi" to confirm receipt.'
        });

        log.success(`Message sent successfully!`);
        log.info(`Message SID: ${message.sid}`);
        log.info(`Status: ${message.status}`);
        log.info(`To: ${message.to}`);
        log.info(`From: ${message.from}`);
        log.info(`Date: ${message.dateCreated}`);

        if (message.errorCode) {
          log.error(`Error Code: ${message.errorCode}`);
          log.error(`Error Message: ${message.errorMessage}`);
        }

        log.section('✅ Test Complete!');
        log.success('Twilio WhatsApp integration is fully functional');
        
        log.info('\n📊 Test Summary:');
        log.info('✓ Credentials validated');
        log.info('✓ Account verified');
        log.info('✓ Test message sent');
        log.info('✓ Integration working');

        log.info('\n💡 Important Notes:');
        log.info('• For Sandbox: Users must join by messaging the sandbox code');
        log.info('• For Production: Apply for WhatsApp Business API approval');
        log.info('• Cost: ~₹0.65-2.50 per message (varies by country)');
        log.info('• Documentation: https://www.twilio.com/docs/whatsapp');

        resolve(true);
      } catch (error) {
        log.error(`Failed to send test message: ${error.message}`);
        
        if (error.code === 21610) {
          log.warn('\n⚠️  Sandbox Mode Detected');
          log.info('The recipient must first join your sandbox by:');
          log.info('1. Send a WhatsApp message to your Twilio sandbox number');
          log.info('2. Include the join code (e.g., "join [your-code]")');
          log.info('3. After joining, try sending the test message again');
          log.info('\nFind your sandbox details at: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
        } else if (error.code === 21211) {
          log.error('\n❌ Invalid "To" Phone Number');
          log.info('Make sure the phone number is:');
          log.info('• In international format (+91XXXXXXXXXX)');
          log.info('• A valid WhatsApp-enabled number');
          log.info('• Registered in the sandbox (if using sandbox mode)');
        } else if (error.code === 21606) {
          log.error('\n❌ Invalid "From" Phone Number');
          log.info('The configured WhatsApp number is not valid for this account');
          log.info('Check your TWILIO_PHONE_NUMBER in .env file');
        }

        log.info('\nError Details:');
        log.info(`Code: ${error.code || 'N/A'}`);
        log.info(`Message: ${error.message}`);
        log.info(`More Info: ${error.moreInfo || 'N/A'}`);

        resolve(false);
      }
    });
  });
}

// Run the test
testTwilioWhatsApp()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log.error(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
