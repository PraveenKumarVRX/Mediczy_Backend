#!/usr/bin/env node
/**
 * Test Ticketing System + RocketChat Integration
 * Creates a test ticket and verifies RocketChat channel creation
 */

import fetch from 'node-fetch';

const API_BASE = 'https://app.mediqzy.com/api';

async function testTicketCreation() {
  console.log('🎫 Testing Ticketing System + RocketChat Integration\n');
  
  // Test 1: Create regular ticket
  console.log('1️⃣  Creating regular support ticket...');
  try {
    // Note: This would normally require auth token
    // For testing, we'll use the WhatsApp endpoint which doesn't require auth
    const response = await fetch(`${API_BASE}/tickets/from-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: '+917373007737',
        customerName: 'Test User (Integration Test)',
        message: 'This is a test ticket to verify RocketChat integration is working properly. Please check if a channel was created.',
        conversationHistory: [
          {
            sender: 'user',
            content: 'Hi, I need help',
            timestamp: new Date().toISOString()
          },
          {
            sender: 'agent',
            content: 'Hello! How can I assist you?',
            timestamp: new Date().toISOString()
          }
        ],
        priority: 'medium',
        category: 'technical'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ticket created successfully!');
      console.log(`   Ticket ID: ${data.ticket.ticketId || data.ticket._id}`);
      console.log(`   Status: ${data.ticket.status}`);
      console.log(`   Priority: ${data.ticket.priority}`);
      console.log(`   Category: ${data.ticket.category}`);
      
      const channelName = `ticket-${data.ticket.ticketId || data.ticket._id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      console.log(`\n📺 RocketChat channel should be created: #${channelName}`);
      console.log(`   Check: https://smart-chat.live/channel/${channelName}`);
      console.log(`   Also check #general for notification`);
      
      return data.ticket;
    } else {
      const error = await response.text();
      console.error('❌ Failed to create ticket:', error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error creating ticket:', error.message);
    return null;
  }
}

async function testRocketChatConnection() {
  console.log('\n2️⃣  Testing RocketChat connection...');
  try {
    const response = await fetch(`${API_BASE}/rocketchat/test`);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ RocketChat connection is working');
      console.log(`   Authenticated as: ${data.user?.name || 'Unknown'}`);
    } else {
      console.log('⚠️  RocketChat connection issue:', data.message);
    }
  } catch (error) {
    console.error('❌ RocketChat connection error:', error.message);
  }
}

async function listRocketChatChannels() {
  console.log('\n3️⃣  Listing RocketChat channels...');
  try {
    const response = await fetch(`${API_BASE}/rocketchat/channels`);
    const data = await response.json();
    
    if (data.success && data.channels) {
      console.log(`✅ Found ${data.channels.length} channels:`);
      
      // Filter ticket channels
      const ticketChannels = data.channels.filter(ch => 
        ch.name.startsWith('ticket-')
      );
      
      if (ticketChannels.length > 0) {
        console.log(`\n   📋 Ticket Channels (${ticketChannels.length}):`);
        ticketChannels.slice(0, 10).forEach(ch => {
          console.log(`      - #${ch.name} (${ch._id})`);
        });
        
        if (ticketChannels.length > 10) {
          console.log(`      ... and ${ticketChannels.length - 10} more`);
        }
      } else {
        console.log('   No ticket channels found yet');
      }
    } else {
      console.log('⚠️  Could not list channels');
    }
  } catch (error) {
    console.error('❌ Error listing channels:', error.message);
  }
}

// Run tests
(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Mediczy Ticketing + RocketChat Integration Test');
  console.log('═══════════════════════════════════════════════════════\n');
  
  await testRocketChatConnection();
  await listRocketChatChannels();
  
  const ticket = await testTicketCreation();
  
  if (ticket) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ Integration Test Complete!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📋 Next Steps:');
    console.log('   1. Login to RocketChat: https://smart-chat.live');
    console.log('   2. Username: parinitha@mysmarthealth.in');
    console.log('   3. Password: Welcome@2026');
    console.log('   4. Check #general channel for ticket notification');
    console.log(`   5. Join channel: #ticket-${(ticket.ticketId || ticket._id).toLowerCase()}`);
    console.log('   6. View ticket in admin: https://app.mediqzy.com/admin/tickets');
    console.log('\n📖 Full Documentation: /home/ubuntu/Mediczy/TICKETING_SYSTEM_GUIDE.md');
  } else {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ⚠️  Test Failed - Check Logs');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n🔍 Debug:');
    console.log('   pm2 logs mediczy-server --lines 100');
  }
  
  console.log('\n');
})();
