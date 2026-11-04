# Sponsored Annual Health Checkup (AHC) — Booking Flow Audit, Gaps & Fixes

**Date:** 2026-11-04
**Author:** CTO / UX / market review pass
**Scope:** The corporate-sponsored AHC booking journey — login as a corporate employee →
Benefits → "Book now" on the Annual Health Checkup → eligibility/beneficiary → approved
diagnostic centre → date/slot → confirm & submit → ₹0 sponsored confirmation →
view / reschedule / cancel + notifications.

**Primary source of truth:** `server/routes/health-checkup.route.js` (all member-facing AHC
endpoints), `server/services/health-package-policy.js` (relations/eligibility),
`server/services/health-checkup-venues.js` (venue resolution). Prod verified against
`mediczy_prod`.

---

## 1. How the flow works today (verified)

| Step | Endpoint / logic | Status |
|---|---|---|
| 1. Login (corporate employee) | `authUser` + `router.use` role guard (`user`/`patient`/`employee`; admin/team rejected) | ✅ |
| 2. Benefits → packages | `GET /api/health-checkups/packages` — corporate members see only `is_active` + `isAnnualCorporatePackage` catalog entries they hold an active, unused, in-window `user_health_packages` entitlement for | ✅ |
| 3. Package detail | `GET /api/health-checkups/packages/:packageId` → `resolvePackage()` | ✅ |
| 4. Eligibility + beneficiary | `resolvePackage()` checks `corporate_health_package_catalog.is_active`, `isAnnualCorporatePackage`, and a live `user_health_packages` row (`status=active`, `usedAt IS NULL`, inside `validFrom/validTo`) **under `FOR UPDATE`**; relation validated against `BENEFICIARY_RELATIONS` + `eligibleRelations` | ⚠️ **G1** |
| 5. Approved diagnostic centre | `GET /api/health-checkups/labs` + `labFor()` join `corporate_network_assignments` and per-package `health_package_venues` overrides. Prod: Equitas (corp 5) has **180** network assignments | ✅ |
| 6. Date / slot | `GET /api/health-checkups/slots` — rejects past dates (`past()`), marks already-taken slots unavailable | ✅ |
| 7. Submit / confirm | `POST /api/health-checkups/bookings` — re-validates package, relation, lab scope, slot; `FOR UPDATE` on the slot + unique constraints `uniq_health_checkup_active_lab_slot` / `_hospital_slot` → no double-book under race | ✅ |
| 8. ₹0 sponsored confirmation | `amount = r.c ? 0 : price`; `status = amount>0 ? 'payment_pending' : 'confirmed'`; `payment_status='not_required'`. **Server-authoritative** — the client cannot forge a free booking, Razorpay is never touched for sponsored bookings | ✅ |
| 9a. View | `GET /api/health-checkups/bookings` (list) | ✅ |
| 9b. Reschedule | `POST /api/health-checkups/bookings/:id/reschedule` — re-validates catalog/relation/slot, notifies | ✅ |
| 9c. Cancel | `POST /api/health-checkups/bookings/:id/cancel` — status update only | ⚠️ **G2** |
| 9d. Notifications | `notifyConfirmedBooking()` — email + WhatsApp (if configured) to the **beneficiary's** details | ⚠️ **G2/G3/G4** |

The core transaction design is sound: entitlement is locked, the ₹0 path is enforced on the
server, slot concurrency is protected by both row locks and DB unique constraints, and the
corporate network scoping is real (not the empty legacy `corporate_benefit_network_providers`
table — that is unused by this flow).

---

## 2. Gap register

### 🔴 G1 — Family/beneficiary booking is silently blocked (correctness bug)

**Evidence.** The duplicate-booking guard in `resolvePackage()` keys only on member + package:

```sql
SELECT id FROM health_checkup_bookings
WHERE user_id=:userId AND package_id=:packageId
  AND status NOT IN ('cancelled','completed') LIMIT 1
```

**Impact.** The rest of the design (the `relation` input, `BENEFICIARY_RELATIONS`,
`eligibleRelations`, the `relation_not_eligible` code, per-relation venue scoping
`v.relation=:relation`) all assume **multiple beneficiaries per package**. But once an
employee books for **self**, booking the *same sponsored package for a spouse / parent / child*
returns `409 already_booked`. For any family AHC the employee can book **exactly one** person,
ever — defeating the purpose of a family-coverage corporate benefit.

**Fix.** Make the guard relation-aware: add `COALESCE(beneficiary_relation,'self')=:relation`
to the duplicate check and thread the `relation` argument through `resolvePackage()`. The slot
dimension is already isolated by the unique constraints, so loosening the per-package guard to
per-package-per-relation is safe. One booking per (member, package, relation) still holds — so
a member still can't double-book the same beneficiary.

### 🟠 G2 — Cancellation is silent (no notification)

**Evidence.** `POST /bookings/:id/cancel` only runs the status `UPDATE`; it calls no notifier.
Confirm and reschedule both call `notifyConfirmedBooking()`.

**Impact.** The member gets no cancellation confirmation; the diagnostic centre is never told
the slot is freed (beyond the DB row). Step 9 promises notifications across all state changes.

**Fix.** Fire a `cancelled`-kind notification after a successful cancel.

### 🟡 G3 — The booking employee isn't notified for beneficiary bookings

**Evidence.** `notifyConfirmedBooking()` sends only to `patient.email` / `patient.phone` — the
**beneficiary's** contact details.

**Impact.** Book for a parent with no email/phone on the beneficiary record → nobody is
notified, and the employee who made the booking is never told it succeeded.

**Fix.** When the beneficiary relation is not `self`, also notify the booking employee
(looked up from the `users` row by `user_id`), in addition to the beneficiary.

### 🟡 G4 — No SMS fallback, no appointment reminder

**Evidence.** Confirmation = email + WhatsApp-*if-configured* only. There is no plain-SMS
fallback and no pre-appointment reminder job. (WhatsApp is gated on Gupshup template
registration, which is still pending in prod — so today many members get email only.)

**Impact.** Members without email, or when WhatsApp is unconfigured, get nothing on their
phone. No T-24h reminder → higher no-show rate (every B2B competitor — 1mg, Healthians,
Orange Health, Plum — sends reminders).

**Fix.**
- Add an SMS fallback in the notifier (direct-to-number via `SMSService`, self-guarding).
- Add a daily `health_checkup_reminders` cron that sends a `reminder`-kind notification for
  bookings whose `appointment_date` is tomorrow and whose status is still active.

### 🟢 G5 — No home sample collection (market gap, **deferred — not a bug**)

**Evidence.** The flow is diagnostic-centre-only. Mediqzy already has a deployed phlebotomy
collection module (collectors = entity-UID kind `F`).

**Impact.** Home phlebotomy is table-stakes for every corporate AHC competitor and is the
single highest-ROI feature gap. It is a cross-module integration (slot model, collector
assignment, routing), not a one-file fix.

**Fix (roadmap, not in this change-set).** Add a `fulfilment` dimension to the booking
(`centre` | `home`); when `home`, resolve an eligible collector from the phlebotomy module for
the member's pincode and reuse the collection-visit scheduling instead of a centre slot. Design
to be specced separately before build.

### 🟢 G6 — No self-paid add-on tests (revenue gap, **deferred — not a bug**)

**Evidence.** Payment rails (`/payment`, `/payment/verify`, Razorpay) already exist for
individual (non-sponsored) bookings but are unreachable from the sponsored path (`amount=0`).

**Fix (roadmap).** Allow "sponsored base package + self-paid add-on tests": compute
`amount = sum(addOnPrices)` for a sponsored booking with add-ons, reuse the existing Razorpay
flow for just the add-on amount. Spec separately.

---

## 3. What this change-set implements now

In-scope (bounded bug/UX fixes):

1. **G1** — relation-aware duplicate guard in `resolvePackage()`; `relation` threaded through.
2. **G2** — cancellation notification.
3. **G3** — notify the booking employee for non-self beneficiary bookings.
4. **G4a** — SMS fallback in the notifier.
5. **G4b** — `health_checkup_reminders` daily cron (T-24h reminders).

Supporting refactor: the per-event notification logic moves from a private function in the
route into a shared `server/services/health-checkup-notify.service.js` (`notifyBooking(row, kind)`
where `kind ∈ confirmed | rescheduled | cancelled | reminder`), so the route and the new cron
use the exact same, already-proven dispatch. The route keeps a thin `notifyConfirmedBooking`
wrapper so existing confirm/payment call-sites are untouched.

Deferred (documented as roadmap, require their own spec): **G5** home collection, **G6**
self-paid add-ons.

---

## 4. Verification

1. **G1 regression test:** as a corporate member with a family package — book `self`, then
   book `spouse` under the same package → second booking must succeed (today it 409s). Then a
   second `self` booking must still 409 `already_booked`.
2. **G2:** cancel a confirmed booking → a cancellation notification is attempted (check logs /
   mail outbox), status flips to `cancelled`.
3. **G3:** book for a non-self relation with a beneficiary that has no email → the employee's
   own email/phone still receives the confirmation.
4. **G4a:** with WhatsApp unconfigured and an email present but phone present → SMS attempt is
   made (self-guards to no-op if the SMS provider isn't configured).
5. **G4b:** cron dry-run picks up only tomorrow's active bookings; idempotent per booking per
   day (no duplicate reminders within a run).
6. **No regression:** confirm + reschedule still notify exactly as before; the ₹0 path and slot
   concurrency are unchanged.
