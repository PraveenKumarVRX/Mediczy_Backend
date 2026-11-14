#!/usr/bin/env bash
# Publish a prebuilt frontend to the existing Nginx document root.
# Usage: BUILD_DIR=/path/to/prebuilt/dist bash scripts/deploy/deploy-frontend-nginx.sh
# Old hashed assets are retained so existing browser sessions keep working.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${BUILD_DIR:?Set BUILD_DIR to the prepared frontend build directory}"
BUILD_DIR="$(realpath "$BUILD_DIR")"
WEB_ROOT="${WEB_ROOT:-$REPO_ROOT/client/dist}"
WEB_ROOT="$(realpath "$WEB_ROOT")"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/mediczy}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/.deploy/releases/frontend-nginx-$(date -u +%Y%m%dT%H%M%SZ)}"

[[ -s "$BUILD_DIR/index.html" ]] || { echo 'Build index.html is missing'; exit 1; }
[[ -s "$WEB_ROOT/index.html" ]] || { echo 'Existing frontend index.html is missing'; exit 1; }
[[ "$BUILD_DIR" != "$WEB_ROOT" ]] || { echo 'Build and live directories must differ'; exit 1; }
awk '$1 == "root" { gsub(/;/, "", $2); print $2 }' "$NGINX_SITE" | grep -Fx -- "$WEB_ROOT" >/dev/null || {
  echo "The target is not the document root in $NGINX_SITE"; exit 1;
}
exec 9>/tmp/mediqzy-frontend-nginx-deploy.lock
flock -n 9 || { echo 'Another frontend deployment is running'; exit 1; }
sudo -n nginx -t

# Validate entry-point references before changing the live tree.
node --input-type=module - "$BUILD_DIR" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
if (!assets.length) throw new Error('No entry-point assets were found');
for (const asset of assets) {
  if (/^https?:/.test(asset)) throw new Error('Unexpected external entry-point asset');
  const resolved = path.resolve(root, asset.replace(/^\//, ''));
  if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile()) throw new Error('Missing build asset');
}
console.log(`Validated ${assets.length} entry-point assets`);
JS

mkdir -p "$BACKUP_DIR"
cp -p "$WEB_ROOT/index.html" "$BACKUP_DIR/previous-index.html"
PUBLISHED=false
TEMP_INDEX=''
rollback() {
  local result=$?
  trap - ERR
  if [[ "$PUBLISHED" == true ]]; then
    cp "$BACKUP_DIR/previous-index.html" "$WEB_ROOT/.index-rollback.html"
    mv -f "$WEB_ROOT/.index-rollback.html" "$WEB_ROOT/index.html"
    echo 'Deployment failed; restored the previous frontend entry point' >&2
  fi
  [[ -z "$TEMP_INDEX" ]] || rm -f -- "$TEMP_INDEX"
  exit "$result"
}
trap rollback ERR

# Publish assets first. Do not delete old assets or clear the live directory.
rsync -a --exclude='/index.html' "$BUILD_DIR/" "$WEB_ROOT/"
TEMP_INDEX="$(mktemp "$WEB_ROOT/.index-deploy.XXXXXX")"
cp "$BUILD_DIR/index.html" "$TEMP_INDEX"
chmod 644 "$TEMP_INDEX"
mv -f "$TEMP_INDEX" "$WEB_ROOT/index.html"
TEMP_INDEX=''
PUBLISHED=true
sudo -n systemctl reload nginx
curl --fail --silent --show-error --max-time 20 -H 'Host: app.mediqzy.com' \
  http://127.0.0.1/index.html -o "$BACKUP_DIR/deployed-index.html"
cmp "$BUILD_DIR/index.html" "$BACKUP_DIR/deployed-index.html"
sha256sum "$WEB_ROOT/index.html" > "$BACKUP_DIR/index.sha256"
git -C "$REPO_ROOT" rev-parse HEAD > "$BACKUP_DIR/source-sha"
trap - ERR
printf 'Frontend deployed to %s\nRollback entry point: %s/previous-index.html\n' "$WEB_ROOT" "$BACKUP_DIR"
