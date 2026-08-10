-- One-time data cleanup: deactivate user_associations rows pointing to a
-- corporate_id that no longer exists in the corporates table. Found via a
-- live bug report where "which corporate does this employee belong to"
-- resolution (no JOIN back to corporates, no deterministic ORDER BY)
-- silently picked an association pointing at a hard-deleted corporate
-- instead of the employee's real, current one. Affected 765 users in
-- production, all sharing the same pattern: one real association + one
-- dangling reference to a single already-deleted corporate_id.
--
-- Safe to re-run: only touches rows whose entityId has no matching row in
-- corporates at all (a corporate that's merely soft-deleted, i.e.
-- status='Inactive', is left alone -- the application-level fix for that
-- case is the LOWER(c.status)='active' JOIN condition added at every
-- resolution call site, not a data change).
UPDATE user_associations ua
SET status = 'inactive',
    metadata = COALESCE(ua.metadata, '{}'::jsonb) || jsonb_build_object(
      'deactivatedReason', 'dangling reference to deleted corporate (entityId had no matching corporates row)',
      'deactivatedAt', NOW()::text
    ),
    "updatedAt" = NOW()
FROM (
  SELECT ua2.id
  FROM user_associations ua2
  LEFT JOIN corporates c ON c.id = ua2."entityId"
  WHERE ua2."entityType" = 'corporate' AND ua2.status = 'active' AND c.id IS NULL
) dangling
WHERE ua.id = dangling.id;
