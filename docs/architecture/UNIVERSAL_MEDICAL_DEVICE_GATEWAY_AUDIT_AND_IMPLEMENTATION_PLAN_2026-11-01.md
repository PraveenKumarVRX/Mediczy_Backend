# Mediczy Universal Medical Device Gateway: Audit and Implementation Plan

**Audit date:** 2026-11-01  
**Decision requested:** fund a safety-gated, vendor-adapter platform; do not market the current implementation as a universal clinical-device gateway.  
**Scope:** static audit of the Mediczy repository against the supplied universal-gateway brief. This is not a penetration test, a live-device test, a clinical validation, or regulatory advice.

## Approved technology decisions

The following decisions apply to the first pilot and supersede any implication that all listed open-source systems must be installed.

| Component | Decision | Pilot use | Explicit boundary |
| --- | --- | --- | --- |
| Eclipse Mosquitto | **Adopt** | Dedicated, separately operated MQTT broker between the edge gateway and Mediczy intake services. Configure TLS/mTLS, per-client ACLs, persistent sessions, monitoring, and retained-message rules. | It is message infrastructure, **not** an HMIS connector and not a medical-device adapter. Retire the embedded Aedes broker from the clinical path after migration. |
| Open Integration Engine | **Conditional / defer until required** | Deploy separately only when the selected hospital needs HL7 v2/MLLP, legacy transformation, or complex site-specific routing. | Do not add it to an FHIR-only first pilot. It must not own clinical source-of-truth data; Mediczy owns the canonical event, audit, and delivery-reconciliation record. |
| HAPI FHIR | **Defer** | Continue Mediczy's Node-based FHIR API and add conformance/validation tests to the pilot. Re-evaluate HAPI only if a full enterprise FHIR repository, validator, or Java interoperability service becomes a demonstrated requirement. | Do not introduce a second FHIR server or Java operating model for the initial device pilot. |
| Orthanc | **Use only for imaging** | Continue the existing DICOM/Orthanc-oriented PACS, modality, DICOMweb, and worklist work. | It is out of scope for patient monitors, ventilators, pumps, anaesthesia machines, and laboratory analysers. |

**Approved first-pilot stack:** `one OEM-approved, read-only patient-monitor adapter → dedicated edge gateway → Mosquitto → Mediczy canonical clinical ingestion and nurse-review policy → direct FHIR R4 delivery to the selected HMIS`.

Open Integration Engine becomes an approved alternate outbound leg only where that HMIS cannot accept the direct FHIR R4 contract. Remote device-control commands and automatic alarm acknowledgements remain out of scope.

## Foundation implementation status

The following repository changes implement the software-controlled foundation. They do not claim OEM protocol compatibility or clinical validation.

| Delivered | Location | Operational gate that remains |
| --- | --- | --- |
| Reconciled legacy HyperGrid MQTT schema usage; secrets are now SHA-256 hashes and device state uses the migration-defined `status` field. | `server/routes/hypergrid-mqtt.route.js`, `server/services/hypergrid-mqtt.service.js` | Apply the existing HyperGrid migration and migrate any historic plaintext-secret records through a controlled credential rotation. |
| Closed the unauthenticated POC-device sync endpoint and added gateway secret verification to legacy edge heartbeat/config/offline-sync calls. | `server/routes/poc-device.route.js`, `server/routes/hypergrid-edge.route.js` | Existing gateway deployments must receive their secret and be regression-tested before rollout. |
| Added the clinical-device data boundary: approved adapter releases, Ed25519-keyed gateways, devices, explicit bindings, immutable events/measurements, quarantine, review, and connector outbox. | `server/migrations/20261101000100-medical-device-gateway-foundation.migration.js`, `server/services/medical-device-gateway.service.js`, `server/routes/medical-device-gateway.route.js` | Run migration in a controlled environment; assign clinical engineering owners before marking an adapter release certified. |
| Added Mosquitto deployment and MQTT cloud-ingestion seam, with legacy embedded Aedes disabled unless explicitly opted in. | `infra/medical-device-gateway/`, `server/services/medical-device-mqtt-ingest.service.js`, `server/app.js` | Provision hospital TLS/mTLS certificates, real ACLs/passwords, persistent storage, monitoring, and `MEDICAL_DEVICE_MQTT_*` configuration. The compose file is development-only. |
| Added a signed, offline-spooling edge-agent runtime seam. | `edge-gateway/` | Implement one separately approved OEM/model adapter, secure the encrypted spool volume, and deploy it under a restricted service account. |
| Closed the biomedical maintenance/cold-chain service gaps found by the audit: tenant-scoped calibration, overdue clinical-use blocking, idempotent cold-chain readings/alerts, and overdue-state updates. | `server/services/biomedical-equipment.service.js` | Apply the biomedical migrations and connect the approved device adapter to these operational controls. |
| Added gateway/event and schema contract tests. | `server/__tests__/medical-device-gateway.contract.test.js`, `server/__tests__/hypergrid-mqtt-schema-contract.test.js` | Add adapter simulator, hardware-in-loop, HMIS reconciliation, security, and clinical acceptance tests for each real device model. |

### Runtime configuration

| Variable | Purpose | Required when |
| --- | --- | --- |
| `ENABLE_MEDICAL_DEVICE_MQTT_INGEST=true` | Starts the cloud subscriber for the dedicated Mosquitto broker. | Clinical MQTT ingestion is enabled. |
| `MEDICAL_DEVICE_MQTT_URL` | TLS MQTT URL for cloud ingestion and edge publishing. | Clinical MQTT ingestion is enabled. |
| `MEDICAL_DEVICE_MQTT_USERNAME` / `MEDICAL_DEVICE_MQTT_PASSWORD` | Development broker credentials only; production should use mutual TLS and broker-managed identity. | The broker is configured for password authentication. |
| `ENABLE_LEGACY_EMBEDDED_MQTT=true` | Temporary opt-in for the old Aedes broker. | Only during an audited migration window; it must remain false for the clinical device path. |

The `medical-device-gateway` API deliberately holds accepted events in review/outbox state. Direct FHIR delivery must be activated only after the selected hospital's endpoint, scopes, mapping profile, retry/ACK policy, and reconciliation process have been approved.

## Executive conclusion

Mediczy has useful *foundations* for this programme: an MQTT/event concept, an edge-gateway API, device and biomedical inventory, HL7 v2 and FHIR APIs, DICOM/RIS work, clinical vitals/NEWS2 workflows, and tenant-aware HyperGrid routes. It does **not** yet implement a production-ready universal medical-device integration gateway.

The most important distinction is that current code primarily models device inventory, manually entered clinical data, and generic IoT messages. It does not contain a deployable on-premise agent, serial/TCP/vendor SDK transports, certified device adapters, safe patient-device association, a canonical clinical observation pipeline, or a verified delivery path into a hospital HMIS.

“All devices, all manufacturers, any HMIS” is an ecosystem strategy, not a single release. The achievable product is a governed adapter platform: integrate each approved device model and HMIS contract once, normalize it to a strict canonical model, then reuse the certified connector.

## Current-state evidence

| Area | Present in Mediczy | Assessment |
| --- | --- | --- |
| Edge/gateway management | `server/routes/hypergrid-edge.route.js` registers gateways, tracks heartbeats/configuration, and supports offline bulk sync. | Foundation only; no edge-agent executable or local device transport exists. Gateway calls authenticate with a key only, although a secret hash is stored. |
| MQTT/eventing | Embedded Aedes broker and Redis event bridge in `server/services/hypergrid-mqtt.service.js`; alarms are bridged to ICU events in `device-alarm-bridge.service.js`. | Prototype message fabric; not a clinical ingestion service. It has no schema registry, ordering/idempotency contract, replay/dead-letter process, or device-model parser. |
| Device registry | `hg_devices`, `hg_edge_gateways`, and `hg_device_readings` are declared in `server/db/migrations/011-hypergrid-platform.sql`. | Appropriate starting concepts, but no UDI, device-model capability matrix, adapter version, certificate, connection profile, or patient/bed binding history. |
| Biomedical operations | Biomedical inventory, maintenance/calibration concepts, and a biomedical UI/service exist. | Useful operational feature, separate from device connectivity and clinical data provenance. |
| HL7/FHIR | HL7 v2 MLLP parser/transformer and FHIR R4 routes/mappers are present. | Useful for an HMIS-facing boundary, but Device/DeviceMetric/Provenance-based device observation delivery and per-HMIS conformance are missing. |
| Imaging | DICOM modality/Orthanc-oriented routes and a web viewer are present. | A separate imaging integration path; it does not make non-imaging equipment interoperable. |
| Clinical consumption | Vitals API, NEWS2/alert workflows, ICU UI, and nursing review of signed observations exist. | Strongest reusable safety pattern: device observations can be queued for nurse review. It is not wired to HyperGrid/device adapters. |
| Consumer wearables | Browser BLE services include Veepoo and Fire-Boltt, plus patient wearable workflows. | Not a hospital-equipment gateway: browser BLE is unsuitable for a continuously operating, managed clinical edge service. |

### Confirmed implementation blockers

1. **The documented MQTT schema and its API/broker disagree (P0).** The HyperGrid migration declares `hg_devices.gateway_key`, `secret_hash`, and `status`; the enrollment route and broker query use `device_key`, plaintext `api_secret`, and `active`. The reading table declares `reading_type`, `value`, `unit`, `quality`, and `recorded_at`; the broker writes `event_type`, `payload`, and `received_at`. The same route later reads a mixture of both shapes. A fresh database using the migration cannot reliably enroll or authenticate an MQTT device or persist its readings.

2. **There is no actual device-side adapter or transport (P0).** Dependencies include MQTT but not serial-port, HID, Modbus, IEEE 11073/SDC, or a native BLE runtime. The repository contains no RS-232/USB/TCP protocol driver, device discovery, or vendor implementation for patient monitors, ventilators, infusion pumps, anaesthesia machines, lab analysers, dialysis, ECG, or imaging modalities.

3. **Patient/device/encounter association is missing (P0).** `hg_device_readings` has an optional `patient_id`; there is no controlled binding workflow, barcode/QR confirmation, bed/encounter validation, expiry/disassociation event, conflict handling, or quarantine queue. Incorrect attribution must never auto-write to the chart.

4. **The clinical path is not connected end to end (P0).** MQTT messages are published as generic events/readings; they are not transformed into a versioned clinical observation, validated against device capabilities and units, routed to the nurse-review workflow, committed to an admission/encounter, and exported to the target HMIS.

5. **Gateway/device authentication is incomplete (P0).** Edge heartbeat/config/sync endpoints check only `x-gateway-key`, not the stored secret; the MQTT path compares a secret in plaintext. There is no mutual TLS, certificate lifecycle, credential rotation acknowledgment, device authorization to a topic/patient/tenant, or secure local secret store.

6. **The data model lacks provenance and safety state (P0).** Readings need source device and model, adapter/version, raw frame hash/reference, measured vs received time, clock-quality, unit/coding transform, quality flag, validation result, patient-association decision, reviewer, and immutable audit chain. A single numeric `value` cannot represent a BP panel, waveform, infusion setting, or alarm lifecycle.

7. **The interface is not a universal HMIS connector (P1).** Current HL7/FHIR functions are application endpoints. Missing elements include connection profiles, MLLP client/retry/outbox, ACK/NACK handling, per-site mapping/versioning, FHIR transaction/subscription support, DICOM Modality Worklist integration, test harnesses, and operational reconciliation.

8. **Alarm behaviour is unsafe as a production control (P0).** The alarm bridge assigns a small hard-coded alarm map and sends an acknowledgement back to the device after persistence attempt. It has no manufacturer/model-specific alarm semantics, delivery/acknowledgement guarantee, clinician escalation policy, deduplication/suppression governance, or proof that remote acknowledgement is permissible for that device.

9. **Data reliability operations are incomplete (P1).** There is no disk-backed edge queue, store-and-forward watermark, duplicate policy, backpressure, clock synchronization policy, dead-letter queue, replay console, or backup/restore test for device data.

10. **Deployment is not appliance-ready (P1).** The application starts an embedded broker in the web/API process. There is no hardened edge image, signed release/update system, least-privilege host service, offline configuration bundle, network segmentation guide, or supported hardware bill of materials.

11. **Tests do not prove the clinical integration (P1).** Targeted tests pass for HL7 parsing, tenant routing, and vital utilities, but no hardware/HMIS end-to-end test exists. At audit time, five biomedical-equipment tests failed because expected maintenance/cold-chain safeguards were absent and calibration conflict scope differed. The foundation implementation resolves those failures; hardware, HMIS, security, and clinical acceptance evidence remains required.

12. **A pre-existing API security gap should be closed (P0).** `PUT /api/poc-devices/:id/sync` is unauthenticated, while neighbouring register/assign/calibrate endpoints require `authUser`. It must not remain a writable device telemetry endpoint.

## What should be retained, repaired, and replaced

| Action | Components | Rationale |
| --- | --- | --- |
| Retain and build on | Vitals/NEWS2, nursing signed-observation review, tenant isolation, FHIR mapper, HL7 parser, DICOM/Orthanc work, biomedical maintenance UI. | These are valuable downstream workflow and governance components. |
| Repair before pilots | HyperGrid schema/route/broker contract, edge credential checks, POC sync authentication, test suite, message persistence. | These defects block trustworthy enrolment and ingestion. |
| Replace or isolate | Embedded MQTT broker as the clinical-device control plane; generic HyperGrid reading model as the clinical source of truth. | The device platform needs dedicated deployment, durable messaging, explicit contracts, and safe failure handling. |
| Do not reuse for bedside equipment | Browser BLE wearable integrations. | They are patient-facing, browser-dependent integrations—not managed hospital equipment adapters. |

## Target architecture

```text
Medical equipment (one approved model/protocol at a time)
  serial / USB / TCP / vendor SDK / DICOM / SDC
                         |
                         v
Hospital edge appliance (separate deployable)
  adapter host -> device discovery -> raw-frame vault -> local durable queue
  -> canonical validation -> patient/bed binding cache -> mTLS uplink
                         |
                         v
Mediczy device platform
  intake API -> schema + unit/terminology validator -> quarantine/replay
  -> immutable device event store -> clinical review/persistence -> alert policy
  -> HMIS connector outbox
                         |
                         v
Hospital systems
  HL7 v2 MLLP / FHIR R4 transaction or REST / DICOMweb or MWL / vendor API
```

### Hard safety boundaries

- An adapter can *observe* device output; it cannot issue therapy, parameter, alarm, or configuration commands in the first releases.
- No observation reaches a clinical chart without a valid tenant, approved adapter/model, active device registration, patient/encounter association, unit/coding validation, and configured review policy.
- Association ambiguity, unsupported metrics, failed validation, clock drift, duplicate conflict, disconnected device, or downstream delivery failure produces a visible quarantined state—not a silent drop or automatic chart entry.
- Alarm acknowledgement is a user workflow, never an automatic device-control action, until model-specific OEM authorization, risk analysis, and clinical validation approve it.

## Recommended code and deployment boundaries

Do not put native serial/BLE drivers into the existing Express service. Create a separately versioned edge project and keep the cloud platform in this repository.

```text
mediczy/
  server/
    device-platform/
      canonical/              # JSON Schema, versioning, UCUM/LOINC mappings
      intake/                 # mTLS authenticated batch/event intake
      registry/               # device, model, adapter, certificate, bindings
      association/            # patient-bed-device binding and reconciliation
      clinical-ingest/        # review policy -> observation/alert persistence
      hmis-connectors/        # HL7/FHIR/DICOM adapters plus outbox/retry
      operations/             # replay, reconciliation, audit, metrics
  edge-gateway/               # new independently released Node/Java/Rust service
    adapter-sdk/
    adapters/<manufacturer>-<model>/
    transports/serial-tcp-usb/
    durable-spool/
    provisioning/
    simulator/
  contracts/
    device-event/v1/
    adapter-manifest/v1/
    hmis-profile/v1/
  integration-tests/
    simulators/ fixtures/ contract/ hardware-in-loop/
```

Each adapter must have a signed/versioned manifest with manufacturer, exact model/firmware range, approved protocol document and license, metrics/alarm capabilities, units, mapping revision, known limitations, test fixtures, compatibility state, owner, and withdrawal procedure. “Generic” adapters are only allowed where a published standard and successful conformance test justify the claim.

### Canonical event contract (minimum)

Use an immutable envelope for one reading, waveform batch, alarm, or device-lifecycle event. Store a redacted/raw payload reference rather than treating the raw payload as a clinical record.

```json
{
  "schemaVersion": "device-event/v1",
  "eventId": "uuid",
  "tenantId": "hospital-uuid",
  "gatewayId": "gateway-uuid",
  "device": {
    "registryId": "uuid",
    "udi": "optional",
    "manufacturer": "...",
    "model": "...",
    "serialNumber": "...",
    "adapterId": "philips-intellivue-mp70",
    "adapterVersion": "1.2.0"
  },
  "association": {
    "state": "confirmed|pending|conflict|unassigned",
    "patientId": "optional",
    "encounterId": "optional",
    "bedId": "optional",
    "bindingId": "uuid"
  },
  "observedAt": "2026-11-01T10:15:30Z",
  "receivedAt": "2026-11-01T10:15:31Z",
  "measurements": [{
    "code": { "system": "http://loinc.org", "value": "8867-4" },
    "value": 78,
    "unit": "beats/min",
    "ucum": "/min",
    "quality": "validated|suspect|invalid"
  }],
  "provenance": { "rawPayloadRef": "...", "rawPayloadSha256": "..." }
}
```

Map one accepted measurement to a FHIR `Observation` with `Device`/`DeviceMetric` references and provenance; use a FHIR Observation panel for multi-component measurements such as blood pressure. Preserve the source timestamp and never overwrite an existing clinician-entered record.

## Database and workflow changes

Replace the inconsistent HyperGrid device tables through an expand/contract migration. Do not hot-patch schemas from route handlers.

| New/changed entity | Key purpose |
| --- | --- |
| `medical_device_model` and `adapter_release` | Exact model/firmware/adapter compatibility, capability map, certification state, artefacts. |
| `medical_device` and `edge_gateway` | Tenant/site, UDI/serial, lifecycle, certificate/key reference, network profile—not plaintext secrets. |
| `device_connection_profile` | Approved transport parameters encrypted at rest and assigned only to an edge gateway. |
| `device_binding` | Time-bounded device-to-bed/patient/encounter association, two-person/scan confirmation metadata, and explicit end state. |
| `device_event` / `device_measurement` / `device_alarm` | Immutable source events, normalized measurements, validation disposition, clock/quality and provenance. Partition by time if volume requires it. |
| `ingestion_quarantine`, `connector_outbox`, `delivery_attempt` | Reviewable failures, idempotent delivery, ACK/NACK/retry/reconciliation. |
| `adapter_conformance_run`, `clinical_validation_run` | Evidence of simulator, hardware-in-loop, and hospital acceptance results. |

The current `hg_*` tables can remain for non-clinical IoT/asset use during migration, but they should not silently mix into the clinical-device record.

## Reusable open-source components

Use external projects as evaluated dependencies or reference implementations—not as proof of universal compatibility and not as a substitute for vendor contracts.

| Component | Recommended role | Decision / caveat |
| --- | --- | --- |
| [MD PnP OpenICE](https://github.com/mdpnp/mdpnp) | Study its adapter architecture, device simulators, data-model ideas, and supported-device examples. | Pilot/reference only until a licence, runtime, dependency, and supported-device review is completed; do not couple Mediczy’s core to its DDS assumptions. |
| [Open Integration Engine](https://github.com/OpenIntegrationEngine/engine) | Mature channel-based HL7 v2/FHIR/DICOM transformation/routing for hospital-specific integrations. | Evaluate as a separately deployed integration engine; its MPL-2.0 obligations, security posture, operations, and channel export governance need legal/security review. |
| [HAPI FHIR](https://github.com/hapifhir/hapi-fhir) | Optional standards-complete FHIR façade/validator or reference implementation for an enterprise interoperability boundary. | Keep Mediczy as system of workflow initially; adopt only after performance, security, and operating-model evaluation. |
| [Orthanc](https://www.orthanc-server.com/) | DICOM/DICOMweb edge or PACS integration complement. | Continue the existing Orthanc-oriented path for imaging only; it does not solve bedside device integration. |
| MQTT broker (managed/clustered) | Edge-to-cloud telemetry transport. | Use TLS, per-client authorization, persistent sessions, retained-message rules, monitoring, and HA. Do not make an in-process API broker the production clinical message plane. |

The supplied brief’s “OpenICE-lite”/SDC references should be re-verified for ownership, production maturity, supported devices, and licence before any adoption decision. For standards, use current licensed copies and conformance profiles; the implementation must target the particular device/model and hospital interface, not a marketing label such as “IEEE 11073 compatible.”

## Phased implementation roadmap

Time ranges are implementation estimates after team staffing and vendor access. They are gates, not promises of universal coverage.

### Phase 0 — programme controls and remediation (2–3 weeks)

1. Select the first vertical slice: one hospital, one **read-only** patient monitor model, one ICU/ward, and one outbound HMIS contract (FHIR R4 Observation preferred; HL7 ORU^R01 if required).
2. Obtain OEM protocol/SDK rights, device samples, firmware versions, hospital network access, and a non-production HMIS endpoint. Stop if documentation or data rights are unavailable.
3. Write hazard analysis, intended use, clinical review policy, privacy/data-flow assessment, cybersecurity threat model, and change-control process with clinical engineering and quality/regulatory owners.
4. Fix the existing HyperGrid schema/API/broker mismatch, remove plaintext device-secret storage, require authentication on POC sync, and add regression tests for fresh-schema enrollment, MQTT authentication, and reading persistence.
5. Make the failing biomedical tests represent the intended service contract, then make them pass; do not delete them to obtain a green build.

**Exit gate:** approved vertical-slice charter; real device and HMIS access; security/clinical owners named; corrected foundational tests green.

### Phase 1 — safe platform foundation (4–6 weeks)

1. Introduce versioned canonical schemas, terminology/unit validation, schema registry, idempotency keys, error taxonomy, and an immutable event/audit store.
2. Add managed gateway/device enrollment with mTLS or certificate-bound tokens, encrypted connection profiles, tenant/site/topic authorization, key rotation, revocation, and audit events.
3. Implement device/bed/patient/encounter binding: scan/confirm, expiry at transfer/discharge, conflict quarantine, and staff-visible association state.
4. Build a dedicated edge appliance with a disk-backed encrypted spool, retry/backoff, clock health, remote diagnostics, signed upgrades, outbound-only connectivity, and a simulator.
5. Add an operations console for fleet health, delayed data, quarantine, replay, mapping version, and clinical delivery reconciliation.

**Exit gate:** power/network interruption test proves no unaccounted data; all messages are traceable; no reading can bypass association/validation policy.

### Phase 2 — first certified vertical slice (6–10 weeks)

1. Implement one OEM-approved patient-monitor adapter (TCP or serial according to the actual device documentation) and simulator fixtures.
2. Normalize HR, SpO₂, NIBP, RR, and temperature with UCUM/LOINC mappings, source timestamps, quality flags, and source provenance.
3. Route data through a nurse-review policy initially; permit carefully approved auto-accept only after clinical validation defines conditions and monitoring.
4. Deliver to the selected HMIS using an outbox with HL7 ACK/NACK or FHIR response reconciliation; reconcile source, Mediczy, and HMIS counts/identifiers daily.
5. Execute unit, contract, parser fuzz, network loss, duplicate/replay, clock drift, tenant isolation, load, and hardware-in-loop tests.

**Exit gate:** supervised pilot has passed clinical-engineering acceptance, HMIS reconciliation, downtime recovery, security test, and clinical safety review.

### Phase 3 — ICU equipment families and operationalization (3–6 months)

1. Add device families one at a time: monitor models first; then ventilators, infusion pumps, anaesthesia, ECG, dialysis, lab analysers, and imaging workflows where contracts support them.
2. Implement model-specific alarm ingestion and clinician acknowledgement workflow. Keep control commands disabled unless separately validated and authorized.
3. Add a mapping studio that produces reviewed, versioned mapping artefacts; no free-form production transformations without approval and test evidence.
4. Integrate biomedical maintenance/calibration state so an out-of-service device cannot present as clinically trustworthy.
5. Add 24×7 monitoring, runbooks, incident drills, service-level objectives, and adapter deprecation/recall workflows.

**Exit gate per adapter:** exact model/firmware compatibility, documented known limits, conformance suite green, security review, clinical-engineering signoff, and rollback tested.

### Phase 4 — multi-HMIS and ecosystem scale (ongoing)

1. Add reusable HMIS connector profiles (FHIR R4, HL7 v2 MLLP, DICOMweb/MWL, agreed vendor APIs), each with a hospital-specific conformance pack.
2. Operate a certified adapter catalogue with commercial/support status, licence evidence, deployment guide, test fixtures, and compatibility matrix.
3. Introduce governed OEM partnerships and standard-protocol adapters (including SDC where a device and hospital actually support it).
4. Build analytics only from quality-approved, provenance-preserving data; never derive clinical claims from raw, unvalidated telemetry.

## Work backlog by priority

| Priority | Backlog item | Definition of done |
| --- | --- | --- |
| P0 | HyperGrid contract reconciliation | One migration and one typed repository contract; fresh DB + registration + MQTT auth + reading query passes. |
| P0 | Device/gateway identity | No plaintext secrets; mTLS/certificate or equivalent bound identity; revocation and rotation tested. |
| P0 | Patient association | Explicit binding state and audit; all ambiguous readings quarantined. |
| P0 | Canonical clinical ingestion | Unit/coding/quality/provenance validation; idempotent event and observation persistence. |
| P0 | POC sync authentication | Unauthorized update rejected; device principal has least privilege and tenant scope. |
| P0 | Alarm safety policy | No automatic device acknowledgement/control; model-specific alarm catalogue and escalation workflow. |
| P1 | Edge appliance | Installable/signed service, durable offline spool, telemetry, update/rollback, simulator. |
| P1 | HMIS outbox | Site profile, transform version, ACK/NACK/retry, reconciliation dashboard. |
| P1 | Verification | Contract, hardware-in-loop, fault, security, and clinical acceptance suites in CI/release evidence. |
| P2 | Adapter catalogue | Approval workflow, compatibility matrix, licences, lifecycle and support ownership. |

## Acceptance metrics for the first pilot

- 100% of accepted readings have tenant, device/model, adapter version, association decision, observed/received time, unit/code, quality, and immutable provenance.
- 100% of ambiguous/unmapped/invalid readings are visible in quarantine; 0 silently become chart data.
- 0 data loss in the agreed network-outage test window; duplicates do not create a second clinical observation.
- Source-device, Mediczy, and HMIS delivery reconciliation is demonstrably complete for every pilot shift.
- Every alert path has an auditable clinician notification/acknowledgement record; no automatic remote device-control action occurs.
- Every deployed adapter has a simulator fixture, a hardware-in-loop result, an owner, a supported model/firmware range, and an explicit rollback procedure.

## Decisions needed before implementation begins

1. Name the pilot hospital, first device make/model/firmware, care area, and intended clinical workflow.
2. Choose the first HMIS endpoint and its exact supported contract (FHIR R4, HL7 v2 profile, or vendor API).
3. Confirm whether the first release is **observe-only**. This plan assumes yes.
4. Assign clinical engineering, nursing/medical, information security, privacy, and quality/regulatory product owners who can approve the gates above.
5. Approve a dedicated edge-gateway product/repository and operational budget; this work should not run inside a browser or the main API process.

## Audit verification performed

- Static source and dependency review of the device, biomedical, HyperGrid, MQTT, HL7, FHIR, DICOM, vitals, nursing, wearable, migration, and deployment paths.
- Initial targeted audit run: 43 tests passed in HL7, tenant-route, and patient-vital suites; 5 biomedical-equipment tests failed as described above.
- Post-foundation targeted run: 54 tests passed across biomedical equipment, canonical device-event, MQTT-schema, HL7, tenant-route, and patient-vital suites.
- Public-project suitability was checked at a high level against the official OpenICE, Open Integration Engine, HAPI FHIR, and Orthanc project pages. A licence/security/maintenance review remains a Phase 0 deliverable before inclusion in a commercial healthcare deployment.
