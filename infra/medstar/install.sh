#!/usr/bin/env bash
# Run on the verified Medstar host after its private configuration and release are staged.
set -euo pipefail
cd /mnt/medstar
metadata_token=$(curl --fail --silent --max-time 3 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
instance_id=$(curl --fail --silent --max-time 3 -H "X-aws-ec2-metadata-token: $metadata_token" http://169.254.169.254/latest/meta-data/instance-id)
[[ "$instance_id" == i-0cffa2fecc806bf27 ]] || { echo 'Wrong target instance'; exit 1; }
for file in .env secrets/app.env secrets/owner-password secrets/bootstrap-admin.json secrets/db-tls/ca.crt install/schema.sql; do
 [[ -s "$file" ]] || { echo "Missing required installation file: $file"; exit 1; }
done
docker compose config --quiet
docker compose up -d db redis
for attempt in $(seq 1 30); do
 if docker compose exec -T db pg_isready -U medstar_owner -d medstar_crm >/dev/null; then break; fi
 sleep 1
done
ledger=$(docker compose exec -T db psql -U medstar_owner -d medstar_crm -Atc "SELECT to_regclass('public.crm_installation_versions') IS NOT NULL;")
if [[ "$ledger" != t ]]; then
 tables=$(docker compose exec -T db psql -U medstar_owner -d medstar_crm -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
 [[ "$tables" == 0 ]] || { echo 'Untracked existing database: refuse automatic schema replacement'; exit 1; }
 docker compose exec -T db psql -U medstar_owner -d medstar_crm -v ON_ERROR_STOP=1 --single-transaction -f /install/schema.sql
fi
docker compose build api
docker compose run --rm --no-deps \
 -v /mnt/medstar/secrets/owner-password:/run/bootstrap/owner-password:ro \
 -v /mnt/medstar/secrets/bootstrap-admin.json:/run/bootstrap/admin.json:ro \
 api node installations/crm/bootstrap.mjs
docker compose up -d api web
