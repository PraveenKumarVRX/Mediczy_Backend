import sharedPool from '../db/pgPool.js';

const DEFAULT_PREFERENCES = {
  push: true,
  email: true,
  sms: true,
  inApp: true,
  appointmentReminders: true,
  medicationReminders: true,
  followUpReminders: true,
  paymentAlerts: true,
  promotions: false,
  reminderChannels: ['push', 'email'],
  reminderMinutesBefore: 30,
};

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

export async function getNotificationPreferences(userId) {
  await ensureTable();
  const { rows } = await sharedPool.query(
    'SELECT preferences FROM notification_preferences WHERE user_id = $1',
    [userId]
  );
  const stored = rows[0]?.preferences || {};
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export async function saveNotificationPreferences(userId, preferences = {}) {
  await ensureTable();
  const merged = { ...(await getNotificationPreferences(userId)), ...preferences };
  await sharedPool.query(
    `INSERT INTO notification_preferences (user_id, preferences, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
    [userId, JSON.stringify(merged)]
  );
  return merged;
}

export default {
  getNotificationPreferences,
  saveNotificationPreferences,
  DEFAULT_PREFERENCES,
};
