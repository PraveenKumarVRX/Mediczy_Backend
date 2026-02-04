#!/usr/bin/env node

/**
 * Quick functional test - Generate sample iCal and verify format
 */

import { generateWebinarICalFile, generateWebinarHostICalFile } from './utils/webinarICalGenerator.js';

console.log('🧪 Testing iCal Generation\n');

// Sample webinar data
const sampleWebinar = {
  id: 999,
  title: 'Heart Health & Wellness Webinar',
  description: 'Join us for an informative session on maintaining cardiovascular health through diet, exercise, and lifestyle modifications.',
  scheduled_at: new Date('2026-02-20T15:30:00+05:30'), // IST
  duration: 90,
  meeting_url: 'https://meet.mediczy.com/heart-health-session',
  doctor: {
    id: 1,
    name: 'Dr. Sarah Johnson',
    email: 'dr.sarah@mediczy.com',
    specialization: 'Cardiologist'
  }
};

const sampleUser = {
  id: 123,
  name: 'John Doe',
  email: 'john.doe@example.com'
};

try {
  console.log('1️⃣ Generating attendee iCal file...');
  const attendeeICal = generateWebinarICalFile(sampleWebinar, sampleUser);
  
  console.log('\n📄 ATTENDEE ICAL CONTENT:');
  console.log('─'.repeat(80));
  console.log(attendeeICal);
  console.log('─'.repeat(80));
  
  // Validate format
  const checks = [
    { test: attendeeICal.includes('BEGIN:VCALENDAR'), label: 'Has VCALENDAR' },
    { test: attendeeICal.includes('VERSION:2.0'), label: 'Has version' },
    { test: attendeeICal.includes('PRODID:-//Mediczy'), label: 'Has product ID' },
    { test: attendeeICal.includes('BEGIN:VEVENT'), label: 'Has VEVENT' },
    { test: attendeeICal.includes('SUMMARY:Heart Health'), label: 'Has title' },
    { test: attendeeICal.includes('DESCRIPTION:Join us'), label: 'Has description' },
    { test: attendeeICal.includes('ORGANIZER'), label: 'Has organizer' },
    { test: attendeeICal.includes('ATTENDEE'), label: 'Has attendee' },
    { test: attendeeICal.includes('URL:https://meet.mediczy.com'), label: 'Has meeting URL' },
    { test: (attendeeICal.match(/BEGIN:VALARM/g) || []).length === 4, label: 'Has 4 alarms' },
    { test: attendeeICal.includes('TRIGGER:-P1W'), label: 'Has 1-week alarm' },
    { test: attendeeICal.includes('TRIGGER:-P1D'), label: 'Has 1-day alarm' },
    { test: attendeeICal.includes('TRIGGER:-PT2H'), label: 'Has 2-hour alarm' },
    { test: attendeeICal.includes('TRIGGER:-PT15M'), label: 'Has 15-min alarm' },
    { test: attendeeICal.includes('END:VCALENDAR'), label: 'Has end tag' }
  ];
  
  console.log('\n✅ Validation Results:');
  let passed = 0;
  checks.forEach(check => {
    if (check.test) {
      console.log(`   ✅ ${check.label}`);
      passed++;
    } else {
      console.log(`   ❌ ${check.label}`);
    }
  });
  
  console.log(`\n   ${passed}/${checks.length} checks passed`);
  
  console.log('\n2️⃣ Generating host iCal file...');
  const hostICal = generateWebinarHostICalFile(sampleWebinar);
  
  console.log('\n📄 HOST ICAL CONTENT (excerpt):');
  console.log('─'.repeat(80));
  const hostLines = hostICal.split('\n').slice(0, 30);
  console.log(hostLines.join('\n'));
  console.log('   ... (truncated) ...');
  console.log('─'.repeat(80));
  
  // Validate host-specific features
  const hostChecks = [
    { test: hostICal.includes('ORGANIZER;CN=Dr. Sarah Johnson'), label: 'Has organizer name' },
    { test: hostICal.includes('ROLE=CHAIR'), label: 'Host has CHAIR role' },
    { test: !hostICal.includes('ATTENDEE'), label: 'No attendees listed for host' }
  ];
  
  console.log('\n✅ Host-specific validation:');
  let hostPassed = 0;
  hostChecks.forEach(check => {
    if (check.test) {
      console.log(`   ✅ ${check.label}`);
      hostPassed++;
    } else {
      console.log(`   ❌ ${check.label}`);
    }
  });
  
  console.log(`\n   ${hostPassed}/${hostChecks.length} checks passed`);
  
  if (passed === checks.length && hostPassed === hostChecks.length) {
    console.log('\n🎉 iCal generation test PASSED!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some checks failed');
    process.exit(1);
  }
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
