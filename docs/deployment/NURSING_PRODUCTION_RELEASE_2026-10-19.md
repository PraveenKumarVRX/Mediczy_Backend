# Nursing production release and demo onboarding

Recorded 19 October 2026 (IST). The user explicitly authorized direct live deployment because staging does not exist, then selected the demo hospital. **The live demo rollout is technically verified. Human clinical acceptance is not granted.**

Subsequent database hardening activated backend release `nursing-20261019-06` and protected 23 clinical tables. The original rollout evidence below remains a historical record; current database migration, recovery and remaining controls are in [Database hardening](DATABASE_HARDENING_2026-10-19.md).

## What is live

- Application: [app.mediqzy.com](https://app.mediqzy.com).
- Hospital: **Smart Hospital**, hospital account ID `4`, canonical tenant ID `11`. Both the hospital and tenant are marked as demo data. Their IDs are deliberately kept distinct.
- Backend: `/home/ubuntu/mediqzy-releases/nursing-20261019-04/server`, running as the existing PM2 `mediczy-server` through its SSM loader. PM2's saved process list was updated. Unrelated working-tree changes were excluded from this backend release.
- Nursing migration: applied atomically to `mediczy_prod` after RDS snapshot `nursing-pre-release-20261019` became available. Historical duplicate dose/pharmacy checks passed. All 18 nursing tables have forced RLS and policies; populated chart/assignment/audit tables were checked for unscoped and cross-tenant denial.
- Images: dedicated private, versioned bucket and rotating KMS key, configured through SSM. The nursing image service explicitly uses the EC2 role. Both an infrastructure probe and a real nurse API upload/signed read/unsigned denial passed with synthetic content.
- Frontend: the existing live origin build already contained the nursing screens. It was preserved to retain other already-live changes, checked against the nursing source, synchronized to `s3://app.mediqzy.com`, and invalidated in CloudFront. Existing hashed assets were retained. A separately packaged nursing frontend build and targeted typecheck also passed.

The backend base commit is `2f9021bd170d2d2ef4a6d4660798de82f77e35f8` plus the explicit nursing overlay. The overlay is captured by file hashes; it is not represented as a committed/pushed Git revision. Exact evidence and source hashes are in [the production verification record](../testing/NURSING_PRODUCTION_VERIFICATION_2026-10-19.json).

## Use the demo

1. Existing hospital login: [Hospital Login](https://app.mediqzy.com/hospital/login). Its password was not changed. Open [Nursing administration](https://app.mediqzy.com/hospital/nursing/administration) to view the new demo nurses and shifts.
2. Nurse login: [Nurse Login](https://app.mediqzy.com/nurse/login). Accounts are `nursing.demo.day@mediqzy.invalid` and `nursing.demo.incoming@mediqzy.invalid`.
3. Passwords are generated secrets, available in the local private file `/home/ubuntu/nursing-release-evidence/20261019/demo-access.private.json` (mode `0600`) or SecureString parameters `/mediczy/demo/nursing/tenant-11/day` and `/mediczy/demo/nursing/tenant-11/incoming`. Passwords and tokens are excluded from repository documentation and verification artifacts.
4. Select **Nursing Simulation Ward / DEMO-NUR-01**, admission `3`. Its patient and every walkthrough entry are explicitly synthetic. Demo accounts are restricted to that simulation ward/admission and cannot open ordinary admissions.
5. Both demonstration shifts expire at **04:52 IST on 20 October 2026**. The hospital supervisor can renew shifts in nursing administration. The bounded provisioning script can also renew expired demonstration shifts using the existing credentials; it does not reset existing hospital passwords.

No real clinical qualification, prescribing privilege, signed patient consent or medication order was manufactured. eMAR safety scenarios, PRN/infusion and pharmacy concurrency were exercised on disposable PostgreSQL fixtures; the live demo does not imply medication authorization for actual patients.

## Verification performed

| Check | Result |
|---|---|
| Focused backend suite | 11 suites / 130 tests passed |
| Disposable PostgreSQL migration, isolation, concurrency and recovery | 34 scenarios passed |
| Client session/route tests | 9 previously passing tests; nursing UI source unchanged |
| Targeted nursing TypeScript and isolated production build | Passed; build 3m 27s |
| Public HTTP health, SPA shells and unauthenticated API denial | 8 checks passed |
| Unauthenticated live browser routing | 3 screens passed |
| Real authenticated demo API walkthrough | 10 checks passed |
| Real authenticated tablet walkthrough | 4 checks passed: login/worklist, server autosave, portrait/landscape layout, persistence after reload |
| Real application image upload/read | 4 checks passed using a one-pixel synthetic PNG |
| Existing hospital supervisor login/directory | Passed without a password reset |
| Populated nursing RLS | Unscoped/cross-tenant counts zero; own demo tenant records visible |

The live walkthrough retained its signed synthetic note, vital/fluid observations, care goal/evaluation, accepted two-nurse handover, draft and synthetic image. These are demonstration records, not human clinical attestations. A tablet screenshot is stored privately with the release evidence. No actual patient treatment or medication administration was performed by the walkthrough.

The authenticated checks exposed and fixed three integration issues: missing tenant fields in the nurse login model, missing nursing prefixes in the global role fence, and the shared upload parser consuming nursing multipart requests. The role and multipart fixes have regression tests.

## Repeating checks and rollback

Commands below run from the repository root, with credentials already provisioned privately:

```bash
npm run test:nursing --prefix server -- --silent
npm run test:nursing:integration --prefix server
NURSING_LIVE_BASE_URL=https://app.mediqzy.com \
  NURSING_LIVE_EVIDENCE_DIR=/home/ubuntu/nursing-release-evidence/20261019 \
  node client/scripts/nursing-live-smoke.mjs
```

The demo API, browser and storage scripts are `client/scripts/nursing-demo-{live,browser,storage}.mjs`. They require explicit `NURSING_LIVE_BASE_URL` and `NURSING_DEMO_EVIDENCE_DIR`. Repeating them creates additional clearly labeled synthetic observations; it never deletes signed history. Account provisioning is `server/scripts/demo/provision-nursing-demo.mjs`, invoked through the SSM loader with explicit hospital `4`, tenant `11` and a private evidence directory.

The prior isolated backend is retained at `/home/ubuntu/mediqzy-releases/nursing-20261019-03`. If an application rollback is necessary, explicitly activate that directory using `scripts/deploy/activate-nursing-backend.cjs`, verify health and save PM2. It retains admission isolation and the nurse role fix, but predates the multipart correction. Signed database history must remain intact; the migration's destructive down path is disabled. Never restore an older database over subsequent clinical writes just to undo an application release.

Operational evidence and earlier frontend entry points are retained under `/home/ubuntu/nursing-release-evidence/20261019`, outside the served checkout. These include sensitive process configuration and access files; do not publish that directory. Future deployments must explicitly update the PM2 release path; pulling the shared checkout alone does not update this isolated backend. Do not prune the active release or its dependency/runtime links.

## Still pending for real clinical use

- Named nursing and pharmacy reviewers must execute and attest [the clinical acceptance record](../testing/NURSING_CLINICAL_ACCEPTANCE_2026-10-19.json). Actual scanners/devices, approved content, prescribing identities, clinical consent, stock/billing reconciliation, retention policy, training and supervised ward pilot remain hospital responsibilities.
- Clinical ownership has since been transferred to a no-login owner for 23 tables and three immutable functions. Legacy runtime ownership elsewhere still requires migration; see the database hardening record.
- The original RDS instance and historical pre-release snapshot were unencrypted. The separate database hardening record tracks the encrypted replacement and actual traffic-cutover status; image storage is KMS-encrypted.
- Whole-application TypeScript errors, large frontend chunks, production capacity/recovery objectives and partner conformance remain broader workstreams. The focused checks do not close them.

Staging was not created or claimed. This record documents the explicit nursing production exception and demo scope; it does not approve a general bypass of the comprehensive plan's release gates.
