-- Instant push: fires once per study, as soon as Orthanc considers it
-- "stable" (no new instances for ORTHANC__STABLE_AGE seconds — 10s here),
-- instead of waiting on the orthanc-bridge sidecar's 30s poll cycle.
--
-- OnStableStudy (not OnStoredInstance) deliberately: a single MRI study can
-- have 1000+ instances, and OnStoredInstance fires once per instance as
-- part of the synchronous C-STORE handling — a webhook call per instance
-- would multiply into thousands of blocking HTTP calls per study and could
-- stall the DICOM association under load. One call per study, after the
-- scan has actually finished, is both faster in practice (no 30s wait) and
-- far cheaper. Confirmed firing in ~10s in testing (2026-09-10).
--
-- The orthanc-bridge poll-sync.sh sidecar keeps running as a safety-net
-- fallback — if this call fails (network blip, backend restart), polling
-- still picks the study up on its next cycle. Both paths hit the same
-- idempotent Node-side ingest (ON CONFLICT upserts), so double-firing is
-- harmless.
--
-- WEBHOOK_URL / WEBHOOK_SECRET are hardcoded rather than read from Orthanc's
-- own config: this Orthanc version's Lua sandbox has no Configuration() (or
-- equivalent) global to read orthanc.json / env vars from inside a script —
-- confirmed by testing ("attempt to call a nil value (global
-- 'Configuration')"). Matches this repo's existing convention (the same
-- ORTHANC_WEBHOOK_SECRET value is already committed in plaintext in
-- docker/imaging/.env and server/.env) — update all three together if it's
-- ever rotated, or if MEDICZY_API_URL changes.
local WEBHOOK_URL = 'http://host.docker.internal:8888/api/orthanc/webhook'
local WEBHOOK_SECRET = '0aa266c5d971ef5ee845dc57f979a76a1df79fc9f729c0e8a60e81e31e685f4a'

function OnStableStudy(studyId, tags, metadata)
  local body = '{"Event":"StableStudy","ID":"' .. studyId .. '"}'
  local headers = {}
  headers['Content-Type'] = 'application/json'
  headers['x-orthanc-secret'] = WEBHOOK_SECRET

  local ok, result = pcall(function()
    return HttpPost(WEBHOOK_URL, body, headers)
  end)

  if ok then
    print('[webhook.lua] attempted study push ' .. studyId .. ' -> ' .. WEBHOOK_URL)
  else
    print('[webhook.lua] push FAILED for study ' .. studyId .. ': ' .. tostring(result))
  end
end
