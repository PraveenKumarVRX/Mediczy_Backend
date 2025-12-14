#!/usr/bin/env node

import { queues } from './config/queues.js';

console.log('🚀 Testing BullMQ Queues\n');

async function testQueues() {
  try {
    // Test 1: Email Queue
    console.log('📧 Adding email job...');
    const emailJob = await queues.email.add('test-email', {
      to: 'test@example.com',
      subject: 'Test Email from BullMQ',
      body: 'This is a test email from the queue system'
    });
    console.log(`✅ Email job added: ${emailJob.id}\n`);

    // Test 2: Notification Queue
    console.log('🔔 Adding notification job...');
    const notifJob = await queues.notifications.add('test-notification', {
      userId: 'test-user-123',
      type: 'push',
      title: 'Test Notification',
      message: 'This is a test notification from BullMQ'
    });
    console.log(`✅ Notification job added: ${notifJob.id}\n`);

    // Test 3: Analytics Queue
    console.log('📈 Adding analytics job...');
    const analyticsJob = await queues.analytics.add('test-event', {
      eventType: 'test_event',
      data: { test: true },
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Analytics job added: ${analyticsJob.id}\n`);

    // Wait a bit for processing
    console.log('⏳ Waiting 3 seconds for jobs to process...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check job statuses
    console.log('📊 Checking job statuses:\n');
    
    const emailState = await emailJob.getState();
    console.log(`Email job state: ${emailState}`);
    
    const notifState = await notifJob.getState();
    console.log(`Notification job state: ${notifState}`);
    
    const analyticsState = await analyticsJob.getState();
    console.log(`Analytics job state: ${analyticsState}\n`);

    // Get queue stats
    console.log('📊 Queue Statistics:\n');
    for (const [name, queue] of Object.entries(queues)) {
      const counts = await queue.getJobCounts();
      console.log(`${name}:`, counts);
    }

    console.log('\n✅ BullMQ test completed successfully!');
    console.log('\n💡 Check the PM2 logs to see worker processing:');
    console.log('   pm2 logs mediczy-server --lines 50\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testQueues();
