# WP-0.3 — removing invented screen data: inventory and first pass

**Status as of 2026-09-25:** the named WP-0.3 implementation passes are in place, and the static gate
reports no operational fabrication findings with an empty allow-list. Another 29 arrays across 26
static catalog/config files are explicitly annotated as local references rather than operational
allow-list debt. The clinical walkthrough and the app-wide TypeScript backlog remain separate
acceptance work.

## The five data states

A screen showing patient, clinical or financial information is always in one of five states. The bug
this work package targets is a screen silently presenting state 5 as if it were state 1.

1. **Live** — real data from a real API call that succeeded, shown as what it is.
2. **Loading** — nothing to show yet because the real call is in flight; a spinner/skeleton, not a guess.
3. **Empty** — the real call succeeded and there is genuinely nothing yet (no admitted patients, no
   claims this month); an honest empty state, not a placeholder list standing in for "no data."
4. **Error / unavailable** — the real call failed; a visible error, not silence, and never a fabricated
   substitute presented as if it were live.
5. **Invented** — a hardcoded array, a `Math.random()` generator, or a locally-fabricated object built
   after a swallowed API failure, shown with nothing to distinguish it from state 1. This is the bug.

State 5 is not always wrong to reach for — a genuinely demo/simulated mode (see "Already-labeled
demo mode" below) is fine *as long as the UI honestly says so*. The problem is exclusively when state
5 is presented indistinguishably from state 1.

## Fixed this pass: the hospital practice module's swallowed-write anti-pattern

Nine screens under `client/src/pages/hospital/` shared one copy-pasted bug shape:

```ts
try {
  await api.post('/hospital/practice/...', data, { headers: hospitalHeaders() });
} catch {
  // Allow local persistence if API is unavailable
}
const created = { id: `X-${Date.now()}`, ...fabricated fields... };
setRecords(prev => [created, ...prev]);   // saved to localStorage, not the database
toast({ title: "Saved" });                 // shown unconditionally — even if the write above failed
```

A failed write (server error, validation rejection, or — as found while fixing this — sometimes a
**fake patient id** the screen never resolves against a real patient) was invisible: the user saw
"Saved"/"Ordered"/"Scheduled" either way, and a record that only ever existed in that one browser's
localStorage was indistinguishable from one the database actually has.

Fixed (swallow removed; the real server response's `id`/`created_at` used when the write succeeds;
a real error surfaced when it doesn't):

- `HospitalDischargeSummary.tsx` — `handleSaveDraft`, `handleSubmitForApproval`. Also now **requires**
  an attending doctor name instead of silently writing the literal string `'On Call'` into a discharge
  record — a discharge summary claiming a fictional doctor is a documentation-integrity problem, not
  just a UI nit.
- `HospitalPracticeManagement.tsx` — `handleScheduleAppointment`. (`doctorName: doctor?.name || 'On
  Call'` was left as-is here deliberately: scheduling to an on-call pool before a specific doctor is
  assigned is a legitimate real workflow, unlike claiming a named doctor already rendered care.)
- `HospitalLabOrder.tsx`, `HospitalImagingOrder.tsx` — order submission. Both also select from a
  **fabricated patient list** (`// Sample patients data` — four hardcoded names, not a real patient
  search) — now labeled honestly in the code; an order placed against one of these ids will likely
  now visibly fail against the real API instead of silently "succeeding" locally, which is the correct
  outcome even though it means the screen needs a real patient search before it's actually usable.
- `HospitalProcedureAdder.tsx` — `handleScheduleProcedure`.
- `HospitalMRD.tsx` — `handleSaveToQueue` (digitization queue). `handleCreateRecord` (new record index
  entry) has **no backend call at all** — flagged in-code and below; it needs a real endpoint before it
  can be called fixed, not just relabeled. Now also requires an attending doctor name.
- `HospitalIPSheets.tsx` — `handleSaveSheet`.
- `HospitalInsuranceBilling.tsx` — `handleSaveClaim`. This one is money: a claim's approved amount and
  status previously got shown as "updated" from a locally-fabricated object even when the PATCH failed.
- `HospitalEHR.tsx` — two sites: completing an encounter (now requires a doctor name instead of
  defaulting to `'On Call'`), and saving a procedure record (now requires a "performed by" name, and
  the server-side workflow trigger's failure is now reported honestly instead of being swallowed
  behind an unconditional "Procedure Added" toast — the local chart entry still saves either way, since
  that part was never actually failing, but the user now knows if the server-side sync didn't).

Verification for the UI-logic changes used the production build and static fabrication gate; there is
no new targeted test for this pass. The app-wide `npx tsc --noEmit` still has a pre-existing advisory
backlog, while the two documented client JSX blockers were fixed separately.

## Already-labeled demo mode: not a violation, checked and left alone

`client/src/pages/doctor/RemoteHealthMonitoring.tsx` looked like a severe case on a first grep — 60+
`Math.random()` calls generating vitals, ventilator settings, ICU bed states, ambulance ETAs — but on
inspection it already does this correctly: "Remote" mode calls the real
`/doctors/health-monitoring/patients` endpoint and real Socket.IO vitals alerts, while "ICU" and "ER"
modes are explicitly simulated and carry a visible amber "Demo" badge in the header, distinct from the
teal "Live" badge remote mode shows. Left as-is. One wording nit: the ICU mode subtitle still reads
"Real-time ICU monitoring" next to that Demo badge, which is mildly contradictory — worth a one-line
fix, not logged as a separate item.

## Not yet triaged: the rest of the client

Two broad greps size what's left (run from `client/src`):

```bash
# The exact swallowed-write phrase this pass fixed everywhere it appeared:
grep -rl "Allow local persistence if API is unavailable" pages    # 0 remaining (all fixed)

# The same *shape* of bug (a bare `catch {` with no re-throw, or a comment admitting a local/offline
# fallback), which is a superset including many legitimate catches that don't fabricate a success:
grep -rliE "catch \{\s*$|// (allow|fallback|ignore).*(local|offline|unavailable)" pages | wc -l
# → 98 files outside pages/hospital/
```

That second number is **not** "98 more bugs" — it is a heuristic, like the one
`server/scripts/ci/check-tenant-isolation-statics.mjs` uses for tenant isolation, and needs the same
file-by-file human read this pass gave the hospital module before any fix is applied. A sample of
what it surfaces, worth prioritizing first because of what the screen is for: `pages/ward/AdmitPatientForm.tsx`,
`pages/doctor/DoctorPrescriptions.tsx`, `pages/doctor/DoctorTriage.tsx`, `pages/doctor/DoctorVoiceScribe.tsx`,
`pages/Emergency.tsx`, `pages/corporate/CorporateClaims.tsx` (money, like `HospitalInsuranceBilling.tsx` was).
Marketing/corporate/gamification pages in the same list (`CorporateGamification.tsx`, `CorporateHelp.tsx`,
`CorporateSupport.tsx`) are lower priority — invented data there is a UX quality issue, not a clinical
or financial integrity one.

A separate, not-yet-run grep worth doing next: the `Math.random()` / hardcoded-array patterns that sized
the *first* look at this work package (25 files with `Math.random()`, 36 with a `mock`/`dummy`/`sample`/
`fake` array, both `pages`-wide) — each needs the same "is this an honestly-labeled demo, or invented data
presented as real" read `RemoteHealthMonitoring.tsx` got above before deciding whether it's a violation.

## Backend gaps this pass surfaced (not fixed — out of scope for a client-only pass)

- No `GET` endpoint lists discharge summaries (`server/routes/hospital/practice.route.js` only has
  `POST`/`PUT`), and `discharge_summaries` has no `attending_doctor` column. The client now starts with
  an honest empty list and an empty admitted-patient selector; a migration, admitted-patient lookup,
  and GET route are still required before the screen can show real records.
- No endpoint at all backs `HospitalMRD.tsx`'s "new record" creation — it is local-storage-only, full
  stop. Needs a real `POST /api/hospital/mrd/records` (or similar) before that screen's index can be
  trusted as the department's actual record of what's in the archive.
- `HospitalLabOrder.tsx` / `HospitalImagingOrder.tsx` select from a hardcoded four-patient list, not a
  real patient search — orders placed against those ids will now visibly fail (see above) until a real
  patient lookup is wired in.

## How to continue this

1. Run the second grep above, read each hit the way this pass read the hospital module (open the file,
   find the actual write path, decide: legitimate catch / needs a real endpoint / needs the swallow
   removed / already-labeled demo).
2. Prioritize by what the record is for: clinical documentation and money first (matches
   `CODEOWNERS`' own priority list — auth/RLS, clinical safety, money), cosmetic/marketing screens last.
3. For a screen where the *fix* is "make the swallow honest," the pattern here is directly reusable —
   remove the inner `try { } catch { /* silent */ }`, use the real response's fields instead of a
   `` `X-${Date.now()}` `` id, and let the outer catch (which every one of these files already had)
   report the real failure.
4. For a screen where there's genuinely no backend behind it yet, the right fix is usually a new,
   small, additive endpoint (matching the existing `verifyHospitalToken` + `sequelize.query(...
   RETURNING *)` shape these files already follow) — not inventing a client-side workaround.
