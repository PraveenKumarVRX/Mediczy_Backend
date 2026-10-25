#!/usr/bin/env bash
set -euo pipefail
cd /mnt/medstar
umask 077
mkdir -p backups
if [[ ! -s secrets/backup-key ]]; then openssl rand -hex 32 > secrets/backup-key; fi
backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="backups/medstar-crm-${backup_stamp}.dump.enc"
backup_partial=$(mktemp backups/.backup-partial.XXXXXX)
trap 'rm -f "$backup_partial"' EXIT
docker compose exec -T db pg_dump -U medstar_owner -d medstar_crm --format=custom --no-owner --no-acl |
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:secrets/backup-key -out "$backup_partial"
mv "$backup_partial" "$backup_path"
sha256sum "$backup_path" > "${backup_path}.sha256"
if [[ -d data/app/communication-attachments ]]; then
 files_path="${backup_path%.dump.enc}.files.tar.enc"
 tar -C data/app -czf - communication-attachments |
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:secrets/backup-key -out "$backup_partial"
 mv "$backup_partial" "$files_path"
 sha256sum "$files_path" > "${files_path}.sha256"
fi
printf '%s\n' "$backup_path"
