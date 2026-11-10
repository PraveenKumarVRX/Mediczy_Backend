# Evidence package: Medcore vs Mediqzy Hospital

Read the [main audit](../MEDCORE_MEDIQZY_HOSPITAL_MICRO_AUDIT_2026-11-08.md) first. This package supports 31 findings and a comparison map of all 133 non-test Medcore API route modules across 47 domains. The audit inventories the complete tracked trees and then performs targeted source tracing; it does not claim to have manually reviewed every line or executed every endpoint.

## Frozen revisions

- Medcore: `2031184e6418a32eb518ad44eaf13cf91d0e937a` from `https://github.com/Globussoft-Technologies/medcore`.
- Mediqzy: `cc7008b9be90e714c4e2220910ae45e09a6cb0c2` from the local repository, remote `https://github.com/MySmartHealth/Mediczy`.
- Mediqzy main advanced during review to `02fce3d10ce9ac4aa497e1a6b7c43a53da85128a`, changing only the unrelated migration runner. Product-source evidence remains pinned to the original snapshot.

## Files

| Artifact | Purpose |
|---|---|
| `coverage-matrix.md` | Human-readable domain comparison with commit-pinned source links and residual questions. |
| `module-coverage.csv` | Every Medcore route source module assigned to a domain and Mediqzy counterpart assessment. |
| `gap-register.csv`, `findings.json` | Identical finding content in importable formats: evidence status, owner, impact and acceptance criteria. |
| `*-files.csv` | All tracked files with sizes and coarse test-path classification. No file contents or credentials. |
| `*-routes.csv` | Literal method/path declarations, source file and line. |
| `*-mounts.csv` | Literal router/app mount paths and source lines. |
| `*-models.csv` | Prisma model declarations only. Mediqzy SQL/Sequelize schemas are not represented by this count. |
| `inventory-summary.json` | Counts and snapshot commits. |
| `counterpart-search.csv` | Initial missing-feature search matches. |
| `counterpart-search-extended.csv` | Additional synonyms, counterexamples and follow-up search matches. |
| `reproduce.mjs`, `reproduction-results.json` | Offline evaluations of six failure paths in actual Mediqzy source with mocked persistence/providers. |
| `inventory.py` | Standard-library script to regenerate source inventories. |

## Inventory method

The script enumerates tracked paths with `git ls-files -z`, preserving unusual filenames. It collects literal `.get/.post/.put/.patch/.delete/.head/.options` declarations and quoted `.use` mounts in route files and app/index entry files, skipping files classified as tests. It does not parse an AST or fully resolve nested mounts, imported routers, dynamically generated routes, middleware ordering, feature flags, commented-out calls, or deployment configuration. Therefore declaration counts are not live endpoint counts. Receiver names are retained so non-router method calls can be distinguished.

Test-file classification uses `.test.`, `.spec.`, and test-directory names. Fixtures and snapshots under those directories count; a file count cannot be interpreted as executed tests, assertions, coverage percentage or release quality. Next page counts are architecture-specific. Model counts include Prisma only and must not be used to rank schema breadth across these differently structured repositories.

The complete inventory covers mobile and shared/package sources as well as hospital web/API code. Detailed findings focus on hospital operations. Mobile navigation/device execution, cloud infrastructure, third-party partner systems and every shared-library function are not certified by this review.

## Counterpart search and tracing

Initial searches covered executable JavaScript/TypeScript/SQL under Mediqzy `server/` and `client/src/`, including routes, controllers, services, models, migrations and screens. Keywords included partograph/postnatal/antenatal, growth/milestones/feeding, clinical patient merge, installments, coordinated visits, waitlist, advance directives and belongings. Extended searches included alternative spellings and names such as obstetric/gestation, patient deduplication, payment schedules/EMI, resuscitation/code status, personal effects/valuables and linked appointments.

Search hits were examined as counterevidence: a CRM lead merge was not classified as clinical patient merge; a QMS board was not classified as coordinated serial booking; a compliance checklist was not classified as a patient directive; an immunization display was not classified as a longitudinal pediatric subsystem. Names alone never prove functionality. “Not found” is bounded to the checked snapshots and reviewed search evidence, not all possible external systems.

For existing features, the audit traced mounted page → form payload → route/middleware → service → SQL/model → transition/delivery result. Relevant source tests and CI policy were inspected. No source-wide absence of tenant filtering was inferred merely from SQL without a WHERE clause: scoped database handles and RLS were considered, and F19 is explicitly unresolved pending integration execution.

## Re-run the offline reproductions

Use detached, clean snapshots at the commits above. Substitute the actual local directory paths:

```bash
node docs/audits/medcore-comparison-2026-11-08/reproduce.mjs /path/to/mediqzy-snapshot
python3 docs/audits/medcore-comparison-2026-11-08/inventory.py /path/to/medcore-snapshot /path/to/mediqzy-snapshot /tmp/hospital-audit-inventory
```

The harness checks the Mediqzy commit before proceeding. It uses Node built-ins, reads selected source, removes application imports, and evaluates it in VM contexts with in-memory query/provider adapters. The blood handler is extracted between explicit route markers. It cannot establish real DB constraints, auth/RLS middleware behavior, provider behavior or browser routing. No dependency installation is required. It does not connect a database or execute migrations.

Expected historical outcome: six observations labelled `observed`, corresponding to R01–R06 in the main report. **These assertions reproduce bugs; they are not desired acceptance behavior.** After remediation, create normal regression tests for the corrected behavior on the new revision rather than changing this historical snapshot harness to claim a pass.

## Review boundaries

No production records were read, no real notifications were sent, and no product source was changed by this audit. It does not certify clinical algorithms, medical-device interoperability, legal compliance, deployed feature availability, external delivery or a production release. Medcore's own stubs and concurrency limitations are identified in the main report; the benchmark is not presumed correct. No Medcore implementation was imported.
