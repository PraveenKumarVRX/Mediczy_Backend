# AI Governance and Auth Hardening Standard

## Route Auth Coverage

Every Express router must declare one of these policies at the top of the file:

- `public`: intentionally unauthenticated, documented reason required.
- `authenticated`: `router.use(authUser)` required.
- `role_scoped`: `router.use(authUser)` plus `router.use(requireRole(...))` required.
- `webhook`: signed provider verification required before payload processing.
- `internal`: localhost, mTLS, private network, or service-token guard required.

Operational surfaces are never public. This includes queues, embeddings, admin stats, async task triggers, AI node control, provider configuration, payment management, email/SMS/WhatsApp senders, tenant management, and data export APIs.

## AI Governance

All AI entrypoints must use the central AI provider and governance path. Do not instantiate model vendors directly in feature routes.

Required per AI request:

- authenticated identity, role, tenant, and session context
- prompt template name and version
- model/provider selected and fallback chain used
- tools requested, tools allowed, and tools executed
- RAG source ids, document versions, chunk ids, and retrieval scores
- PHI/PII redaction result before external model calls
- safety classification: wellness, clinical-advice, emergency, prescription, insurance, admin-action
- human approval state for high-risk write actions
- audit event with latency, token usage, errors, and final disposition

High-risk AI actions require human approval before side effects: diagnosis, prescription generation/signing, medication changes, emergency triage disposition, insurance denial/approval, refunds/payments, patient outreach campaigns, and tenant/admin changes.

## Secrets and Defaults

Production code must fail closed when required secrets are missing. Do not ship default passwords, fallback API keys, sample JWT secrets, or live provider URLs that imply real authentication.

## Repository Hygiene

Generated uploads, logs, database dumps, copied SDKs, model binaries, build output, and backup variants belong outside tracked source. If they must be retained, move them to archive storage and keep only a manifest in git.

## Release Gate

Before production deploy:

1. Run endpoint inventory and confirm every route has a policy.
2. Run secret scan against tracked and untracked files.
3. Run AI safety regression suite for clinical, emergency, prescription, insurance, and payment flows.
4. Verify webhook signatures and payment signature checks.
5. Verify tenant isolation on patient, provider, AI memory, embeddings, reports, and billing data.
