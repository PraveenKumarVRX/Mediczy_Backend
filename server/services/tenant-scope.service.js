/**
 * Tenant isolation factory (WP-0.5, ADR-01) — one implementation shared by supply chain, blood bank, CSSD and dietary.
 *
 * For a set of tables it provides:
 *   organization_id (defaulting to the request's organization) + FORCE row-level security keyed to the per-request
 *   setting app.current_org_id; per-organization unique numbers; a reference guard so a hospital cannot attach records
 *   to another hospital's ids; and a request-bound database handle. A query with NO organization context sees nothing
 *   (fails closed), never everything.
 *
 * config = {
 *   name,                       // label for logs
 *   tables | tablePattern,      // exact table names, or a LIKE pattern (e.g. 'scm\\_%')
 *   noRls,                      // tables that must stay readable without a context (e.g. the login table)
 *   perOrgUnique,               // [[table, column]] global uniques to replace with (organization_id, column)
 *   refStems,                   // { stem: table } so a *_id column named for a scoped table is guarded
 *   orgFn / refsFn / policy,    // object names (defaults suit new modules; supply chain keeps its original names)
 *   extraOrgTables,             // shared tables that only get an organization_id column (no RLS)
 * }
 */
export class TenantScopeError extends Error {
  constructor(message, status = 403, code = 'ORG_REQUIRED') { super(message); this.status = status; this.code = code; }
}

const SET_ORG = `SELECT set_config('app.current_org_id', $1, false)`;

export function createTenantScope(config) {
  const {
    name, tables: fixedTables = null, tablePattern = null, noRls = [], perOrgUnique = [], refStems = {}, extraOrgTables = [],
    orgFn = 'tenant_current_org', refsFn = 'tenant_assert_refs', policy = 'tenant_isolation',
  } = config;
  const NO_RLS = new Set(noRls);

  const listTables = async (db) => {
    if (fixedTables) {
      const { rows } = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY 1`, [fixedTables]);
      return rows.map((r) => r.tablename);
    }
    const { rows } = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE $1 ORDER BY 1`, [tablePattern]);
    return rows.map((r) => r.tablename);
  };

  /** True when every scoped table (except the exempt ones) has the column and forced policy. Missing tables count as not applied only if they exist. */
  async function applied(db) {
    const tables = (await listTables(db)).filter((t) => !NO_RLS.has(t));
    if (!tables.length) return true;
    const fn = (await db.query(`SELECT count(*) AS n FROM pg_proc WHERE proname = $1`, [orgFn])).rows[0].n;
    if (Number(fn) === 0) return false;
    const { rows } = await db.query(`
      SELECT count(*) FILTER (WHERE NOT (c.relrowsecurity AND c.relforcerowsecurity)) AS unprotected,
             count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_name = c.relname AND k.column_name = 'organization_id')) AS no_column
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`, [tables]);
    return Number(rows[0].unprotected) === 0 && Number(rows[0].no_column) === 0;
  }

  /** Idempotent; one transaction with a short lock timeout so it cannot stall live traffic. */
  async function apply(pool, log = () => {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout = '8s'`);
      // Shared helper functions are created once and never replaced: several modules use them, and replacing needs ownership.
      const fnExists = async (fn) => (await client.query(`SELECT 1 FROM pg_proc WHERE proname = $1`, [fn])).rowCount > 0;
      if (!(await fnExists(orgFn))) {
        await client.query(`CREATE FUNCTION ${orgFn}() RETURNS integer LANGUAGE sql STABLE AS
          $$ SELECT NULLIF(current_setting('app.current_org_id', true), '')::integer $$`);
      }
      const tables = await listTables(client);

      for (const t of tables) {
        await client.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS organization_id INTEGER`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_${t}_org ON ${t} (organization_id)`);
        if (!NO_RLS.has(t)) await client.query(`ALTER TABLE ${t} ALTER COLUMN organization_id SET DEFAULT ${orgFn}()`);
      }

      for (const [t, col] of perOrgUnique) {
        if (!tables.includes(t)) continue;
        const cons = (await client.query(`
          SELECT con.conname FROM pg_constraint con
          WHERE con.conrelid = $1::regclass AND con.contype = 'u' AND array_length(con.conkey, 1) = 1
            AND (SELECT attname FROM pg_attribute WHERE attrelid = con.conrelid AND attnum = con.conkey[1]) = $2`, [t, col])).rows;
        for (const c of cons) { await client.query(`ALTER TABLE ${t} DROP CONSTRAINT ${c.conname}`); log(`dropped global unique ${t}.${c.conname}`); }
        const idx = (await client.query(`SELECT indexname FROM pg_indexes WHERE tablename = $1 AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE $2 AND indexdef NOT LIKE '%organization_id%'`, [t, `%(${col})%`])).rows;
        for (const i of idx) await client.query(`DROP INDEX IF EXISTS ${i.indexname}`);
        const hasComposite = (await client.query(`SELECT 1 FROM pg_indexes WHERE tablename = $1 AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE $2`, [t, `%(organization_id, ${col})%`])).rowCount > 0;
        if (!hasComposite) await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_${t}_org_${col} ON ${t} (organization_id, ${col})`);
      }

      // Foreign keys are checked WITHOUT row-level security, so a hospital could attach a record to another hospital's
      // id (and learn that it exists). This trigger requires each referenced row to be visible under the same policy.
      if (!(await fnExists(refsFn))) await client.query(`CREATE FUNCTION ${refsFn}() RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE i integer := 0; col text; ref text; val text; ok boolean;
        BEGIN
          WHILE i < TG_NARGS LOOP
            col := split_part(TG_ARGV[i], ':', 1); ref := split_part(TG_ARGV[i], ':', 2);
            EXECUTE format('SELECT ($1).%I::text', col) INTO val USING NEW;
            IF val IS NOT NULL THEN
              EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id::text = $1)', ref) INTO ok USING val;
              IF NOT ok THEN
                RAISE EXCEPTION 'Referenced % % is not available to this hospital', ref, val USING ERRCODE = '23503';
              END IF;
            END IF;
            i := i + 1;
          END LOOP;
          RETURN NEW;
        END $fn$`);
      const fks = (await client.query(`
        SELECT con.conrelid::regclass::text AS tbl, a.attname AS col, con.confrelid::regclass::text AS ref
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = con.confkey[1]
        WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1 AND ra.attname = 'id' AND con.conrelid::regclass::text = ANY($1::text[])`, [tables])).rows;
      const byTable = new Map();
      const addRef = (tbl, col, ref) => {
        if (NO_RLS.has(tbl) || NO_RLS.has(ref) || tbl === ref || !tables.includes(ref)) return;
        const list = byTable.get(tbl) || [];
        if (!list.some((x) => x.startsWith(`${col}:`))) byTable.set(tbl, [...list, `${col}:${ref}`]);
      };
      for (const f of fks) addRef(f.tbl, f.col, f.ref);
      const cols = (await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) AND column_name LIKE '%\\_id' AND column_name <> 'organization_id'`, [tables])).rows;
      for (const c of cols) { const target = refStems[c.column_name.replace(/_id$/, '')]; if (target) addRef(c.table_name, c.column_name, target); }
      for (const [tbl, refs] of byTable) {
        await client.query(`DROP TRIGGER IF EXISTS ${refsFn}_trg ON ${tbl}`);
        await client.query(`CREATE TRIGGER ${refsFn}_trg BEFORE INSERT OR UPDATE ON ${tbl} FOR EACH ROW EXECUTE FUNCTION ${refsFn}(${refs.map((r) => `'${r}'`).join(', ')})`);
      }

      // Count rows with no owner BEFORE the policy hides them (afterwards even the table owner cannot see them).
      const orphans = {};
      for (const t of tables.filter((x) => !NO_RLS.has(x))) {
        const n = Number((await client.query(`SELECT count(*) AS n FROM ${t} WHERE organization_id IS NULL`)).rows[0].n);
        if (n) orphans[t] = n;
      }
      for (const t of tables.filter((x) => !NO_RLS.has(x))) {
        await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
        await client.query(`DROP POLICY IF EXISTS ${policy} ON ${t}`);
        await client.query(`CREATE POLICY ${policy} ON ${t} USING (organization_id = ${orgFn}()) WITH CHECK (organization_id = ${orgFn}())`);
      }
      for (const t of extraOrgTables) {
        if ((await client.query(`SELECT to_regclass($1) AS r`, [`public.${t}`])).rows[0].r) {
          await client.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS organization_id INTEGER`);
          await client.query(`CREATE INDEX IF NOT EXISTS idx_${t}_org ON ${t} (organization_id)`);
        }
      }
      await client.query('COMMIT');
      return { tables: tables.length, orphans };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  let ensured = null;
  /** Once per process: verify (and if needed apply). Fails closed — never serves an unprotected table. */
  function ensure(pool) {
    if (!ensured) {
      ensured = (async () => {
        if (await applied(pool)) return true;
        await apply(pool, (m) => console.log(`[${name} tenant]`, m));
        if (!(await applied(pool))) throw new Error(`${name} tenant isolation could not be applied`);
        return true;
      })().catch((e) => { ensured = null; throw e; });
    }
    return ensured;
  }

  /** A handle bound to one organization for a request: one pooled connection with app.current_org_id set, cleared on release(). */
  function scopedDb(pool, organizationId) {
    const orgId = Number(organizationId);
    if (!Number.isInteger(orgId) || orgId <= 0) throw new TenantScopeError('This login is not attached to a hospital. Sign in again, or ask an administrator to attach the account.');
    let client = null;
    const acquire = async () => {
      if (!client) { const c = await pool.connect(); try { await c.query(SET_ORG, [String(orgId)]); } catch (e) { c.release(true); throw e; } client = c; }
      return client;
    };
    const giveBack = async (c) => { try { await c.query(SET_ORG, ['']); c.release(); } catch { c.release(true); } };
    return {
      orgId,
      raw: pool,
      query: async (...args) => (await acquire()).query(...args),
      connect: async () => {
        const c = await pool.connect();
        try { await c.query(SET_ORG, [String(orgId)]); } catch (e) { c.release(true); throw e; }
        const origRelease = c.release.bind(c);
        c.release = async (err) => { if (err) return origRelease(err); try { await c.query(SET_ORG, ['']); origRelease(); } catch { origRelease(true); } };
        return c;
      },
      release: async () => { if (client) { const c = client; client = null; await giveBack(c); } },
    };
  }

  return { config, applied, apply, ensure, scopedDb, listTables };
}

/** Shared by the department routes: an ensureTables(req, res) that returns a hospital-bound handle and releases it when the response ends. */
export function orgFromToken(user) {
  const org = Number(user?.organization_id);
  return Number.isInteger(org) && org > 0 ? org : null;
}
export const orgRequiredResponse = { success: false, code: 'ORG_REQUIRED', message: 'This login is not attached to a hospital. Sign in again, or ask an administrator to attach the account.' };
