import { drainChatDeliveries } from '../repositories/chat-delivery.repository.js';
import { getNotificationPreferences } from './notification-preferences.service.js';
import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { createDurableChatSessions } from '../repositories/owned-chat-sessions.js';
import notifications from './notification.service.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { withCron } from '../utils/cronRegistry.js';

export { drainChatDeliveries } from '../repositories/chat-delivery.repository.js';

export function startMedicalChatMaintenance() {
  return cron.schedule('* * * * *', () => withCron('medical_chat_maintenance', async () => {
    await createDurableChatSessions(pool).purgeExpired();
    await withRlsTransaction(pool,{orgId:0,userId:0,isPlatformAdmin:true},client=>client.query(`UPDATE appointments SET notes_json=jsonb_set(notes_json,'{handoff,status}','"failed"'::jsonb)
      WHERE notes_json->>'type'='emergency_triage' AND notes_json->'handoff'->>'status' IN ('offered','accepted')
      AND "createdAt"<NOW()-INTERVAL '15 minutes'`));
    return drainChatDeliveries(pool,notifications,getNotificationPreferences);
  }).catch(() => {}));
}
