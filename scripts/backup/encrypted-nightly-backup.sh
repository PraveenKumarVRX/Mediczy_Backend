#!/usr/bin/env bash
# Complete encrypted archive + authenticated key envelope, uploaded without plaintext SQL.
set -euo pipefail
umask 077
ROOT="${ROOT:-/home/ubuntu/Mediczy}"
source "$ROOT/scripts/ops/load-prod-env.sh"
BACKUP_BASE="${ENCRYPTED_BACKUP_DIR:-/var/backups/mediczy-encrypted}"
REGION="${AWS_REGION:-ap-south-1}"
INSTANCE="${RDS_INSTANCE_ID:-mediczy-prod}"
KEY="${RDS_RECOVERY_KMS_KEY_ARN:-arn:aws:kms:ap-south-1:480664947830:key/85b21f1a-078f-4ba3-8311-f79a56a98722}"
BUCKET="${ENCRYPTED_BACKUP_BUCKET:-mediqzy-database-backups-480664947830-ap-south-1}"
mkdir -p "$BACKUP_BASE"
chmod 700 "$BACKUP_BASE"
exec 9>"$BACKUP_BASE/.nightly-backup.lock"
flock -n 9 || exit 0
if [ "${1:-}" = '--upload-existing' ] && [ "$#" -eq 2 ]; then
  ARCHIVE_DIR="$2"
elif [ "$#" -eq 0 ]; then
  ARCHIVE_DIR=$(mktemp -d "$BACKUP_BASE/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  node "$ROOT/server/scripts/ops/database-recovery-dump.mjs" --instance "$INSTANCE" --output-dir "$ARCHIVE_DIR" --kms-key "$KEY"
else
  printf '%s\n' 'Usage: encrypted-nightly-backup.sh [--upload-existing private-archive-directory]' >&2
  exit 2
fi
ARCHIVE_DIR=$(realpath "$ARCHIVE_DIR")
python3 - "$ARCHIVE_DIR" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);r=json.loads((p/'receipt.json').read_text())
assert r['status']=='passed' and 'AES-256-GCM' in r['format']
h=hashlib.sha256()
with (p/'database.dump.enc').open('rb') as f:
 for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
assert h.hexdigest()==r['sha256']
assert (p/'database.dump.key.kms').stat().st_size>0
PY
PREFIX="encrypted-postgres/$(basename "$ARCHIVE_DIR")"
for FILE in database.dump.enc database.dump.key.kms receipt.json; do
  aws s3 cp "$ARCHIVE_DIR/$FILE" "s3://$BUCKET/$PREFIX/$FILE" --sse aws:kms --sse-kms-key-id "$KEY" --region "$REGION" --only-show-errors
  aws s3api head-object --bucket "$BUCKET" --key "$PREFIX/$FILE" --region "$REGION" --query '{bytes:ContentLength,encryption:ServerSideEncryption,key:SSEKMSKeyId,version:VersionId}' --output json > "$ARCHIVE_DIR/$FILE.s3.json"
done
python3 - "$ARCHIVE_DIR" "$BUCKET" "$PREFIX" "$KEY" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]);objects={}
for name in ['database.dump.enc','database.dump.key.kms','receipt.json']:
 r=json.loads((p/(name+'.s3.json')).read_text())
 assert r['bytes']==(p/name).stat().st_size and r['encryption']=='aws:kms' and r['key']==sys.argv[4] and r['version']
 objects[name]=r
r={'status':'passed','bucket':sys.argv[2],'prefix':sys.argv[3],'objects':objects}
(p/'offsite-receipt.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'status':'passed','encryptedOffsiteBackup':'s3://'+sys.argv[2]+'/'+sys.argv[3]}))
PY
