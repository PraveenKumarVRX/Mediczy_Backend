-- =============================================================================
-- reissue_entity_uid must carry every REFERENCING column along.   (2026-10-05)
--
-- A uid can now be referenced from many places: the 132 uid twins, users.organization_uid, and anything
-- added later. reissue_entity_uid() retired the old uid and wrote the new one into the entity's own
-- row, but left every referencing column pointing at the RETIRED uid. That still resolves through
-- entity_uid_aliases, but it is stale and the verifier's "agrees with its integer" check could not hold.
--
-- The referencing columns are discovered from the foreign keys into entity_registry(uid), so a column
-- added tomorrow is covered without anyone remembering to list it. entity_uid_aliases is excluded: it
-- is flattened separately.
-- =============================================================================
CREATE OR REPLACE FUNCTION reissue_entity_uid(p_table text, p_id bigint, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_rule record;
  v_old  text;
  v_kind text;
  v_new  text;
  v_ref  record;
BEGIN
  SELECT * INTO v_rule FROM entity_uid_rules WHERE table_name = p_table;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reissue_entity_uid: table "%" is not under the entity uid rule', p_table;
  END IF;

  EXECUTE format('SELECT %I FROM %I WHERE id = $1', v_rule.column_name, p_table) INTO v_old USING p_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'reissue_entity_uid: %.id=% not found or has no uid', p_table, p_id;
  END IF;

  SELECT kind INTO v_kind FROM entity_registry WHERE uid = v_old AND retired_at IS NULL;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'reissue_entity_uid: % is not an active uid', v_old;
  END IF;

  v_new := generate_entity_uid(v_kind);

  UPDATE entity_registry SET retired_at = now(), legacy = true WHERE uid = v_old AND retired_at IS NULL;
  PERFORM set_config('app.entity_uid_reissue', 'on', true);
  EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', p_table, v_rule.column_name) USING v_new, p_id;
  PERFORM set_config('app.entity_uid_reissue', 'off', true);

  -- Every column that references this uid follows it. Found from the foreign keys, never from a list.
  FOR v_ref IN
    SELECT k.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint k
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
     WHERE k.contype = 'f' AND k.confrelid = 'entity_registry'::regclass
       AND array_length(k.conkey, 1) = 1
       AND k.conrelid <> 'entity_uid_aliases'::regclass
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_ref.tbl, v_ref.col, v_ref.col) USING v_new, v_old;
  END LOOP;

  UPDATE entity_uid_aliases SET uid = v_new WHERE uid = v_old;
  INSERT INTO entity_uid_aliases (old_uid, uid, reason) VALUES (v_old, v_new, p_reason);
  RETURN v_new;
END
$fn$;
