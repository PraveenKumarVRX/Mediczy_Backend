#!/bin/bash
# Full production deployment: git pull → backend deps → client build → S3 → PM2 restart
#
# Usage:
#   On prod EC2:
#     cd /home/ubuntu/Mediczy && bash scripts/deploy/deploy-full-prod-s3.sh
#
#   From a machine with SSH key (~/.ssh/mediczy.pem):
#     bash scripts/deploy/deploy-full-prod-s3.sh --remote
#
#   Backend-only (skip S3):
#     SKIP_S3=true bash scripts/deploy/deploy-full-prod-s3.sh
#
#   Discard local server commits and match GitHub main exactly:
#     RESET_TO_ORIGIN_MAIN=true bash scripts/deploy/deploy-full-prod-s3.sh
#
#   If git pull fails with "would be overwritten by merge", either run the deploy
#   script (auto-stashes) or reset explicitly:
#     RESET_TO_ORIGIN_MAIN=true bash scripts/deploy/deploy-full-prod-s3.sh
#
#   Build the client off this host (CI already built it) and just ship the artifact:
#     CLIENT_DIST_ARCHIVE=/tmp/client-dist.tar.gz bash scripts/deploy/deploy-full-prod-s3.sh
#   Omit it and the client still builds on-host, exactly as before — this is additive.
#
# AUTOMATIC REVERT (WP-0.6): from the moment the previous commit is recorded, EVERY failure
# point below — including the explicit guard checks, not just command errors bash's own
# "set -e" would catch — calls fail(), which reverts the code to the previous commit,
# reinstalls its dependencies, restarts PM2 on it, and (unless S3 was skipped) restores the
# previous index.html on S3 and invalidates it, so a broken deploy never stays live.
# (A bare `exit 1` inside an `if` block does NOT trigger bash's ERR trap — that's a real bash
# gotcha, not an oversight — which is why every guard below calls fail() explicitly instead of
# exiting directly; the ERR trap on top of that is a safety net for anything unforeseen.)
# Database migrations are NOT auto-rolled back (they are additive-only by convention); a
# migration failure still reverts the CODE, but check the DB by hand before retrying. A
# reverted run still exits non-zero — CI reports it as a failed deploy, which is correct;
# only production's live state was protected.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROD_SERVER="${PROD_SERVER:-ubuntu@13.127.125.93}"
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/mediczy.pem}"
REMOTE_MODE=false
SKIP_S3="${SKIP_S3:-false}"
RESET_TO_ORIGIN_MAIN="${RESET_TO_ORIGIN_MAIN:-false}"

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE_MODE=true ;;
    --skip-s3) SKIP_S3=true ;;
    --reset-to-origin) RESET_TO_ORIGIN_MAIN=true ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── memory preflight (on-host client build only) ─────────────────────────────
# Measured 2026-09-25 (main @ 31a4db9b, vite 5, 7784 modules): a client build peaks at ~4.6GB RSS (~5GB
# with child processes) and takes ~1m45s. On this box the VS Code remote server alone routinely holds 5-7GB,
# and earlyoom starts killing at 8% free (~1.3GB), so a build started with too little headroom gets a process
# killed mid-deploy. Check BEFORE any change is made, so a low-memory box aborts cleanly instead of reverting.
# Skipped for off-host builds (CLIENT_DIST_ARCHIVE). Override: MIN_BUILD_MEM_MB=<n>, or SKIP_MEM_CHECK=true.
check_build_memory() {
  [ -n "${CLIENT_DIST_ARCHIVE:-}" ] && return 0
  [ "${SKIP_MEM_CHECK:-false}" = true ] && return 0
  local need="${MIN_BUILD_MEM_MB:-5500}"
  local avail
  avail="$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  if [ "${avail:-0}" -lt "$need" ]; then
    echo "❌ Only ${avail}MB memory available; an on-host client build needs ~${need}MB. Nothing was changed." >&2
    echo "   Free memory first (top consumers: ps -eo rss,args --sort=-rss | head), e.g. close the VS Code remote" >&2
    echo "   window / language servers, then retry. Or build off-host and pass CLIENT_DIST_ARCHIVE=<tarball>." >&2
    echo "   Override (not recommended): SKIP_MEM_CHECK=true or MIN_BUILD_MEM_MB=<n>." >&2
    return 1
  fi
  echo "✓ Memory preflight: ${avail}MB available (need ~${need}MB for the client build)"
}

ssh_exec() {
  local ssh_args=(-o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=no)
  if [ -f "$SSH_KEY" ]; then
    ssh_args+=(-i "$SSH_KEY")
  fi
  ssh "${ssh_args[@]}" "$PROD_SERVER" "$@"
}

deploy_body() {
  set -euo pipefail
  cd "$PROD_PATH"

  check_build_memory || exit 1

  # ── automatic revert setup (WP-0.6) ─────────────────────────────────────────
  PREV_SHA="$(git rev-parse HEAD)"
  # The revert target must be the commit that is LIVE (recorded in .deploy/current-live-sha after its own health
  # check passed), not HEAD: by this point HEAD is usually already the new code, so reverting to it would just
  # restart the same broken commit. Falls back to HEAD only when nothing has been recorded yet.
  if [ -f "$PROD_PATH/.deploy/current-live-sha" ]; then
    LIVE_SHA="$(tr -d '[:space:]' < "$PROD_PATH/.deploy/current-live-sha")"
    if [ -n "$LIVE_SHA" ] && git cat-file -e "${LIVE_SHA}^{commit}" 2>/dev/null; then
      PREV_SHA="$LIVE_SHA"
    fi
  fi
  [ "$PREV_SHA" != "$(git rev-parse HEAD)" ] && echo -e "${BLUE}ℹ Auto-revert target is the live commit ${PREV_SHA:0:8} (checkout HEAD is $(git rev-parse --short HEAD))${NC}"
  # Recorded so a separate check that only runs AFTER this script exits successfully (e.g. the GitHub Actions
  # workflow's public-endpoint check, which this box's own localhost health check above can't see) still has
  # something to roll back to — see scripts/deploy/rollback.sh.
  mkdir -p "$PROD_PATH/.deploy" 2>/dev/null || true
  echo "$PREV_SHA" > "$PROD_PATH/.deploy/last-good-sha" 2>/dev/null || true
  PREV_INDEX_BACKUP=""
  if [ -f client/dist/index.html ]; then
    PREV_INDEX_BACKUP="$(mktemp -d)/index.html"
    cp client/dist/index.html "$PREV_INDEX_BACKUP"
  fi
  S3_BUCKET="${S3_BUCKET:-s3://app.mediqzy.com}"
  CLOUDFRONT_ID="${CLOUDFRONT_ID:-E1UX9F7HUS472M}"
  REVERTED=false
  do_revert() {
    [ "$REVERTED" = true ] && return 0  # don't re-enter on a second failure while reverting
    REVERTED=true
    echo -e "${RED}⚠ A deploy step failed — reverting to the previous commit ($PREV_SHA)...${NC}" >&2
    git reset --hard "$PREV_SHA" || echo -e "${RED}  git reset itself failed — code may be left in a mixed state, check by hand${NC}" >&2
    (cd server && npm ci --omit=dev --prefer-offline) || echo -e "${RED}  server dependency reinstall failed${NC}" >&2
    pm2 restart mediczy-server --update-env || echo -e "${RED}  pm2 restart failed${NC}" >&2
    if [ -n "$PREV_INDEX_BACKUP" ] && [ -f "$PREV_INDEX_BACKUP" ] && [ "$SKIP_S3" != true ] && command -v aws >/dev/null 2>&1; then
      # Old asset files are never deleted by deploy-frontend-s3.sh (see its "do NOT use --delete" note), so restoring
      # just the entry point is enough to send traffic back to the previous bundle.
      aws s3 cp "$PREV_INDEX_BACKUP" "$S3_BUCKET/index.html" --cache-control "no-cache,no-store,must-revalidate" || true
      aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/index.html" "/" >/dev/null 2>&1 || true
    fi
    echo -e "${RED}Reverted to $(git rev-parse --short HEAD). The failed deploy did NOT stay live.${NC}" >&2
    echo -e "${RED}Database migrations, if any ran this deploy, were NOT rolled back — check by hand before retrying.${NC}" >&2
  }
  # fail(): the single exit point every guard below uses. A bare `exit 1` inside an `if` does NOT
  # trigger the ERR trap in bash, so guard checks call this directly instead of exiting themselves.
  fail() {
    echo -e "${RED}❌ $1${NC}" >&2
    do_revert
    exit 1
  }
  trap do_revert ERR

  echo -e "${BLUE}[1/7] Syncing to origin/main...${NC}"
  bash "$SCRIPT_DIR/sync-git-main.sh"
  HEAD_SHA="$(git rev-parse --short HEAD)"
  echo -e "${GREEN}✓ Code updated ($HEAD_SHA)${NC}"
  if ! git merge-base --is-ancestor c0bd4174 HEAD 2>/dev/null; then
    fail "Welcome-campaign fix (c0bd4174) not in checked-out commit — pull main or merge the fix first."
  fi

  echo -e "${BLUE}[2/7] Installing server dependencies...${NC}"
  (cd server && npm ci --omit=dev --prefer-offline)
  echo -e "${GREEN}✓ Server dependencies installed${NC}"

  echo -e "${BLUE}[2.5/7] Applying CRM database migrations...${NC}"
  NODE_ENV=production AWS_REGION="${AWS_REGION:-ap-south-1}" SSM_PARAM_PATH="${SSM_PARAM_PATH:-/mediczy/prod}" \
    node server/scripts/ssm-env-loader.mjs server/scripts/migrate-crm-all.mjs
  echo -e "${GREEN}✓ CRM database migrations applied${NC}"

  echo -e "${BLUE}[3/7] Building client...${NC}"
  if [ -n "${CLIENT_DIST_ARCHIVE:-}" ]; then
    # Off-host build (WP-0.6 "remove build-on-host"): CI already ran `vite build` on its own runner and handed us the
    # tarball, so this box — which is serving live traffic — never runs the heavy, memory-hungry client build itself.
    [ -f "$CLIENT_DIST_ARCHIVE" ] || fail "CLIENT_DIST_ARCHIVE=$CLIENT_DIST_ARCHIVE not found"
    rm -rf client/dist
    mkdir -p client/dist
    tar -xzf "$CLIENT_DIST_ARCHIVE" -C client/dist
    [ -f client/dist/index.html ] || fail "$CLIENT_DIST_ARCHIVE did not contain an index.html at its root"
    echo -e "${GREEN}✓ Client build extracted from prebuilt archive (built off-host)${NC}"
  else
    (
      cd client
      export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
      # vite/tailwind/typescript are devDependencies — must install even when NODE_ENV=production
      rm -rf node_modules
      NODE_ENV=development npm ci --include=dev --prefer-offline
      if [ ! -x node_modules/.bin/vite ]; then
        echo -e "${RED}❌ vite missing after npm ci (devDependencies not installed)${NC}"
        echo -e "${RED}   Retry: cd client && rm -rf node_modules && NODE_ENV=development npm ci --include=dev${NC}"
        exit 1
      fi
      npm run build
    )
    echo -e "${GREEN}✓ Client build complete (on-host — pass CLIENT_DIST_ARCHIVE to build off-host instead)${NC}"
  fi
  TEAM_BUNDLE="$(ls client/dist/assets/TeamCorporateManagement-*.js 2>/dev/null | xargs -n1 basename | head -1 || true)"
  INDEX_BUNDLE="$(ls client/dist/assets/index-*.js 2>/dev/null | grep -v 'index.es' | xargs -n1 basename | head -1 || true)"
  echo -e "${GREEN}  index bundle: ${INDEX_BUNDLE:-unknown}${NC}"
  echo -e "${GREEN}  team bundle:  ${TEAM_BUNDLE:-unknown}${NC}"
  if [ "$TEAM_BUNDLE" = "TeamCorporateManagement-h5kXIWw0.js" ]; then
    fail "Build still produced stale TeamCorporateManagement hash — aborting S3 upload"
  fi

  if [ "$SKIP_S3" != true ]; then
    echo -e "${BLUE}[4/7] Deploying frontend to S3 + CloudFront...${NC}"
    command -v aws >/dev/null 2>&1 || fail "aws CLI not found — install AWS CLI or set SKIP_S3=true"
    bash scripts/deploy/deploy-frontend-s3.sh
    echo -e "${GREEN}✓ S3 deployment complete${NC}"
  else
    echo -e "${YELLOW}[4/7] Skipping S3 (SKIP_S3=true)${NC}"
  fi

  echo -e "${BLUE}[5/7] Restarting backend (PM2)...${NC}"
  pm2 restart mediczy-server --update-env
  pm2 save --force 2>/dev/null || true
  echo -e "${GREEN}✓ Backend restarted${NC}"

  echo -e "${BLUE}[5.5/7] Verifying CRM API route contract...${NC}"
  bash scripts/deploy/verify-crm-api-contract.sh

  echo -e "${BLUE}[6/7] Health check (this gates the deploy — failure here reverts automatically)...${NC}"
  HEALTHY=false
  for i in 1 2 3 4 5; do
    sleep 4
    if curl -sf http://localhost:8888/api/health >/dev/null 2>&1 || curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
      HEALTHY=true
      break
    fi
    echo -e "${YELLOW}  attempt $i/5 not healthy yet, retrying...${NC}"
  done
  [ "$HEALTHY" = true ] || fail "Health check failed after 5 attempts"
  echo -e "${GREEN}✓ Health check passed${NC}"
  git rev-parse HEAD > "$PROD_PATH/.deploy/current-live-sha" 2>/dev/null || true

  if [ "$SKIP_S3" != true ] && [ -f "$SCRIPT_DIR/verify-prod-bundle.sh" ]; then
    echo -e "${BLUE}[7/7] Verifying live S3 bundle...${NC}"
    sleep 15
    bash "$SCRIPT_DIR/verify-prod-bundle.sh" || true
  fi

  # Past this point the new release is healthy and live; a later, unrelated failure (e.g. the summary echo below)
  # should not trigger a revert of a deploy that already succeeded.
  trap - ERR
}

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Mediczy Full Prod + S3 Deployment    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

if [ "$REMOTE_MODE" = true ]; then
  echo "Mode: remote → $PROD_SERVER"
  echo "Path: $PROD_PATH"
  echo ""
  ssh_exec "SKIP_S3='$SKIP_S3' RESET_TO_ORIGIN_MAIN='$RESET_TO_ORIGIN_MAIN' PROD_PATH='$PROD_PATH' CLIENT_DIST_ARCHIVE='${CLIENT_DIST_ARCHIVE:-}' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
SKIP_S3="${SKIP_S3:-false}"
RESET_TO_ORIGIN_MAIN="${RESET_TO_ORIGIN_MAIN:-false}"
cd "$PROD_PATH"

# memory preflight, mirrors check_build_memory() above (runs before any change is made)
if [ -z "${CLIENT_DIST_ARCHIVE:-}" ] && [ "${SKIP_MEM_CHECK:-false}" != true ]; then
  NEED="${MIN_BUILD_MEM_MB:-5500}"
  AVAIL="$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  if [ "${AVAIL:-0}" -lt "$NEED" ]; then
    echo "❌ Only ${AVAIL}MB memory available; an on-host client build needs ~${NEED}MB. Nothing was changed." >&2
    exit 1
  fi
fi

# ── automatic revert setup (WP-0.6), mirrors deploy_body() above ────────────
PREV_SHA="$(git rev-parse HEAD)"
# Revert target = the commit that is LIVE (.deploy/current-live-sha, written after its health check passed), not
# HEAD — see deploy_body() above.
if [ -f "$PROD_PATH/.deploy/current-live-sha" ]; then
  LIVE_SHA="$(tr -d '[:space:]' < "$PROD_PATH/.deploy/current-live-sha")"
  if [ -n "$LIVE_SHA" ] && git cat-file -e "${LIVE_SHA}^{commit}" 2>/dev/null; then
    PREV_SHA="$LIVE_SHA"
  fi
fi
mkdir -p "$PROD_PATH/.deploy" 2>/dev/null || true
echo "$PREV_SHA" > "$PROD_PATH/.deploy/last-good-sha" 2>/dev/null || true
PREV_INDEX_BACKUP=""
if [ -f client/dist/index.html ]; then
  PREV_INDEX_BACKUP="$(mktemp -d)/index.html"
  cp client/dist/index.html "$PREV_INDEX_BACKUP"
fi
S3_BUCKET="${S3_BUCKET:-s3://app.mediqzy.com}"
CLOUDFRONT_ID="${CLOUDFRONT_ID:-E1UX9F7HUS472M}"
REVERTED=false
do_revert() {
  [ "$REVERTED" = true ] && return 0
  REVERTED=true
  echo "⚠ A deploy step failed — reverting to the previous commit ($PREV_SHA)..." >&2
  git reset --hard "$PREV_SHA" || echo "  git reset itself failed — check by hand" >&2
  (cd server && npm ci --omit=dev --prefer-offline) || echo "  server dependency reinstall failed" >&2
  pm2 restart mediczy-server --update-env || echo "  pm2 restart failed" >&2
  if [ -n "$PREV_INDEX_BACKUP" ] && [ -f "$PREV_INDEX_BACKUP" ] && [ "$SKIP_S3" != true ] && command -v aws >/dev/null 2>&1; then
    aws s3 cp "$PREV_INDEX_BACKUP" "$S3_BUCKET/index.html" --cache-control "no-cache,no-store,must-revalidate" || true
    aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/index.html" "/" >/dev/null 2>&1 || true
  fi
  echo "Reverted to $(git rev-parse --short HEAD). The failed deploy did NOT stay live." >&2
  echo "Database migrations, if any ran this deploy, were NOT rolled back — check by hand before retrying." >&2
}
fail() {
  echo "❌ $1" >&2
  do_revert
  exit 1
}
trap do_revert ERR

echo "[1/7] Syncing to origin/main..."
RESET_TO_ORIGIN_MAIN="$RESET_TO_ORIGIN_MAIN" bash scripts/deploy/sync-git-main.sh
HEAD_SHA="$(git rev-parse --short HEAD)"
echo "✓ Code updated ($HEAD_SHA)"
git merge-base --is-ancestor c0bd4174 HEAD 2>/dev/null || fail "Welcome-campaign fix (c0bd4174) not in HEAD"

echo "[2/7] Installing server dependencies..."
(cd server && npm ci --omit=dev --prefer-offline)
echo "✓ Server dependencies installed"

echo "[2.5/7] Applying CRM database migrations..."
NODE_ENV=production AWS_REGION="${AWS_REGION:-ap-south-1}" SSM_PARAM_PATH="${SSM_PARAM_PATH:-/mediczy/prod}" \
    node server/scripts/ssm-env-loader.mjs server/scripts/migrate-crm-all.mjs
echo "✓ CRM database migrations applied"

echo "[3/7] Building client..."
if [ -n "${CLIENT_DIST_ARCHIVE:-}" ]; then
  [ -f "$CLIENT_DIST_ARCHIVE" ] || fail "CLIENT_DIST_ARCHIVE=$CLIENT_DIST_ARCHIVE not found"
  rm -rf client/dist
  mkdir -p client/dist
  tar -xzf "$CLIENT_DIST_ARCHIVE" -C client/dist
  [ -f client/dist/index.html ] || fail "archive had no index.html at its root"
  echo "✓ Client build extracted from prebuilt archive (built off-host)"
else
  (
    cd client
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
    rm -rf node_modules
    NODE_ENV=development npm ci --include=dev --prefer-offline
    if [ ! -x node_modules/.bin/vite ]; then
      echo "❌ vite missing after npm ci"
      exit 1
    fi
    npm run build
  )
  echo "✓ Client build complete (on-host)"
fi
TEAM_BUNDLE="$(ls client/dist/assets/TeamCorporateManagement-*.js 2>/dev/null | xargs -n1 basename | head -1 || true)"
INDEX_BUNDLE="$(ls client/dist/assets/index-*.js 2>/dev/null | grep -v 'index.es' | xargs -n1 basename | head -1 || true)"
echo "  index bundle: ${INDEX_BUNDLE:-unknown}"
echo "  team bundle:  ${TEAM_BUNDLE:-unknown}"
[ "$TEAM_BUNDLE" != "TeamCorporateManagement-h5kXIWw0.js" ] || fail "Stale bundle hash"

if [ "$SKIP_S3" != true ]; then
  echo "[4/7] Deploying frontend to S3 + CloudFront..."
  command -v aws >/dev/null 2>&1 || fail "aws CLI not found"
  bash scripts/deploy/deploy-frontend-s3.sh
  echo "✓ S3 deployment complete"
else
  echo "[4/7] Skipping S3"
fi

echo "[5/7] Restarting backend..."
pm2 restart mediczy-server --update-env
pm2 save --force 2>/dev/null || true
echo "✓ Backend restarted"

echo "[5.5/7] Verifying CRM API route contract..."
bash scripts/deploy/verify-crm-api-contract.sh

echo "[6/7] Health check (this gates the deploy — failure here reverts automatically)..."
HEALTHY=false
for i in 1 2 3 4 5; do
  sleep 4
  if curl -sf http://localhost:8888/api/health >/dev/null 2>&1 || curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  echo "  attempt $i/5 not healthy yet, retrying..."
done
[ "$HEALTHY" = true ] || fail "Health check failed after 5 attempts"
echo "✓ Health check passed"
git rev-parse HEAD > "$PROD_PATH/.deploy/current-live-sha" 2>/dev/null || true
if [ "$SKIP_S3" != true ] && [ -f scripts/deploy/verify-prod-bundle.sh ]; then
  echo "[7/7] Verifying live S3 bundle..."
  sleep 15
  bash scripts/deploy/verify-prod-bundle.sh || true
fi
trap - ERR
REMOTE_SCRIPT
else
  if [ ! -d "$PROD_PATH" ] && [ -d "$REPO_ROOT/.git" ]; then
    PROD_PATH="$REPO_ROOT"
  fi
  if [ ! -d "$PROD_PATH/.git" ]; then
    echo -e "${RED}❌ Not on production server and --remote not set.${NC}"
    echo "Run: bash scripts/deploy/deploy-full-prod-s3.sh --remote"
    exit 1
  fi
  echo "Mode: local → $PROD_PATH"
  echo ""
  PROD_PATH="$PROD_PATH" deploy_body
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Complete! 🚀            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo -e "${BLUE}🌐 https://app.mediqzy.com${NC}"
