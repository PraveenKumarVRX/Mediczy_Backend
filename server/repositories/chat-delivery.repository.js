export async function drainChatDeliveries(database, notify, getPreferences = null) {
  const client = await database.connect();
  let delivered = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT session_id,metadata->'delivery' AS delivery FROM chatbot_sessions
      WHERE metadata->'delivery'->>'status'='pending'
      AND COALESCE((metadata->'delivery'->>'retryAt')::timestamptz,NOW())<=NOW()
      ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`);
    for (const row of rows) {
      const event = row.delivery;
      try {
        if (getPreferences && (await getPreferences(event.userId)).inApp === false) {
          event.status='opted_out';
          await client.query(`UPDATE chatbot_sessions SET metadata=jsonb_set(metadata,'{delivery}',$2::jsonb) WHERE session_id=$1`,[row.session_id,JSON.stringify(event)]);
          continue;
        }
        const result = await notify.send({ userId: event.userId, userType: 'user', type: 'appointment_change',
          variables: { appointmentId: event.appointmentId, change: event.kind === 'cancel' ? 'cancelled' : 'rescheduled' },
          channels: ['in-app'], data: { eventId: event.eventId, appointmentId: event.appointmentId }, actionUrl: '/appointments' });
        if (!result.success) throw new Error('Notification unavailable');
        event.status = 'delivered'; delivered++;
      } catch {
        event.attempts = (event.attempts || 0) + 1;
        event.retryAt = new Date(Date.now()+Math.min(3600000,30000*2**Math.min(event.attempts,7))).toISOString();
      }
      await client.query(`UPDATE chatbot_sessions SET metadata=jsonb_set(metadata,'{delivery}',$2::jsonb) WHERE session_id=$1`, [row.session_id, JSON.stringify(event)]);
    }
    await client.query('COMMIT');
    return { delivered };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

