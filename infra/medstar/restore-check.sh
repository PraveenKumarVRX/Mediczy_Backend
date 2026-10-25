#!/usr/bin/env bash
set -euo pipefail
cd /mnt/medstar
umask 077
backup_path=$(find backups -maxdepth 1 -name 'medstar-crm-*.dump.enc' -type f | sort | tail -1)
[[ -n "$backup_path" ]] || { echo 'No backup found'; exit 1; }
sha256sum -c "${backup_path}.sha256"
restore_files=$(mktemp -d /mnt/medstar/backups/.restore-files.XXXXXX)
restore_db="medstar_restorecheck_$(date -u +%H%M%S)"
docker compose exec -T db createdb -U medstar_owner "$restore_db"
trap 'docker compose exec -T db dropdb -U medstar_owner "$restore_db"; rm -rf "$restore_files"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:secrets/backup-key -in "$backup_path" |
 docker compose exec -T db pg_restore -U medstar_owner -d "$restore_db" --no-owner --no-acl --exit-on-error
verified=$(docker compose exec -T db psql -U medstar_owner -d "$restore_db" -Atc "SELECT count(*) FROM tenants WHERE unique_id='H98VG4';")
[[ "$verified" == '1' ]]
files_path="${backup_path%.dump.enc}.files.tar.enc"
if [[ -f "$files_path" ]]; then
 sha256sum -c "${files_path}.sha256"
 openssl enc -d -aes-256-cbc -pbkdf2 -pass file:secrets/backup-key -in "$files_path" |
  tar -xzf - --no-same-owner --no-same-permissions -C "$restore_files"
 docker compose exec -T db psql -U medstar_owner -d "$restore_db" -At -F $'\t' -c 'SELECT tenant_uid,id,bytes FROM communication_workspace_attachments' > "$restore_files/metadata.tsv"
 python3 - "$restore_files" <<'PYFILES'
import pathlib,sys,hashlib,uuid
root=pathlib.Path(sys.argv[1]);count=0
for line in (root/'metadata.tsv').read_text().splitlines():
 tenant,identity,size=line.split('\t');identity=str(uuid.UUID(identity))
 file=root/'communication-attachments'/hashlib.sha256(tenant.encode()).hexdigest()/identity
 if not file.is_file() or file.stat().st_size!=int(size):raise SystemExit('Attachment restore verification failed')
 count+=1
print('Attachment restore verified:',count,'files')
PYFILES
fi
echo 'Encrypted backup restored and tenant identity verified in disposable database'
