#!/usr/bin/env node

/**
 * Sanity check for webinar calendar integration
 * Tests imports and basic functionality without database dependencies
 */

console.log('🧪 Webinar Integration Sanity Check\n');
console.log('='.repeat(60));

let passedTests = 0;
let totalTests = 0;

async function test(description, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`✅ ${description}`);
    passedTests++;
    return true;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  // Test 1: Import iCal Generator
  await test('Import webinarICalGenerator.js', async () => {
    const module = await import('./utils/webinarICalGenerator.js');
    if (!module.generateWebinarICalFile) throw new Error('Missing generateWebinarICalFile function');
    if (!module.generateWebinarHostICalFile) throw new Error('Missing generateWebinarHostICalFile function');
    if (!module.generateWebinarICalFilename) throw new Error('Missing generateWebinarICalFilename function');
  });

  // Test 2: Import Notification Service
  await test('Import webinar-notification.service.js', async () => {
    const module = await import('./services/webinar-notification.service.js');
    if (!module.default) throw new Error('Missing default export');
  });

  // Test 3: Import Cron Service (without starting it)
  await test('Import webinar-reminder-cron.service.js', async () => {
    // We can't actually import this without it auto-starting, so we check the file exists
    const fs = await import('fs');
    const path = './services/webinar-reminder-cron.service.js';
    if (!fs.existsSync(path)) throw new Error('File not found');
  });

  // Test 4: Generate sample iCal file
  await test('Generate sample iCal file', async () => {
    const { generateWebinarICalFile } = await import('./utils/webinarICalGenerator.js');
    
    const sampleWebinar = {
      id: 1,
      title: 'Test Webinar: Diabetes Management',
      description: 'Learn about effective diabetes management strategies',
      scheduled_at: new Date('2026-02-15T10:00:00Z'),
      duration: 60,
      meeting_url: 'https://meet.mediczy.com/test-room',
      doctor: {
        id: 1,
        name: 'Dr. Test Doctor',
        email: 'doctor@mediczy.com'
      }
    };
    
    const sampleUser = {
      id: 1,
      name: 'Test User',
      email: 'user@example.com'
    };
    
    const icalContent = generateWebinarICalFile(sampleWebinar, sampleUser);
    
    // Verify iCal format
    if (!icalContent.includes('BEGIN:VCALENDAR')) throw new Error('Missing VCALENDAR header');
    if (!icalContent.includes('BEGIN:VEVENT')) throw new Error('Missing VEVENT');
    if (!icalContent.includes('SUMMARY:Test Webinar: Diabetes Management')) throw new Error('Missing title');
    if (!icalContent.includes('ORGANIZER')) throw new Error('Missing organizer');
    if (!icalContent.includes('ATTENDEE')) throw new Error('Missing attendee');
    if (!icalContent.includes('VALARM')) throw new Error('Missing alarms');
    if (!icalContent.includes('END:VCALENDAR')) throw new Error('Missing VCALENDAR footer');
    
    // Count alarms (should have 4: 1 week, 1 day, 2 hours, 15 minutes)
    const alarmCount = (icalContent.match(/BEGIN:VALARM/g) || []).length;
    if (alarmCount !== 4) throw new Error(`Expected 4 alarms, found ${alarmCount}`);
  });

  // Test 5: Generate host iCal file
  await test('Generate host iCal file', async () => {
    const { generateWebinarHostICalFile } = await import('./utils/webinarICalGenerator.js');
    
    const sampleWebinar = {
      id: 1,
      title: 'Test Webinar: Diabetes Management',
      description: 'Learn about effective diabetes management strategies',
      scheduled_at: new Date('2026-02-15T10:00:00Z'),
      duration: 60,
      meeting_url: 'https://meet.mediczy.com/test-room',
      doctor: {
        id: 1,
        name: 'Dr. Test Doctor',
        email: 'doctor@mediczy.com'
      }
    };
    
    const icalContent = generateWebinarHostICalFile(sampleWebinar);
    
    // Verify organizer role
    if (!icalContent.includes('ORGANIZER;CN=Dr. Test Doctor')) throw new Error('Missing organizer info');
    if (!icalContent.includes('ROLE=CHAIR')) throw new Error('Host should have CHAIR role');
  });

  // Test 6: Verify filename generation
  await test('Generate iCal filename', async () => {
    const { generateWebinarICalFilename } = await import('./utils/webinarICalGenerator.js');
    
    const sampleWebinar = {
      id: 1,
      title: 'Test Webinar: Diabetes Management',
      scheduled_at: new Date('2026-02-15T10:00:00Z')
    };
    
    const filename = generateWebinarICalFilename(sampleWebinar, false);
    if (!filename.endsWith('.ics')) throw new Error('Filename should end with .ics');
    if (!filename.includes('diabetes-management')) throw new Error('Filename should include sanitized title');
    
    const hostFilename = generateWebinarICalFilename(sampleWebinar, true);
    if (!hostFilename.includes('host')) throw new Error('Host filename should include "host"');
  });

  // Test 7: Check route integrations
  await test('Verify webinar.routes.js imports', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./routes/webinar.routes.js', 'utf-8');
    if (!content.includes('webinar-notification.service')) throw new Error('Missing notification service import');
    if (!content.includes('sendRegistrationConfirmation')) throw new Error('Missing sendRegistrationConfirmation call');
  });

  await test('Verify admin/webinar.routes.js imports', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./routes/admin/webinar.routes.js', 'utf-8');
    if (!content.includes('webinar-notification.service')) throw new Error('Missing notification service import');
    if (!content.includes('sendHostCalendarInvite')) throw new Error('Missing sendHostCalendarInvite call');
  });

  // Test 8: Check initialization controller
  await test('Verify cron initialization', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./controllers/initialization.controller.js', 'utf-8');
    if (!content.includes('webinar-reminder-cron.service')) throw new Error('Missing cron service import');
    if (!content.includes('Starting webinar reminder automation')) throw new Error('Missing initialization log');
  });

  // Test 9: Check migration file
  await test('Verify migration SQL file exists', async () => {
    const fs = await import('fs');
    if (!fs.existsSync('./migrations/add_webinar_notifications.sql')) {
      throw new Error('Migration file not found');
    }
    const content = fs.readFileSync('./migrations/add_webinar_notifications.sql', 'utf-8');
    if (!content.includes('reminder_1week_sent')) throw new Error('Missing reminder_1week_sent column');
    if (!content.includes('reminder_24h_sent')) throw new Error('Missing reminder_24h_sent column');
    if (!content.includes('confirmation_email_sent')) throw new Error('Missing confirmation_email_sent column');
  });

  // Test 10: Verify iCal escaping
  await test('Verify iCal special character escaping', async () => {
    const { generateWebinarICalFile } = await import('./utils/webinarICalGenerator.js');
    
    const webinarWithSpecialChars = {
      id: 1,
      title: 'Test: Special, Characters; Here\\nNewline',
      description: 'Description with "quotes" and \\backslashes',
      scheduled_at: new Date('2026-02-15T10:00:00Z'),
      duration: 60,
      meeting_url: 'https://meet.mediczy.com/test',
      doctor: {
        id: 1,
        name: 'Dr. Test',
        email: 'doctor@mediczy.com'
      }
    };
    
    const user = { id: 1, name: 'Test User', email: 'user@example.com' };
    const icalContent = generateWebinarICalFile(webinarWithSpecialChars, user);
    
    // Check that special characters are escaped
    if (icalContent.includes('Here\nNewline')) throw new Error('Newlines should be escaped as \\n');
    if (!icalContent.includes('Here\\nNewline')) throw new Error('Newlines not properly escaped');
  });

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All sanity checks passed! Integration is ready.');
    return true;
  } else {
    console.log(`\n⚠️  ${totalTests - passedTests} test(s) failed. Please review errors above.`);
    return false;
  }
}

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
