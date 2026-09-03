/**
 * Migration: Create whatsapp_templates table + seed default templates
 * Run: node server/scripts/migrate-whatsapp-templates.js
 *
 * DANGER — DB-RDS-PLAN-2026-09-01 Workstream A-07: this script calls
 * WhatsAppTemplate.sync({ alter: true }), mutating production schema on
 * every run. Confirmed (2026-09-03) NOT wired into any automatic
 * startup/cron path — it only runs if manually executed. Keep it that
 * way: do not import this file's logic into app.js/initialization
 * .controller.js or any route without replacing sync({alter:true}) with
 * a real migration first.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import WhatsAppTemplate from '../models/whatsapp-template.model.js';

const seedTemplates = [
  {
    name: 'appointment_reminder',
    status: 'APPROVED',
    category: 'UTILITY',
    language: 'en_US',
    body: 'Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}. Please confirm by replying YES.',
    footer: 'Mediczy Healthcare',
    header: ''
  },
  {
    name: 'prescription_ready',
    status: 'APPROVED',
    category: 'UTILITY',
    language: 'en_US',
    body: 'Hi {{1}}, your prescription is ready for pickup at our pharmacy. Prescription ID: {{2}}. Please bring a valid ID.',
    footer: 'Mediczy Pharmacy',
    header: ''
  },
  {
    name: 'test_results_available',
    status: 'APPROVED',
    category: 'UTILITY',
    language: 'en_US',
    body: 'Dear {{1}}, your test results are now available. Please log in to your Mediczy account or visit our lab to collect them. Report ID: {{2}}.',
    footer: 'Mediczy Labs',
    header: ''
  },
  {
    name: 'health_checkup_confirmation',
    status: 'APPROVED',
    category: 'UTILITY',
    language: 'en_US',
    header: 'Health Checkup Appointment Update',
    body: 'Dear {{1}},\n\nYour health checkup appointment has been confirmed!\n\n📍 Lab: {{2}}\n📌 Address: {{3}}\n📅 Date: {{4}}\n🕐 Time: {{5}}\n\nPlease arrive 15 minutes early with a valid ID. Fasting may be required for certain tests — kindly check email for more details.\n\nFor rescheduling or queries, contact us via this chat.',
    footer: 'SmartHealth'
  },
  {
    name: 'annual_health_checkup_update',
    status: 'APPROVED',
    category: 'UTILITY',
    language: 'en_US',
    header: 'Equitas Health Checkup Update',
    body: 'Dear {{1}}\n\nThis is gentle reminder to avail your corporate annual health checkup which is due. Kindly reply back with your Full Name, Emp ID, preferred location for Health Checkup appointment booking, with preferred date. Once we receive these details we will get back to you with appointment updates.\n',
    footer: 'Team SmartHealth'
  }
];

async function migrate() {
  try {
    console.log('🔄 Syncing WhatsAppTemplate model to database...');
    await WhatsAppTemplate.sync({ alter: true });
    console.log('✅ whatsapp_templates table ready');

    // Seed only if table is empty
    const count = await WhatsAppTemplate.count();
    if (count === 0) {
      console.log('🌱 Seeding default templates...');
      await WhatsAppTemplate.bulkCreate(seedTemplates);
      console.log(`✅ Seeded ${seedTemplates.length} templates`);
    } else {
      console.log(`ℹ️  Table already has ${count} templates, skipping seed`);
    }

    const templates = await WhatsAppTemplate.findAll();
    console.log('\n📋 Templates in database:');
    templates.forEach(t => {
      console.log(`  [${t.id}] ${t.name} — ${t.status} (${t.category})`);
    });

    console.log('\n✅ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
