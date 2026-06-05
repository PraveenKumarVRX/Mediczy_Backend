# Daily Video Test Cron Runbook (LiveKit Cloud)

This runbook configures a daily, cloud-only video consultation E2E check using:
- `server/tests/run-video-test-daily.sh`
- `server/tests/run-video-test-daily-cron.sh` (wrapper)

## 1) Prepare Env File

```bash
sudo mkdir -p /etc/mediczy
sudo cp /home/ubuntu/Mediczy/server/tests/video-test.env.example /etc/mediczy/video-test.env
sudo chmod 600 /etc/mediczy/video-test.env
sudo vi /etc/mediczy/video-test.env
```

Set real values for:
- `VIDEO_TEST_PATIENT_EMAIL`
- `VIDEO_TEST_PATIENT_PASSWORD`
- `VIDEO_TEST_DOCTOR_EMAIL`
- `VIDEO_TEST_DOCTOR_PASSWORD`

Optional:
- `VIDEO_TEST_ALERT_WEBHOOK`

## 2) Ensure Script Permissions

```bash
chmod +x /home/ubuntu/Mediczy/server/tests/run-video-test-daily.sh
chmod +x /home/ubuntu/Mediczy/server/tests/run-video-test-daily-cron.sh
```

## 3) Validate Manually

```bash
VIDEO_TEST_ENV_FILE=/etc/mediczy/video-test.env \
/home/ubuntu/Mediczy/server/tests/run-video-test-daily-cron.sh
```

Expected:
- backend health check passes
- LiveKit cloud endpoint check passes
- patient and doctor join same room
- final status is pass

## 4) Schedule in Cron (IST)

```bash
crontab -e
```

Add:

```cron
CRON_TZ=Asia/Kolkata
0 3 * * * VIDEO_TEST_ENV_FILE=/etc/mediczy/video-test.env /home/ubuntu/Mediczy/server/tests/run-video-test-daily-cron.sh
```

## 5) Logs and Troubleshooting

Primary logs:
- `/home/ubuntu/Mediczy/logs/video-e2e-test-YYYYMMDD.log`
- `/home/ubuntu/Mediczy/logs/video-test-cron-wrapper.log`

Quick checks:

```bash
tail -n 150 /home/ubuntu/Mediczy/logs/video-test-cron-wrapper.log
tail -n 150 /home/ubuntu/Mediczy/logs/video-e2e-test-$(date +%Y%m%d).log
crontab -l
```

Common issues:
- Missing env file: verify `VIDEO_TEST_ENV_FILE` path.
- Credential failures: confirm all `VIDEO_TEST_*` values.
- Backend unavailable: ensure API server is reachable on `http://localhost:8888/api/health`.
- LiveKit cloud unreachable: check network egress and DNS.

## 6) Optional Failure Alerts

If `VIDEO_TEST_ALERT_WEBHOOK` is present in env, wrapper sends a POST alert on failure.
