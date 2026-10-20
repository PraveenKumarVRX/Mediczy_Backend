import { tenant } from './policy.js';

// Every operation, including provider callbacks, owns a transaction-local tenant
// scope. Never leave tenant state set on a pooled connection after release.
export function createContactCenterStore(pool) {
  return async (uid, fn) => {
    tenant(uid);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_uid',$1,true)", [uid]);
      const result = await fn(client);
      await client.query('COMMIT'); return result;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
}
