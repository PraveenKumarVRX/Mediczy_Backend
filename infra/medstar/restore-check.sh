#!/usr/bin/env bash
set -euo pipefail
cd /mnt/medstar
backup_path=$(find backups -maxdepth 1 -name 'medstar-crm-*.dump.enc' -type f | sort | tail -1)
[[ -n "$backup_path" ]] || { echo 'No backup found'; exit 1; }
restore_db="medstar_restorecheck_$(date -u +%H%M%S)"
docker compose exec -T db createdb -U medstar_owner "$restore_db"
trap 'docker compose exec -T db dropdb -U medstar_owner "$restore_db"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:secrets/backup-key -in "$backup_path" |
 docker compose exec -T db pg_restore -U medstar_owner -d "$restore_db" --no-owner --no-acl --exit-on-error
verified=$(docker compose exec -T db psql -U medstar_owner -d "$restore_db" -Atc "SELECT count(*) FROM tenants WHERE unique_id='H98VG4';")
[[ "$verified" == '1' ]]
echo 'Encrypted backup restored and tenant identity verified in disposable database'
