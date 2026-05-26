# Root Shell Script Organization Manifest

Generated: 2026-05-23T08:11:05.710Z

Moved root-level shell scripts: 69

Module-local scripts were intentionally left in place under `client/`, `tests/`, `scribe_service/`, `database_migrations/`, `n8n-setup/`, and pre-existing `scripts/` paths.

Name collisions with existing organized scripts were moved under `scripts/testing/root/` to avoid overwriting existing files.

## Moves

| Original | New path |
| --- | --- |
| `backup-auto-cleanup.sh` | `scripts/backup/backup-auto-cleanup.sh` |
| `backup-cleanup.sh` | `scripts/backup/backup-cleanup.sh` |
| `backup-manager.sh` | `scripts/backup/backup-manager.sh` |
| `build-frontend-aggressive.sh` | `scripts/build/build-frontend-aggressive.sh` |
| `build-frontend-low-mem.sh` | `scripts/build/build-frontend-low-mem.sh` |
| `check-logs.sh` | `scripts/runtime/check-logs.sh` |
| `check-postgres-status.sh` | `scripts/db/check-postgres-status.sh` |
| `clean-disk-emergency.sh` | `scripts/runtime/clean-disk-emergency.sh` |
| `configure-rocketchat-oauth-prod.sh` | `scripts/deploy/configure-rocketchat-oauth-prod.sh` |
| `connect-ec2-db.sh` | `scripts/db/connect-ec2-db.sh` |
| `create-table-auto.sh` | `scripts/db/create-table-auto.sh` |
| `create-table-quick.sh` | `scripts/db/create-table-quick.sh` |
| `db-init-helper.sh` | `scripts/db/db-init-helper.sh` |
| `debug-whatsapp-otp.sh` | `scripts/debug/debug-whatsapp-otp.sh` |
| `demo-vscode-debugger.sh` | `scripts/debug/demo-vscode-debugger.sh` |
| `deploy-api-credentials.sh` | `scripts/deploy/deploy-api-credentials.sh` |
| `deploy-frontend-s3.sh` | `scripts/deploy/deploy-frontend-s3.sh` |
| `deploy-now.sh` | `scripts/deploy/deploy-now.sh` |
| `deploy-prod-simple.sh` | `scripts/deploy/deploy-prod-simple.sh` |
| `deploy-prod-v2.sh` | `scripts/deploy/deploy-prod-v2.sh` |
| `deploy-prod-v3.sh` | `scripts/deploy/deploy-prod-v3.sh` |
| `deploy-to-production.sh` | `scripts/deploy/deploy-to-production.sh` |
| `DEPLOYMENT_READY.sh` | `scripts/deploy/DEPLOYMENT_READY.sh` |
| `diagnose-auth.sh` | `scripts/debug/diagnose-auth.sh` |
| `diagnose-db.sh` | `scripts/debug/diagnose-db.sh` |
| `emergency-restart.sh` | `scripts/runtime/emergency-restart.sh` |
| `fix-database-user.sh` | `scripts/db/fix-database-user.sh` |
| `fix-postgres-connections.sh` | `scripts/db/fix-postgres-connections.sh` |
| `otp-diagnostic.sh` | `scripts/debug/otp-diagnostic.sh` |
| `PATCH_HCS_MEMBERSHIP_VIDEO_FIX.sh` | `scripts/maintenance/PATCH_HCS_MEMBERSHIP_VIDEO_FIX.sh` |
| `pgbouncer-sync.sh` | `scripts/db/pgbouncer-sync.sh` |
| `reset-emergency-credits.sh` | `scripts/maintenance/reset-emergency-credits.sh` |
| `restart-server.sh` | `scripts/runtime/restart-server.sh` |
| `restart.sh` | `scripts/runtime/restart.sh` |
| `ROOM_ID_REFACTOR_TEST.sh` | `scripts/testing/ROOM_ID_REFACTOR_TEST.sh` |
| `sanity-check-appointments.sh` | `scripts/testing/sanity-check-appointments.sh` |
| `sanity-check-video-fix.sh` | `scripts/testing/sanity-check-video-fix.sh` |
| `sanity-smoke-test.sh` | `scripts/testing/sanity-smoke-test.sh` |
| `sanity-test-video.sh` | `scripts/testing/sanity-test-video.sh` |
| `setup-api-credentials-db.sh` | `scripts/db/setup-api-credentials-db.sh` |
| `setup-database.sh` | `scripts/db/setup-database.sh` |
| `smoke_test.sh` | `scripts/testing/root/smoke_test.sh` |
| `smoke-test-prod.sh` | `scripts/testing/smoke-test-prod.sh` |
| `smoke-test.sh` | `scripts/testing/root/smoke-test.sh` |
| `start-debug.sh` | `scripts/runtime/start-debug.sh` |
| `start.sh` | `scripts/runtime/start.sh` |
| `stop.sh` | `scripts/runtime/stop.sh` |
| `test-all-logins.sh` | `scripts/testing/root/test-all-logins.sh` |
| `test-authentication-fixes.sh` | `scripts/testing/root/test-authentication-fixes.sh` |
| `test-both-functions.sh` | `scripts/testing/root/test-both-functions.sh` |
| `test-db-connection.sh` | `scripts/testing/root/test-db-connection.sh` |
| `test-emergency-function.sh` | `scripts/testing/root/test-emergency-function.sh` |
| `test-function-livekit-token.sh` | `scripts/testing/root/test-function-livekit-token.sh` |
| `test-hospital-insurance.sh` | `scripts/testing/root/test-hospital-insurance.sh` |
| `test-membership-video-access.sh` | `scripts/testing/root/test-membership-video-access.sh` |
| `test-mvc-integration.sh` | `scripts/testing/root/test-mvc-integration.sh` |
| `test-new-dept-logins.sh` | `scripts/testing/root/test-new-dept-logins.sh` |
| `test-patient-video-join.sh` | `scripts/testing/root/test-patient-video-join.sh` |
| `test-response-time.sh` | `scripts/testing/root/test-response-time.sh` |
| `test-user-otp.sh` | `scripts/testing/root/test-user-otp.sh` |
| `test-video-call-user-auth.sh` | `scripts/testing/root/test-video-call-user-auth.sh` |
| `test-video-join-endpoint.sh` | `scripts/testing/root/test-video-join-endpoint.sh` |
| `test-wallet-diagnosis.sh` | `scripts/testing/root/test-wallet-diagnosis.sh` |
| `test-whatsapp-otp-flow.sh` | `scripts/testing/root/test-whatsapp-otp-flow.sh` |
| `try-connections.sh` | `scripts/db/try-connections.sh` |
| `tunnel.sh` | `scripts/runtime/tunnel.sh` |
| `uat-quick-setup.sh` | `scripts/deploy/uat-quick-setup.sh` |
| `verify-autocomplete.sh` | `scripts/testing/root/verify-autocomplete.sh` |
| `verify-wallet-fix.sh` | `scripts/testing/root/verify-wallet-fix.sh` |
