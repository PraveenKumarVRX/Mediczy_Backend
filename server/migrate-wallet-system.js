/**
 * Database Migration - Health Coins Wallet System
 * Creates wallet, transactions, and activity tracking tables
 *
 * DANGER — DB-RDS-PLAN-2026-09-01 Workstream A-07: this script calls
 * .sync({ alter: true }) on three models, mutating production schema on
 * every run. Confirmed (2026-09-03) NOT wired into any automatic
 * startup/cron path — it only runs if manually executed. Keep it that
 * way: do not import this file's logic into app.js/initialization
 * .controller.js or any route without replacing sync({alter:true}) with
 * a real migration first.
 */

import { postgresSequelize as sequelize } from './db/postgres-sequelize.js';
import UserWallet from './models/postgres/user-wallet.model.postgres.js';
import HealthCoinsTransaction from './models/postgres/health-coins-transaction.model.postgres.js';
import UserActivityLog from './models/postgres/user-activity-log.model.postgres.js';

async function migrateWalletSystem() {
  try {
    console.log('🚀 Starting Health Coins Wallet System migration...\n');
    
    // Create user_wallets table
    console.log('1. Creating user_wallets table...');
    await UserWallet.sync({ alter: true });
    console.log('✅ user_wallets table created/synced\n');
    
    // Create health_coins_transactions table
    console.log('2. Creating health_coins_transactions table...');
    await HealthCoinsTransaction.sync({ alter: true });
    console.log('✅ health_coins_transactions table created/synced\n');
    
    // Create user_activity_logs table
    console.log('3. Creating user_activity_logs table...');
    await UserActivityLog.sync({ alter: true });
    console.log('✅ user_activity_logs table created/synced\n');
    
    console.log('═══════════════════════════════════════════════');
    console.log('✨ Health Coins Wallet System migration complete!');
    console.log('═══════════════════════════════════════════════\n');
    
    console.log('📊 Created tables:');
    console.log('  • user_wallets - User wallet balances and stats');
    console.log('  • health_coins_transactions - Transaction history');
    console.log('  • user_activity_logs - Daily activity tracking\n');
    
    console.log('🎯 Features enabled:');
    console.log('  • Wallet balance management');
    console.log('  • Health coins earning system');
    console.log('  • Daily login rewards (1 HC)');
    console.log('  • Steps rewards (1 HC per 100 steps)');
    console.log('  • Health assessment rewards (5 HC)');
    console.log('  • Streak bonuses (7, 14, 30, 60, 90 days)');
    console.log('  • Transaction history');
    console.log('  • Purchase system integration\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateWalletSystem();
