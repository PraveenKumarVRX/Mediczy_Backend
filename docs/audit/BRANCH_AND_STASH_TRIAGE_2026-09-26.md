# Branch and stash triage — 2026-09-26

Requested: "merge all branches to main safely including stashed ones and deploy". Result of measuring every branch and stash instead of merging blind.

## Branches

**Already fully in `main` (ahead = 0):** all 2026-09-26 work branches (`fix/*`, `uid/*`, `tests/pending-coverage`), `feat/medstar-readiness`, `fix/auth-otp-consultation-20260901`, `ant`, `backup/pre-merge-snapshot-20260526-173909`, and 8 of the 9 `origin/cursor/*` branches (their single commit is already in `main` by patch).

**Not merged — each conflicts with `main` and needs an owner's decision** (`git merge-tree` against current `main`):

| Branch | Unmerged commits | Conflicting files | Notes |
|---|---|---|---|
| `cursor/storage-audit-offsite-backup-a986` | 5 (Jul 5) | 4 | Voice-assistant / iSHA routing. Conflicts in `llm-provider.js` (the LLM cascade). `main` already carries the recovered iSHA/local-SLM fixes (`f693a65e`); treat as superseded. |
| `prod` (local; NOT `origin/prod`) | 10 (Jun 20–21) | 9 | Coupons, WhatsApp copilot, GPU scheduler / cognitive routing, Personal Health Assistant, fine-tuning governance, Phase-0 hospital OS. 31 files added that `main` lacks (e.g. `gpu-scheduler.service.js`, `whatsapp-copilot.service.js`, PHA). `main` has its own cognitive router and coupon code, so this is feature integration, not a merge. |
| `origin/prod-main-snapshot-20260626` | 27 (Jun 11–25) | 33 | Superset of the above plus AI-security hardening, OHIF/imaging fixes, copilot tools. A June snapshot; 53 added files, 10 present in `main`. |
| `recover/care-intelligence-mesh` | 6 (Jul 5–6) | 10 | Care Intelligence Mesh 13-agent roster, ClinicalShell layout, CareOS readiness. 9 files added, 4 present in `main`. |
| `origin/cursor/unified-qms-aadhaar-38b7` | 4 (Aug 1) | 22 | Unified QMS queue + Aadhaar QR. All 19 files it adds already exist in `main` (QMS was re-landed differently) — superseded. |
| `origin/project-load-failed` | 4 (Jun 14) | 5 | Prescription card-grid UI + dev-port/`package-lock` changes. Stale dev-environment work. |
| `backup/main-before-clean-sync-20260524` | 1 (+26 already in main) | 138 | A backup snapshot of May state; keep as a backup, do not merge. |

Nothing was merged from these because a conflicted merge of months-old work into a production line, without the authors' review and a staging environment, is how an outage happens. Each needs someone to decide *port / supersede / drop*.

## Stashes (60)

| Class | Count |
|---|---|
| stale WIP - needs owner review | 33 |
| sanity-results snapshot (obsolete data) | 22 |
| untracked-only | 4 |
| already in main | 1 |

Most are `deploy-sync-*` entries: the deploy script stashes whatever is uncommitted in the shared checkout (usually another session's work-in-progress or `SANITY_CHECK_RESULTS.json`) and it is restored afterwards with `git stash apply` — the stash entry is left behind. Nothing has been dropped. A stash was classed *already in main* when its whole diff reverse-applies to current `main`; *stale WIP* when it does not (the code has moved on since).

| Stash commit | Date | Message | Class |
|---|---|---|---|
| `ce80a8484` | 2026-09-26 | On main: deploy-sync-20260926053325 | sanity-results snapshot (obsolete data) |
| `a019ea4d0` | 2026-09-26 | On main: deploy-sync-20260926051607 | sanity-results snapshot (obsolete data) |
| `b85232454` | 2026-09-26 | On main: deploy-sync-20260926050657 | sanity-results snapshot (obsolete data) |
| `588ff5fb0` | 2026-09-26 | On main: deploy-sync-20260926045548 | stale WIP - needs owner review |
| `7af89dc3b` | 2026-09-26 | On main: deploy-sync-20260926044854 | sanity-results snapshot (obsolete data) |
| `49d1fe9a0` | 2026-09-26 | On main: deploy-sync-20260926041243 | sanity-results snapshot (obsolete data) |
| `747b2cfa0` | 2026-09-26 | On main: deploy-sync-20260926031005 | sanity-results snapshot (obsolete data) |
| `a538e4af7` | 2026-09-26 | On main: deploy-sync-20260926024422 | sanity-results snapshot (obsolete data) |
| `7f99bbc67` | 2026-09-26 | On main: deploy-sync-20260926023528 | sanity-results snapshot (obsolete data) |
| `263c0d08a` | 2026-09-25 | On main: deploy-sync-20260925185301 | stale WIP - needs owner review |
| `40a21b12a` | 2026-09-25 | On main: deploy-sync-20260925182416 | stale WIP - needs owner review |
| `976646d0a` | 2026-09-25 | On main: deploy-sync-20260925151223 | stale WIP - needs owner review |
| `11983b491` | 2026-09-25 | On main: deploy-sync-20260925131934 | stale WIP - needs owner review |
| `05b8274b9` | 2026-09-23 | On main: deploy-sync-20260923041515 | sanity-results snapshot (obsolete data) |
| `122283b52` | 2026-09-22 | On main: deploy-sync-20260922140503 | stale WIP - needs owner review |
| `6fd9bfa37` | 2026-09-10 | On main: deploy-sync-20260910101620 | untracked-only |
| `46c52104f` | 2026-09-09 | On main: deploy-sync-20260909040226 | sanity-results snapshot (obsolete data) |
| `d9389fa01` | 2026-09-01 | On main: preserve-unrelated-work-before-prod-deploy-20260901T1403Z | stale WIP - needs owner review |
| `5bc02d995` | 2026-08-17 | On main: deploy-sync-20260817160438 | sanity-results snapshot (obsolete data) |
| `523e4d188` | 2026-08-15 | On main: deploy-sync-20260815111216 | sanity-results snapshot (obsolete data) |
| `77675b005` | 2026-08-14 | On main: deploy-sync-20260814150918 | sanity-results snapshot (obsolete data) |
| `f7f885b7e` | 2026-08-14 | On main: deploy-sync-20260814140712 | sanity-results snapshot (obsolete data) |
| `1db7c47ac` | 2026-08-14 | On main: deploy-sync-20260814135200 | stale WIP - needs owner review |
| `28c3ab2ab` | 2026-08-11 | On main: deploy-sync-20260811053256 | stale WIP - needs owner review |
| `54673448d` | 2026-08-10 | On main: deploy-sync-20260810023954 | sanity-results snapshot (obsolete data) |
| `49bd9a896` | 2026-08-09 | On main: deploy-sync-20260809120710 | sanity-results snapshot (obsolete data) |
| `9af4725fe` | 2026-08-08 | On main: deploy-sync-20260808091334 | sanity-results snapshot (obsolete data) |
| `5cb474d43` | 2026-08-07 | On main: deploy-sync-20260807183649 | already in main |
| `eb7020f38` | 2026-08-07 | On main: deploy-sync-20260807133412 | stale WIP - needs owner review |
| `7d06f0447` | 2026-08-05 | On main: deploy-sync-20260805185155 | sanity-results snapshot (obsolete data) |
| `aa3544143` | 2026-08-02 | On main: deploy-sync-20260802165532 | sanity-results snapshot (obsolete data) |
| `94cc240d7` | 2026-08-01 | On main: deploy-sync-20260801174722 | stale WIP - needs owner review |
| `23e78a3dc` | 2026-08-01 | On main: deploy-sync-20260801121314 | sanity-results snapshot (obsolete data) |
| `85df5e4f2` | 2026-07-30 | On main: deploy-sync-20260730124512 | stale WIP - needs owner review |
| `feab60aff` | 2026-07-29 | On main: deploy-sync-20260729105335 | stale WIP - needs owner review |
| `8be5106f4` | 2026-07-29 | On main: deploy-sync-20260729101954 | untracked-only |
| `635167404` | 2026-07-29 | On main: deploy-sync-20260729080815 | stale WIP - needs owner review |
| `5ef17e608` | 2026-07-13 | On main: deploy-sync-20260713044322 | sanity-results snapshot (obsolete data) |
| `5a159b506` | 2026-07-11 | On main: deploy-sync-20260711141817 | stale WIP - needs owner review |
| `f5a367ab8` | 2026-07-11 | On main: deploy-sync-20260711043251 | stale WIP - needs owner review |
| `6a6c4ef68` | 2026-07-11 | On main: deploy-sync-20260711032145 | stale WIP - needs owner review |
| `d695dbdd6` | 2026-07-10 | On main: deploy-sync-20260710180830 | stale WIP - needs owner review |
| `332367cc3` | 2026-07-10 | On main: deploy-sync-20260710072450 | stale WIP - needs owner review |
| `c152604c8` | 2026-07-09 | On main: deploy-sync-20260709185129 | stale WIP - needs owner review |
| `86b7162da` | 2026-07-08 | On main: deploy-sync-20260708191213 | stale WIP - needs owner review |
| `d85c36d3e` | 2026-07-08 | On ant: deploy-sync-20260708103104 | stale WIP - needs owner review |
| `8cd784f3a` | 2026-07-08 | On ant: deploy-sync-20260708053004 | untracked-only |
| `b22cc369a` | 2026-07-08 | On main: deploy-sync-20260708042533 | stale WIP - needs owner review |
| `d4a901925` | 2026-07-08 | On main: deploy-sync-20260708034357 | sanity-results snapshot (obsolete data) |
| `6044c85cb` | 2026-07-07 | On main: deploy-sync-20260707201515 | stale WIP - needs owner review |
| `00f782e56` | 2026-07-06 | On main: deploy-sync-20260706164819 | stale WIP - needs owner review |
| `e64052526` | 2026-07-06 | On main: deploy-sync-20260706160127 | stale WIP - needs owner review |
| `b9869cda7` | 2026-07-06 | On main: deploy-sync-20260706033703 | stale WIP - needs owner review |
| `c9e00d760` | 2026-07-05 | On main: deploy-sync-20260705160030 | stale WIP - needs owner review |
| `297417724` | 2026-07-05 | On cursor/storage-audit-offsite-backup-a986: deploy-sync-20260705060453 | stale WIP - needs owner review |
| `0a9d68e20` | 2026-06-26 | On main: prod-local-misc-2026-06-26 | stale WIP - needs owner review |
| `05fdc0166` | 2026-02-09 | WIP on main: 2cc6f95 Fix user JWT newline | stale WIP - needs owner review |
| `f475cc4b2` | 2026-02-07 | On main: pre-merge-stash | untracked-only |
| `53494f7d4` | 2026-02-07 | WIP on main: bf6b72a Fix: Add missing useAuth import and hook call to resolve 'currentUser is not defined' error | stale WIP - needs owner review |
| `7161fba88` | 2026-02-06 | WIP on main: f35b9d9 Fix doctor appointment status not updating in UI due to stale query cache | stale WIP - needs owner review |

To recover any of them: `git stash apply <commit>` (or `git branch archive/<name> <commit>` to keep it as a branch).

## Deploy
Production already runs `main` at the latest commit; there was nothing new to deploy from this exercise.
