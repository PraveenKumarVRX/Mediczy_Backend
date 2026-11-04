import pool from '../db/pgPool.js';
import { applyChatbotSchema } from '../db/chatbot-completion-schema.js';
export async function up({ database = pool, dryRun = false } = {}) {
  return applyChatbotSchema(database, {dryRun});
}
// No destructive automatic down: histories, reviews and idempotency receipts are retained.
