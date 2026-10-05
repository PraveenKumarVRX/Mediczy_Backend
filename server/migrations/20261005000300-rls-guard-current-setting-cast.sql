-- =============================================================================
-- RLS: stop an empty app.current_tenant from raising 22P02.   (2026-10-05)
--
-- Eight policies (api_appointments, api_lab_bookings, api_prescriptions, corporates; select and write)
-- cast current_setting('app.current_tenant', true) straight to integer. After ANY transaction that did
-- set_config('app.current_tenant', ..., true) -- middleware/api-auth.js:393, the aggregator API-key
-- path -- the pooled connection keeps the setting DEFINED BUT EMPTY ('', not NULL), and from then on every
-- query touching those tables on that connection fails with
--   ERROR 22P02: invalid input syntax for type integer: ""
-- The policy's own first clause already treats '' as "no context, allow", but Postgres folds the stable
-- cast at executor start, so the error is raised before that clause can short-circuit it. Reproduced on
-- production: the first API-key request would poison a pooled connection and the corporate portal would
-- intermittently 500 until it was recycled. (No occurrence in the retained logs yet.)
--
-- The fix is semantics-preserving: NULLIF(setting, '') turns the empty string into NULL, exactly how
-- the first clause already reads it. It deliberately does NOT make any policy fail-closed: the portal sets
-- no context, so a fail-closed corporates policy would break corporate sign-in. Making the context universal
-- is a separate piece of work (see docs/architecture/ENTITY_UID_RULE.md).
--
-- Idempotent: an already-guarded expression is left alone.
-- =============================================================================
DO $$
DECLARE
  r       record;
  v_using text;
  v_check text;
  v_n     int := 0;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    v_using := regexp_replace(r.qual,
      '\(current_setting\(''(app\.[a-z_]+)''::text, true\)\)::(integer|bigint)',
      '(NULLIF(current_setting(''\1''::text, true), ''''::text))::\2', 'g');
    v_check := CASE WHEN r.with_check IS NULL THEN NULL ELSE regexp_replace(r.with_check,
      '\(current_setting\(''(app\.[a-z_]+)''::text, true\)\)::(integer|bigint)',
      '(NULLIF(current_setting(''\1''::text, true), ''''::text))::\2', 'g') END;

    IF v_using IS DISTINCT FROM r.qual OR v_check IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)%s', r.policyname, r.schemaname, r.tablename, v_using,
                     CASE WHEN v_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', v_check) END);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'rls cast guard: % policy(ies) updated', v_n;
END
$$;
