// Checks for migrations/20261005000300-rls-guard-current-setting-cast.sql
export async function behaviour({ q, ok, bad, expectError }) {
  const see = async (table, settings) => {
    await q('SAVEPOINT see');
    for (const [k, v] of Object.entries(settings)) await q('SELECT set_config($1, $2, true)', [k, v]);
    try { return Number((await q(`SELECT count(*) n FROM ${table}`)).rows[0].n); }
    finally { await q('ROLLBACK TO SAVEPOINT see'); }
  };
  // The policy predicate, evaluated INDEPENDENTLY of the policy under test. The reference query itself reads
  // an RLS-protected table, so it must run with the permissive (empty) context, or the policy would filter
  // the reference too and it would not be independent at all.
  const expectedCorp = async (t) => {
    await q('SAVEPOINT ref');
    await q("SELECT set_config('app.current_tenant', '', true)");
    try {
      return Number((await q(
        `SELECT count(*) n FROM corporates WHERE owned_by_tenant_id IS NULL
            OR owned_by_tenant_id = ANY (get_tenant_scope($1::int)) OR tenant_id = ANY (get_tenant_scope($1::int))`, [t])).rows[0].n);
    } finally { await q('ROLLBACK TO SAVEPOINT ref'); }
  };
  const total = Number((await q('SELECT count(*) n FROM corporates')).rows[0].n);

  console.log('  the reported failure:');
  // A defined-but-empty setting is exactly what a pooled connection holds after an API-key request.
  // (ROLLBACK TO, not RELEASE: RELEASE would keep the setting for the rest of the transaction.)
  await q('SAVEPOINT define'); await q("SELECT set_config('app.current_tenant', '5', true)"); await q('ROLLBACK TO SAVEPOINT define');
  const empty = await see('corporates', { 'app.current_tenant': '' });
  empty === total ? ok("an EMPTY app.current_tenant no longer raises 22P02; corporates is readable", `${empty} rows`) : bad('empty setting', `${empty} vs ${total}`);

  console.log('\n  behaviour is unchanged (compared with the policy predicate evaluated independently):');
  const unset = await see('corporates', {});
  unset === total ? ok('no context: every row, as before (the policy is deliberately still permissive here)', `${unset} rows`) : bad('unset', unset);
  for (const t of [58, 12, 7, 999999]) {
    const got = await see('corporates', { 'app.current_tenant': String(t) });
    const want = await expectedCorp(t);
    got === want ? ok(`tenant context ${t}: ${got} row(s), identical to the independently computed predicate`) : bad(`tenant ${t}`, `${got} vs ${want}`);
  }
  const labNone = await see('api_lab_bookings', {});
  const labBogus = await see('api_lab_bookings', { 'app.current_tenant': '999999' });
  labNone === 4 && labBogus === 0 ? ok('api_lab_bookings: no context sees 4 rows, a bogus tenant sees 0 (unchanged)') : bad('lab bookings', `${labNone}/${labBogus}`);

  await expectError('a non-numeric context is still an error (garbage is not silently allowed)', '22P02',
    () => q(`SELECT set_config('app.current_tenant', 'abc', true)`).then(() => q('SELECT count(*) FROM corporates')));
}

export async function state({ q, ok, bad }) {
  const pols = (await q("SELECT count(*) n FROM pg_policies WHERE schemaname='public'")).rows[0].n;
  Number(pols) === 100 ? ok('still 100 policies') : bad('policy count', pols);
  const unguarded = (await q(`SELECT count(*) n FROM pg_policies WHERE schemaname='public'
     AND (qual ~ '\\(current_setting\\(''app\\.[a-z_]+''::text, true\\)\\)::(integer|bigint)' OR with_check ~ '\\(current_setting\\(''app\\.[a-z_]+''::text, true\\)\\)::(integer|bigint)')`)).rows[0].n;
  Number(unguarded) === 0 ? ok('no policy casts an unguarded current_setting() to integer any more') : bad('unguarded casts remain', unguarded);
  const failopen = (await q(`SELECT count(*) n FROM pg_policies WHERE schemaname='public' AND qual ~ 'current_setting\\(''app\\.[a-z_.]+''::text, true\\) IS NULL'`)).rows[0].n;
  Number(failopen) === 8 ? ok('exactly the same 8 fail-open policies as before: nothing was made stricter or looser') : bad('fail-open set changed', failopen);
  const roles = (await q(`SELECT count(*) n FROM pg_policies WHERE schemaname='public' AND policyname IN ('corporate_rls_select','corporate_rls_write') AND cmd IN ('SELECT','ALL')`)).rows[0].n;
  Number(roles) === 2 ? ok('the corporates select/write policies are intact') : bad('corporates policies', roles);
}
