/** Owned bounded history on the existing table, with atomic append and expiry. */
export function createDurableChatSessions(database, ttl = 3600) {
  const invalid = () => Object.assign(new Error('Invalid or expired conversation'), { statusCode: 403 });
  const valid = id => /^chat_[a-f0-9]{32}$/.test(id || '');
  const check = result => { if (!result.rowCount) throw invalid(); return result.rows[0]; };
  return {
    async resolve(requested, owner) {
      if (!requested || /^dr_isha_[a-zA-Z0-9_]{1,100}$/.test(requested)) {
        const { randomBytes } = await import('node:crypto');
        const id = `chat_${randomBytes(16).toString('hex')}`;
        await database.query(`INSERT INTO chatbot_sessions(session_id,owner_scope,expires_at)
          VALUES($1,$2,NOW()+$3*INTERVAL '1 second')`, [id, owner, ttl]);
        return id;
      }
      if (!valid(requested)) throw invalid();
      check(await database.query(`SELECT session_id FROM chatbot_sessions WHERE session_id=$1 AND owner_scope=$2 AND active AND expires_at>NOW()`, [requested, owner]));
      return requested;
    },
    async load(id, owner) {
      if (!valid(id)) throw invalid();
      const row = check(await database.query(`SELECT messages FROM chatbot_sessions
        WHERE session_id=$1 AND owner_scope=$2 AND active AND expires_at>NOW()`, [id, owner]));
      return row.messages;
    },
    async append(id, owner, turns) {
      if (!valid(id)) throw invalid();
      const bounded = turns.map(turn => ({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content).slice(0,4000) }));
      check(await database.query(`UPDATE chatbot_sessions s SET
        messages=(SELECT COALESCE(jsonb_agg(item ORDER BY ordinal),'[]'::jsonb) FROM
          (SELECT item,ordinal FROM jsonb_array_elements(s.messages || $3::jsonb) WITH ORDINALITY AS t(item,ordinal) ORDER BY ordinal DESC LIMIT 30) b),
        message_count=LEAST(30,jsonb_array_length(s.messages)+jsonb_array_length($3::jsonb)), revision=revision+1, expires_at=NOW()+$4*INTERVAL '1 second', updated_at=NOW(),last_interaction_at=NOW()
        WHERE session_id=$1 AND owner_scope=$2 AND active AND expires_at>NOW() RETURNING session_id`, [id, owner, JSON.stringify(bounded), ttl]));
    },
    async clear(id, owner) {
      if (!valid(id)) throw invalid();
      check(await database.query(`UPDATE chatbot_sessions SET messages='[]',context_snapshot='{}',metadata=metadata-'action'-'feedback',message_count=0,active=FALSE,expires_at=NOW(),revision=revision+1,updated_at=NOW()
        WHERE session_id=$1 AND (owner_scope=$2 OR owner_scope='personal:'||$2 OR left(owner_scope,length('personal:'||$2||':subject:'))='personal:'||$2||':subject:') RETURNING session_id`, [id, owner]));
    },
    async purgeExpired() {
      return database.query(`UPDATE chatbot_sessions SET messages='[]',context_snapshot='{}',metadata=metadata-'action'-'feedback',active=FALSE,updated_at=NOW()
        WHERE owner_scope IS NOT NULL AND expires_at<=NOW() AND (active OR messages<>'[]'::jsonb)`);
    },
  };
}
