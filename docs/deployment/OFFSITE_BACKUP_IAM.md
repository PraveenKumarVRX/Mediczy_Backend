# Off-host backup: IAM fix and verification

**Status (2026-09-21):** the nightly upload to `s3://mediczy-backups/db/…` fails with `AccessDenied`. The uploader
runs as the EC2 instance role and that role has no identity-based policy allowing `s3:PutObject`:

```
arn:aws:sts::<account>:assumed-role/EC2-SSM-Role/i-…  is not authorized to perform: s3:PutObject
on resource: arn:aws:s3:::mediczy-backups/db/2026-09-21/mediczy_prod.sql.gz
```
Until this is fixed there is **no current off-host copy** of the database. Local dumps exist in `/var/backups/mediczy`
(7 days) on the same host, so a host or disk loss would lose the data and the backups together.

## 1. Attach a least-privilege policy to the instance role (needs an AWS administrator)
Role: `EC2-SSM-Role`. Policy (inline or customer-managed), replacing nothing that exists:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "WriteDatabaseBackups", "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::mediczy-backups/db/*" },
    { "Sid": "ListBackupPrefix", "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::mediczy-backups",
      "Condition": { "StringLike": { "s3:prefix": ["db/*"] } } }
  ]
}
```
- Deliberately **no** `s3:DeleteObject` or `s3:GetObject`: a compromised host must not be able to erase or read old backups.
  Retention belongs in a bucket lifecycle rule (below), not in the uploader.
- If the bucket uses SSE-KMS, also allow `kms:GenerateDataKey` and `kms:Encrypt` on that key.
- The bucket policy must not have an explicit deny that overrides this.

## 2. Bucket settings to confirm
Versioning on; default encryption on (backups are currently unencrypted at rest on the host too); block public access on;
a lifecycle rule whose prefix is `db/` (the audit recorded a rule pointing at the wrong prefix); optionally S3 Object Lock
(compliance mode) so that even a compromised credential cannot delete recent backups.

## 3. Verify (as the same identity the cron uses, i.e. the instance role)
```bash
sudo bash /home/ubuntu/Mediczy/scripts/backup/daily-offsite-backup.sh --upload-local-only
aws s3 ls s3://mediczy-backups/db/ --recursive | tail -3
```
Then install the freshness check **in root's crontab** (same identity as the uploader, otherwise it tests a different
permission set than the one that matters):
```
30 4 * * * /home/ubuntu/Mediczy/scripts/backup/check-offsite-freshness.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1
```
Set `SLACK_WEBHOOK_URL` and/or `PAGERDUTY_ROUTING_KEY` in that crontab's environment so a failure reaches a person.
The check fails when the newest object is missing, under 1 MB, or older than 26 hours; `scripts/health-check.sh` reads its result.

## 4. Root access keys on the server (act on this)
`aws sts get-caller-identity` run from the `ubuntu` shell on this host returns the **account root user**. Root access keys
on a server are the highest-impact credential an account can have: anyone who reads them controls billing, IAM and all data.
1. Confirm where they are configured (the AWS shared credentials file for the `ubuntu` user).
2. Create an IAM role or a scoped IAM user for anything that genuinely needs CLI access from this host.
3. Delete the root access keys in the AWS console (Security credentials → Access keys) and remove them from the host.
4. Enable MFA on the root user.
5. Check CloudTrail for any use of those keys that you do not recognise before rotating.

## 5. Restore drill (never yet run)
Restore the newest dump into a scratch database, compare row counts for the RLS-protected tables against production,
then drop it. Do this monthly and record the result. See `POSTGRES_BACKUP_RESTORE_RUNBOOK.md`.
