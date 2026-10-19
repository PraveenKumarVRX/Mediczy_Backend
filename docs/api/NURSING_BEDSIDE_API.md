# Nursing bedside API

Updated: 2026-10-19. Implementation: [delivery record](../audits/NURSING_IMPLEMENTATION_DELIVERY_2026-10-19.md).

These endpoints use `/api` as the base path and return `{ "success": true, "data": ... }`. Clinical changes commit before a success response. They require an individual hospital nurse JWT from `POST /api/nurse/login`; hospital supervisor sessions can inspect worklists and configure assignments, but cannot document care as a nurse. Prescribing uses a doctor session, an explicit doctor→HR user mapping and an active verified `prescribe` qualification/privilege.

A nurse must have a current, unrevoked ward assignment. The service verifies the admission, hospital, ward, author and patient relationship on the server. The client must never provide the effective tenant or author. All timestamps are UTC instants; clinical-day aggregation uses the facility timezone (default `Asia/Kolkata`).

## Assignments and policy

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/nursing/context` | Authenticated clinical actor and hospital |
| GET | `/v1/nursing/patients?wardId=10` | Active admissions in authorized wards |
| GET | `/v1/nursing/assignments` | Nurse's assignments; supervisors see the hospital's |
| POST | `/v1/nursing/assignments` | Supervisor: `{nurseId,wardId,shiftName,startsAt,endsAt}`; shift duration ≤24 hours |
| DELETE | `/v1/nursing/assignments/:id` | Supervisor: revoke without deleting history |
| GET | `/v1/nursing/directory` | Supervisor: nurse and ward directory |
| POST | `/v1/nursing/staff-links` | Supervisor: `{role:"doctor",actorId,userId}`; both identities must belong to the hospital |
| GET / PUT | `/v1/nursing/settings` | Supervisor updates `{timezone,barcodeRequired,aiEnabled}`; AI is off by default |

Supervisor UI: `/hospital/nursing/administration`. Nursing UI: `/nurse/ward` or `/nurse/dashboard`. Operational read view: `/hospital/nursing`.

## Retry and concurrency contract

Send `Idempotency-Key: <8–128 characters using letters, digits, underscore, dot, colon or hyphen>` for creating chart entries, assessments, tasks, care goals, wounds, interventions, handovers, PRN slots, infusion events and medication outcomes. Same key and same request replay the committed result; changed data with that key returns 422. Keys are scoped by hospital and operation and hashes include the authenticated actor.

Mutable drafts/tasks/goals/handovers and medication writes carry the current `version`. Medication writes also carry the current `orderVersion`. A stale version or already completed dose returns 409. Completed administrations and signed entries cannot be overwritten. Correct documentation through an appended amendment.

## Documentation, assessment and care plans

| Method | Path | Contract |
|---|---|---|
| POST | `/v1/echart/entry` | `{admissionId,entryType,...fields}`; entry types: `note`, `observation`, `vitals`, `io`, `assessment`, `procedure` |
| GET | `/v1/echart/flowsheet/:admissionId` | Filters: `entryType`, `from`, `to`, bounded `limit` |
| PATCH | `/v1/echart/entries/:id` | Own unsigned note draft: `{version,observationText}` |
| POST | `/v1/echart/entries/:id/sign` | `{version,verificationToken}` |
| POST | `/v1/echart/entries/:id/amendments` | `{reason,...correctedFields}`; references the latest signed version and requires a new signature |
| GET | `/v1/echart/io/:admissionId?days=3` | Intake/output and balance rebuilt from events and signed amendments |
| GET | `/v1/echart/vitals/:admissionId/latest` | Most recent observation |
| GET | `/v1/echart/vitals/:admissionId/trend?hours=24` | Bounded vital history |
| POST / GET | `/v1/nursing/assessment`, `/v1/nursing/assessment/:admissionId` | Admission/shift/risk/discharge-education assessments |
| GET / POST | `/v1/nursing/tasks` | GET: admission/ward/nurse/status/window filters. POST: admission, type, title, priority and optional due time |
| POST | `/v1/nursing/tasks/auto-generate` | `{admissionId}`; stable templates prevent duplicate admission tasks |
| PUT | `/v1/nursing/tasks/:id/complete` | `{version,notes}`; author taken from session |
| GET | `/v1/nursing/admissions/:id/goals` | Nursing goals, linked physician plan and evaluation history |
| POST | `/v1/nursing/goals` | `{admissionId,problem,goal,intervention,dueAt?,carePlanId?}` |
| POST | `/v1/nursing/goals/:id/evaluations` | `{version,status,note}`; status `active`, `met`, `unmet`, `cancelled` |

Note example:

```json
{"admissionId":301,"entryType":"note","observationText":"Patient reviewed; assistance provided and response documented."}
```

Vital fields include `bpSystolic`, `bpDiastolic`, `heartRate`, `spo2`, `respiratoryRate`, `temperature` (°C), `onOxygen`, `consciousness` (`A/C/V/P/U`) and optional `recordedAt`. The shared NEWS2 scorer records completeness; missing readings are not normal readings. Both flowsheet and vital record are committed together.

Fluid fields: `ioType` (`intake`/`output`), `ioVolumeMl`, `ioDescription` and optional `recordedAt`. Backdated observations retain their observation day. Pending amendments do not alter totals until signed.

## Fresh nurse verification

`POST /v1/nursing/verification` takes `{password,purpose,targetId,admissionId,email?,action?}` and returns `{token,expiresIn:180}`. It rechecks the nurse's password, account status and ward assignment. Do not store passwords or verification tokens in browser persistence.

- `purpose:"note.sign"`: only the authenticated author can verify; `targetId` is the note/entry ID.
- `purpose:"emar.cosign"`: `email` and password identify a **different**, assigned nurse; `targetId` is the dose-slot ID. The proof binds the current order revision.
- Default medication action is `administer`; infusion actions are `infusion.start`, `infusion.rate_change`, `infusion.stop` and cannot reuse a proof for another action.

## Medication workflow

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/emar/due?admissionId=301&windowMinutes=240&wardId=10` | Pending scheduled doses; admission/ward filters and overdue status |
| GET | `/v1/emar/orders/:admissionId` | Active authorized orders, including PRN policy |
| GET | `/v1/emar/history/:admissionId` | All terminal dose outcomes, including stopped orders |
| POST | `/v1/emar/validate-administration` | Preflight; returns `blocked`, `reasons`, allergy result and high-alert indicator |
| POST | `/v1/emar/administer` | Record the exact dose slot; order-scoped alias `/:orderId/administer` uses the same implementation |
| POST | `/v1/emar/orders` | Qualified prescriber: create order and scheduled slots transactionally |
| PUT | `/v1/emar/orders/:id/hold`, `/v1/emar/orders/:id/discontinue` | Qualified prescriber changes the order; `{reason}` |
| POST | `/v1/emar/orders/:id/prn-slot` | Nurse: `{indication}`; enforce pending-dose, minimum interval and 24-hour limit |
| POST / GET | `/v1/emar/infusions`, `/v1/emar/infusions/:admissionId` | Append/read infusion start, authorized rate change or stop |
| POST | `/v1/emar/orders/:id/infusion-rate` | Qualified prescriber: `{version,rateMlHr,reason}` |

Due rows include `scheduleId`, `orderId`, `version`, `orderVersion`, `admissionId`, `patientId`, `patientName`, `drugName`, `dose`, `doseUnit`, `route`, `scheduledTime`, `wardId`, `ward`, `status`. Legacy snake-case fields remain on due rows for existing hospital cards. The UI keys by **scheduleId**.

```json
{
  "scheduleId":901,"orderId":76,"version":1,"orderVersion":2,
  "admissionId":301,"patientId":42,
  "doseGiven":500,"doseUnitGiven":"mg","routeUsed":"oral",
  "administeredTime":"2026-10-19T09:00:00Z","outcome":"given",
  "scannedPatientId":"42","scannedDrugCode":"PARA-500",
  "allergyAcknowledged":true
}
```

Outcomes: `given`, `late`, `refused`, `held`, `not_given`. Non-administration outcomes require `notGivenReason` and do not enqueue medication consumption. `held` here holds one dose; changing the physician's order is a separate prescriber action.

Given doses require matching actual dose/unit/route. High-alert drugs require a fresh second-nurse proof and a hospital-scoped signed treatment consent. Allergy and barcode exceptions require a reason and second-nurse verification. `barcodeVerified:true` and a caller-supplied `cosignBy` are not proof. Barcode values are checked against server identifiers; scanner hardware attestation is a separate integration concern. Outside-window administration requires `timingReason`.

The administration, reconciliation request, audit and outbox event commit in one transaction. The reconciliation queue records consumption for pharmacy review; it does not authorize a second stock issue or a second bill.

PRN orders require `prnMinHours` and integer `prnMax24h`. Infusion orders require `infusionRateMlHr`. Infusion events take `{orderId,orderVersion,scheduleId,eventType,rateMlHr,reason,witnessToken?}`. Rate changes must match the current prescriber-authorized rate; the nurse cannot alter it.

## Wounds, procedures and images

| Method | Path | Contract |
|---|---|---|
| GET / POST | `/v1/nursing/admissions/:id/wounds`, `/v1/nursing/wounds` | POST: `{admissionId,woundType,bodySite,lengthCm,widthCm,depthCm,stage?,note,reviewed:true,episodeId?,imageRef?}` |
| GET / POST | `/v1/nursing/admissions/:id/interventions`, `/v1/nursing/interventions` | POST: `{admissionId,procedureType,note,performedAt?,reassessAt?,woundRecordId?,device?}` |
| POST | `/v1/nursing/images` | Multipart `admissionId` and one `image`; JPEG/PNG ≤5 MB; returns private object reference |
| GET | `/v1/nursing/images/:id` | Reauthorize admission and issue a 60-second private read URL |

A wound episode is tied to one admission; image references must belong to that admission. Interventions can schedule reassessment tasks. Images require `NURSING_IMAGE_BUCKET`, AWS region/credentials and private KMS-enabled storage; optionally set `NURSING_IMAGE_KMS_KEY`. No real image service was provisioned in this change.

## Handover and operations

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/nursing/wards/:wardId/snapshot` | Complete active ward census, pending tasks, doses and latest vitals; no 12/25-patient cutoff |
| GET / POST | `/v1/nursing/handovers?wardId=10`, `/v1/nursing/handovers` | POST: `{wardId,shiftName,receiverId?,sbar}` creates a persisted draft |
| POST | `/v1/nursing/handovers/:id/send` | `{version,receiverId,sbar}`; SBAR must cover every current admission; sender attribution and inbox notification persist |
| POST | `/v1/nursing/handovers/:id/accept` | `{version}`; only the assigned incoming nurse can accept; changed census requires a new handover |
| GET | `/v1/nursing/alerts` | Current ward-authorized clinical alerts |
| POST | `/v1/nursing/alerts/:id/acknowledge` | Record assigned clinician's acknowledgment |
| GET / POST | `/v1/nursing/notifications`, `/v1/nursing/notifications/:id/read` | Individual inbox/read state |
| GET | `/v1/nursing/metrics` | Supervisor: overdue doses, outstanding alerts/handovers/drafts/events |
| POST | `/v1/nursing/events/dispatch` | Supervisor: idempotent local inbox-event delivery/replay |
| GET | `/v1/nursing/wards/:wardId/downtime` | Dated read-only snapshot with reconciliation instructions |
| GET | `/v1/nursing/admissions/:id/export` | Nursing FHIR R4 collection export with signed provenance |

`sbar` is keyed by **admission ID**, each containing `situation`, `background`, `assessment`, `recommendation`. AI assistance at `/v3/hospital-os/nurse/handover` requires a ward ID and respects facility opt-in. It produces drafts only, retains the source census and uses a deterministic fallback on model failure. Failure to load clinical data is an error, never an empty “safe” ward.

## Signed device observations

A supervisor registers `{admissionId,label,publicKey}` at `POST /v1/nursing/devices`; `DELETE /v1/nursing/devices/:id` revokes it. Use an Ed25519 public key (PEM); retain its private key on the device.

`POST /v1/nursing/device-observations/ingest` is device-authenticated and accepts:

```json
{"deviceId":"registered-uuid","observationKey":"unique-observation-001","sentAt":"2026-10-19T09:00:00Z","observedAt":"2026-10-19T08:59:00Z","values":{"heartRate":72,"spo2":98}}
```

`X-Device-Signature` is base64 Ed25519 over the UTF-8 hex SHA-256 returned by canonical JSON hashing (`payloadHash` in `nursing-context.service.js`: recursively sort object keys, preserve arrays). `sentAt` must be within five minutes. For a retry, the device may refresh `sentAt` and sign again while retaining the observation key, observation time and values.

Nurses inspect `GET /v1/nursing/admissions/:id/device-observations` and explicitly accept/reject using `POST /v1/nursing/device-observations/:id/review` with `{decision,note}`. Acceptance creates an attributed, unsigned chart observation through the normal validation/scoring path. Devices cannot sign charts or administer medication.

## Errors and compatibility

401: invalid/revoked session; 403: role/assignment/verification/clinical-safety denial; 404: inaccessible/missing record; 409: stale version, changed census or completed dose; 410: retired unsafe legacy nursing path; 422: invalid value or changed-payload replay; 503: missing migration or required configured dependency.

The HMIS domain router provides `/v1/nursing` and `/v1/echart` aliases alongside its previous `/v1/nursing-ipd` and `/v1/nursing-echart` paths. Legacy free-text nurse medication POST returns 410. Legacy nurse notes/vitals/history require an admission ID. Generic roadmap wound paths return 410 for nurse tokens; use the admission-bound wound endpoints instead. Update older clients as part of rollout.
