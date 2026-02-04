#!/usr/bin/env node

/**
 * Quick demo: Generate a real iCal file you can test
 */

import { generateWebinarICalFile } from './utils/webinarICalGenerator.js';
import fs from 'fs';
import path from 'path';

const sampleWebinar = {
  id: 999,
  title: 'Diabetes Management & Prevention',
  description: 'Join Dr. Sarah for an informative session on managing diabetes through lifestyle changes, medication, and monitoring. Learn practical tips you can implement today!',
  scheduled_at: new Date('2026-02-15T14:00:00+05:30'),
  duration: 60,
  meeting_url: 'https://meet.mediczy.com/diabetes-webinar-2026',
  doctor: {
    id: 1,
    name: 'Dr. Sarah Johnson',
    email: 'dr.sarah@mediczy.com',
    specialization: 'Endocrinologist'
  }
};

const sampleUser = {
  id: 123,
  name: 'John Doe',
  email: 'john.doe@example.com'
};

try {
  console.log('🎯 Generating sample webinar calendar invite...\n');
  
  const icalContent = generateWebinarICalFile(sampleWebinar, sampleUser);
  
  // Save to file
  const outputPath = path.join(process.cwd(), 'sample-webinar-invite.ics');
  fs.writeFileSync(outputPath, icalContent);
  
  console.log('✅ Calendar file generated successfully!');
  console.log(`📁 Saved to: ${outputPath}`);
  console.log('\n📋 To test:');
  console.log('   1. Double-click the .ics file');
  console.log('   2. It will open in your calendar app (Google/Apple/Outlook)');
  console.log('   3. Check that the event has 4 reminder alarms');
  console.log('   4. Verify the meeting URL is clickable\n');
  
  console.log('📄 iCal Content Preview:');
  console.log('─'.repeat(80));
  console.log(icalContent.split('\n').slice(0, 40).join('\n'));
  console.log('   ... (truncated) ...');
  console.log('─'.repeat(80));
  
  console.log(`\n✨ File ready for testing!`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
