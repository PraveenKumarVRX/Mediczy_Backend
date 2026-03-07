/**
 * Memory Tools — 3 tools for persistent user memory
 * recall_user_memory, remember_fact, add_brain_note
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';

// ─── 1. Recall User Memory ────────────────────────────────

register({
  name: 'recall_user_memory',
  description: 'Retrieve stored facts, notes, and preferences about the user from persistent memory. Use this to personalize responses.',
  category: 'memory',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const { rows } = await db.query(
      `SELECT facts, notes, preferences, stats, last_interaction
       FROM ai_user_memory
       WHERE user_id = $1 AND user_type = $2`,
      [ctx.userId, ctx.userType || 'patient']
    );

    if (rows.length === 0) {
      return { facts: {}, notes: '', preferences: {}, stats: {}, message: 'No stored memory for this user yet.' };
    }

    return rows[0];
  }
});

// ─── 2. Remember Fact ──────────────────────────────────────

register({
  name: 'remember_fact',
  description: 'Store a key-value fact about the user for future reference. Examples: preferred language, chronic conditions mentioned, family size, lifestyle habits.',
  category: 'memory',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Fact key (e.g., "preferred_language", "chronic_condition", "family_size")' },
      value: { type: 'string', description: 'Fact value' }
    },
    required: ['key', 'value']
  },
  async execute(params, ctx) {
    const db = pool;

    // Upsert memory record
    await db.query(
      `INSERT INTO ai_user_memory (user_id, user_type, facts, last_interaction, updated_at)
       VALUES ($1, $2, jsonb_build_object($3::text, $4::text), NOW(), NOW())
       ON CONFLICT (user_id, user_type) DO UPDATE SET
         facts = ai_user_memory.facts || jsonb_build_object($3::text, $4::text),
         last_interaction = NOW(),
         updated_at = NOW()`,
      [ctx.userId, ctx.userType || 'patient', params.key, params.value]
    );

    return {
      success: true,
      stored: { [params.key]: params.value },
      message: `Remembered: ${params.key} = ${params.value}`
    };
  }
});

// ─── 3. Add Brain Note ─────────────────────────────────────

register({
  name: 'add_brain_note',
  description: 'Add a free-form note to user memory. Use for observations, context, or anything worth remembering about the user\'s health journey.',
  category: 'memory',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      note: { type: 'string', description: 'Free-form note text' }
    },
    required: ['note']
  },
  async execute(params, ctx) {
    const db = pool;
    const timestamp = new Date().toISOString();
    const noteWithTs = `[${timestamp}] ${params.note}`;

    await db.query(
      `INSERT INTO ai_user_memory (user_id, user_type, notes, last_interaction, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, user_type) DO UPDATE SET
         notes = CASE
           WHEN ai_user_memory.notes IS NULL OR ai_user_memory.notes = '' THEN $3
           ELSE ai_user_memory.notes || E'\n' || $3
         END,
         last_interaction = NOW(),
         updated_at = NOW()`,
      [ctx.userId, ctx.userType || 'patient', noteWithTs]
    );

    return { success: true, note: noteWithTs, message: 'Note stored in memory.' };
  }
});
