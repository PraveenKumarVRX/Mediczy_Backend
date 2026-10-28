# Corporate report upload and storage repair — 28 October 2026

Deployed to `https://app.mediqzy.com` and verified on 28 October 2026. Product merge: `6542acf6`; subsequent server correction: `e3015c86`. Frontend artifact was built from `6542acf6`; the later commit changes only the legacy server upload route.

## Failure and storage destination

The Team pre-employment report upload failed while checking its MinIO bucket. The shared legacy endpoint, `minio.mediqzy.com`, returned HTTP 530. Its credentials also failed against the working PACS endpoint. The old implementation surfaced this as `UnknownError`.

The existing PACS archive configuration provides a working endpoint, matching credentials, and access to the existing private bucket. New report uploads now use that configuration without changing imaging/DICOM storage settings:

- Endpoint: `https://minio-pacs.mediqzy.com`.
- Bucket: `pacs-entity-001`.
- Corporate report objects: `health-reports/corp-<corporateId>/emp-<employeeId>/<timestamp>_<random>_<filename>`.
- Dairy Day is corporate ID 45; Equitas is corporate ID 5.
- Direct employee uploads: encrypted objects under `uploads/reports/<userId>/` in the same configured report bucket.

Corporate and employee folders provide logical separation within the private bucket. Application authorization checks corporate membership and report ownership before issuing download links. New corporate report links expire after 15 minutes and are refreshed when reports are listed or shared. Direct encrypted employee reports are downloaded through the authorized decryption route.

## Changes

- Team batches accept up to 10 files, at most 25 MB each and 50 MB combined, with useful validation and storage error messages.
- A successful batch creates paired `corporate_health_reports` and canonical `reports` records in one database transaction. The employee sees the report, and Team listings show it once.
- Failed batches roll back database changes. Cleanup attempts target only newly uploaded objects. **The current PACS archive writer cannot delete objects**: a later failure may therefore leave unlinked objects that need privileged cleanup. Physical object writes are not transactionally rolled back.
- Notifications run after saving. A batch email includes all report links, and skipped notifications are accurately shown. Sharing checks the selected corporate and refreshes private links.
- Direct employee uploads use PACS with encryption. Storage or antivirus errors cannot fall through to a plaintext local save.
- The legacy `/api/reports/upload` route now saves canonical report records and returns a real saved ID. A database failure returns an error instead of a fabricated success ID.
- Employee self-uploaded encrypted files are excluded from Team corporate report listings; owner-scoped download and analysis use the correct storage client.

## Existing report audit and remaining recovery work

The failed Dairy Day batch created **zero corporate report records**. The original seven files were not available in this workspace and were not re-uploaded. They must be selected and uploaded again through the repaired form.

Equitas has **37 existing corporate report records**, all referencing the unavailable `minio.mediqzy.com` host. These records were preserved. Their file contents were not retrieved or migrated; restoring the old object store/backup or obtaining the originals is still required. Changing their URLs alone would not recover the objects.

Across the general `reports` table, 67 records have non-HTTP or empty URL references. A metadata-only filesystem audit found 22 files at the current local report directory and did not find 45 at the checked paths. Checks covered `uploads/reports/<basename>`, `server/uploads/reports/<basename>`, stored paths relative to the project/server, and absolute stored paths within the project. The 45 are **not confirmed lost**; legacy mounts, other storage roots and backups need review. Existing local files and records were preserved.

## Verification

- 99 focused regression tests passed across 10 suites, including seven-file batches, rollback/error handling, antivirus enforcement, authorization, notifications, direct and legacy report uploads, and prior corporate booking/package fixes.
- Three opt-in production-schema integration tests passed. They exercised the real authenticated multipart seven-file handler and database, verified seven corporate plus seven employee records and a deduplicated listing, then rolled back. Object storage and notifications were mocked in this database test.
- Five live PACS checks passed: correct backend, antivirus plus synthetic upload, exact signed-download bytes, denied anonymous access, and verified archive delete restrictions.
- Ten public API/storage smoke checks passed, including Dairy Day and Equitas lists, employee lists, input validation, unauthorized access, owner isolation, and a signed synthetic download.
- Five browser checks passed: form rendering, selecting seven pre-employment PDFs, multipart submission to the correct endpoint, clearing successful selections, and honest skipped-notification messaging. The browser POST was intercepted; it did not save dummy clinical records.
- Production frontend build passed. Artifact, nginx, S3 and public index hashes match: `2a8dc8669cc1cb3bc407c675a5df3dc7f0f5a5021ee48d7c1ea5b462d112d276`.
- CloudFront invalidation `I9NSLAV7JWW93Z1O7JKRJGK60A` completed. PM2 API reload succeeded; health reports PostgreSQL and Redis connected.

No patient file contents were read, test notifications sent, or dummy report records committed. Two tiny synthetic, non-patient storage probes remain under `_release-smoke/corporate-report-storage/` because the archive credentials deny deletion. Credentials, signed URLs, patient names and report contents are omitted from this document.

Private runtime evidence: `/home/ubuntu/mediqzy-releases/corporate-report-upload-fix-20261028/evidence/`. Frontend artifact: the sibling `client-dist/` directory. Previous frontend index and live source marker were retained with the evidence.
