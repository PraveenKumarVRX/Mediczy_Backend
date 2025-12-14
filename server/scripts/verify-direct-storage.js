import dotenv from 'dotenv';
dotenv.config();

import { connectPostgres, closePostgres } from '../db/postgres.js';
import { connectDuckDB, executeDuckDB, closeDuckDB } from '../db/duckdb.js';

const VERIFICATION_USER = process.env.MEDICAL_AI_VERIFICATION_USER || 'analytics.patient@mediczy.com';

async function verifyPostgres() {
  try {
    const pool = await connectPostgres();

    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*)::int AS total_sessions,
        SUM(CASE WHEN active THEN 1 ELSE 0 END)::int AS active_sessions
      FROM chatbot_sessions
    `);

    const summary = summaryResult.rows[0] || { total_sessions: 0, active_sessions: 0 };
    console.log('🧠 PostgreSQL chatbot_sessions summary:', summary);

    if (VERIFICATION_USER) {
      const detailResult = await pool.query(`
        SELECT session_id, user_id, language, message_count, last_intent, last_provider, last_interaction_at
        FROM chatbot_sessions
        WHERE user_id = $1
        ORDER BY last_interaction_at DESC
        LIMIT 3
      `, [VERIFICATION_USER]);

      if (detailResult.rows.length) {
        console.log(`📁 Sessions for ${VERIFICATION_USER}:`, detailResult.rows);
      } else {
        console.log(`📁 Sessions for ${VERIFICATION_USER}: not found (showing recent sessions instead)`);
        const recentResult = await pool.query(`
          SELECT session_id, user_id, language, message_count, last_intent, last_provider, last_interaction_at
          FROM chatbot_sessions
          ORDER BY last_interaction_at DESC
          LIMIT 3
        `);
        console.log('🕒 Recent sessions:', recentResult.rows);
      }
    }
  } catch (err) {
    console.error('❌ PostgreSQL verification error:', err.message);
  } finally {
    await closePostgres().catch(() => {});
  }
}

async function verifyDuckDB() {
  try {
    const connection = await connectDuckDB();
    if (!connection) {
      console.log('⚠️ DuckDB unavailable, skipping verification');
      return;
    }

    const tables = await executeDuckDB("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
    const tableNames = (tables || []).map(t => t.table_name);
    console.log('🗃️  DuckDB tables:', tableNames);

    if (tableNames.includes('medical_analytics')) {
      const rows = await executeDuckDB('SELECT COUNT(*) AS cnt FROM medical_analytics');
      console.log('📊 DuckDB medical_analytics count:', rows?.[0]?.cnt ?? 0);
    } else {
      console.log('📊 DuckDB medical_analytics:', 'not present');
    }
  } catch (err) {
    console.error('❌ DuckDB verification error:', err.message);
  } finally {
    await closeDuckDB().catch(() => {});
  }
}

async function main() {
  await verifyPostgres();
  await verifyDuckDB();
  console.log('\n✅ Direct storage verification complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
