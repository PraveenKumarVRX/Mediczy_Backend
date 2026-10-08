# Health Assistant and Task Bot

## Purpose

Mediczy's assistant has two separate responsibilities:

1. **Health guidance** — answer general medical questions with the knowledge-fabric retrieval pipeline and the configured conversational model.
2. **Patient tasks** — execute appointments and other workflow actions through deterministic backend services.

The language model explains and gathers information. It does not invent patient facts, appointment slots, prescriptions, or completed transactions.

## Runtime flow

```text
WhatsApp / web / mobile
        |
        v
Node channel route
  - emergency and simple-intent guards
  - patient identity lookup
  - consent check for personal records
        |
        +--> appointment intent or active booking session
        |       -> DB-backed slot search and confirmation state machine
        |       -> appointment write only after user confirmation
        |
        +--> medical question
                -> SIB /chat
                -> knowledge-fabric retrieval (ai_document_chunks)
                -> consent-scoped EHR retrieval (sib_embeddings, patient id only)
                -> OpenAI (primary deployment provider)
                -> prescription and emergency safety filters
```

The production process is `sib-fastapi` on port 8001. The provider order is controlled by `SIB_PRIMARY_PROVIDER`; production currently uses OpenAI with the model in `OPENAI_MODEL`.

## Retrieval and knowledge fabric

Knowledge documents and approved web/guideline material are ingested into `ai_document_chunks`. SIB's `UnifiedRAGRetriever` searches those chunks for every medical question. Patient history is searched separately from `sib_embeddings` and is filtered by the authenticated patient id. A request without a patient id never performs a global EHR search.

Retrieved chunks are labelled with their source (`knowledge` or `ehr`) before they are supplied to the model. The API response includes retrieval metadata for observability; raw retrieval scaffolding is never sent to WhatsApp.

Web scraping is an ingestion operation, not an unrestricted live browsing step during a patient conversation. Sources must be approved, refreshed, and stored in the knowledge fabric before they can influence answers.

## Patient-history privacy

Personal-record requests are marked `is_patient_specific`. SIB performs an authoritative lookup in `consent_records` (`purpose = 'ai_analysis'`, active and unexpired) before allowing any patient context or EHR chunks to reach a model. Consent lookup failure is fail-closed. Generic symptom questions receive knowledge guidance without patient history.

The WhatsApp route sends only a reduced context envelope after its own consent check: demographics needed for relevance, recent/upcoming appointments, prescription summaries, and active medications. Phone numbers, email addresses, and unrelated account fields are excluded.

## WhatsApp authenticity and identity

There are two different trust checks:

1. **Provider authenticity.** Gupshup webhook events are accepted only after the configured webhook secret/IP allow-list and v2 payload checks pass. This proves the event was delivered by the configured WhatsApp provider for the Mediczy number.
2. **User identity.** An inbound WhatsApp number proves control of that phone, but it does not by itself prove that the sender is the patient. Phones may be shared, delegated to a caregiver, or recycled. A phone-number match against a user record is therefore only a candidate association.

When a user sends `VERIFY` (or `LINK ACCOUNT`), the server looks up an existing account without revealing whether one exists, generates a short-lived OTP, and sends it to that same WhatsApp number. A correct `OTP 123456` reply creates a short-lived, server-side linked session. OTPs are never placed in model prompts or logs, and the session is not accepted from client-supplied flags.

The conversation has these effective states:

```text
anonymous -> phone-controlled -> account-linked -> ai-consent-granted -> transaction-ready
```

Generic health education, emergency triage, and knowledge-fabric retrieval are available without account linking and do not use patient records. Personal history, reports, prescriptions, appointment status, booking, rescheduling, and cancellation require the linked session. Clinical history additionally requires the authoritative active `ai_analysis` consent record. Caregiver access needs a separate delegated relationship or an OTP delivered to the patient account; a caregiver's phone is never silently treated as the patient's identity.

Appointment mutations remain deterministic and confirmation-based. The language model cannot create a placeholder patient from an unlinked WhatsApp number, invent availability, or write an appointment before the linked user confirms the selected slot. Identity-link, consent checks, OTP attempts, and appointment writes should be audited with PHI and codes redacted.

## Task execution

The existing `/task` endpoint and `sib.task_router` provide a common task contract for appointment, reminder, diary, risk, and notification operations. WhatsApp appointment conversations use the database-backed agentic booking service so that:

- available slots come from the database;
- the patient chooses or confirms a slot;
- the booking write is performed by application code;
- the response contains the real appointment id.

The model may ask for missing specialty, date, time, or visit mode, but it cannot claim that a booking exists until the transaction succeeds.

## Safety behaviour

- Emergency detection runs before model generation and returns emergency guidance immediately.
- Emergency status is derived from the patient's message, so educational answers mentioning a serious condition do not create false emergency alerts.
- Prescription and dosage language is filtered; the assistant does not prescribe.
- Failed provider calls fall back to the existing safe retrieval path without exposing prompts, retrieval blocks, or internal context markers.

## Deployment controls

The SIB startup script loads `OPENAI_API_KEY`, `OPENAI_MODEL`, and `SIB_PRIMARY_PROVIDER` from AWS Systems Manager Parameter Store. Secrets are not written to logs or source control. Changing provider or model requires an explicit deployment parameter change and a SIB restart.

## Known boundaries

- Appointment cancellation and rescheduling still need their final transactional adapters; suggestion text alone is not a completed mutation.
- Knowledge-fabric quality depends on source approval and refresh jobs; the assistant should state when evidence is unavailable.
- There is no staging environment in the current deployment, so synthetic users and test appointments must be used for workflow verification.
