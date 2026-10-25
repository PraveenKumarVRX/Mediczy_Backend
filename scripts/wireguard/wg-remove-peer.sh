#!/usr/bin/env bash
# Revoke exactly one previously-provisioned WireGuard peer, hot-reload only.
# See wg-add-peer.sh for why this never restarts/downs the interface.
#
# Usage:
#   sudo scripts/wireguard/wg-remove-peer.sh --ip 10.99.0.7 [--dry-run]
#   sudo scripts/wireguard/wg-remove-peer.sh --name medstar-oncall-drsharma [--dry-run]
#
# Refuses to touch the pre-existing, undocumented, clinically-live peers
# (10.99.0.2, .3, .4, .5) unless --force-production-peer is given AND the
# operator types the exact peer IP back as confirmation.
set -euo pipefail

WG_CONF=/etc/wireguard/wg0.conf
WG_IFACE=wg0
LOCK_FILE=/etc/wireguard/.wg-provision.lock
AUDIT_LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/logs/wireguard-peer-changes.log"
PROTECTED_IPS=("10.99.0.2" "10.99.0.3" "10.99.0.4" "10.99.0.5")

TARGET_IP=""
TARGET_NAME=""
DRY_RUN=0
FORCE_PRODUCTION=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip) TARGET_IP="$2"; shift 2 ;;
    --name) TARGET_NAME="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force-production-peer) FORCE_PRODUCTION=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$TARGET_IP" || -n "$TARGET_NAME" ]] || { echo "ERROR: --ip or --name is required" >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo "ERROR: must run as root (sudo)" >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "ERROR: another wg peer operation is in progress" >&2; exit 1; }

# Locate the matching [Peer] block's starting line, by comment name or AllowedIPs/Address IP.
if [[ -n "$TARGET_NAME" ]]; then
  BLOCK_START=$(grep -n "# added by wg-add-peer.sh .* — ${TARGET_NAME}\$" "$WG_CONF" | tail -1 | cut -d: -f1)
  [[ -n "$BLOCK_START" ]] && BLOCK_START=$((BLOCK_START - 1)) # the [Peer] line is just above the comment
else
  BLOCK_START=$(grep -n "^\[Peer\]" "$WG_CONF" | cut -d: -f1 | while read -r ln; do
    # does this peer block (up to the next [Peer] or EOF) contain the target IP?
    END=$(awk -v start="$ln" 'NR>start && /^\[Peer\]/{print NR-1; exit} END{if(!found) print NR}' "$WG_CONF")
    if sed -n "${ln},${END}p" "$WG_CONF" | grep -q "$TARGET_IP"; then
      echo "$ln"
      break
    fi
  done)
fi

[[ -n "${BLOCK_START:-}" ]] || { echo "ERROR: no matching peer found for ${TARGET_IP:-$TARGET_NAME}" >&2; exit 1; }

BLOCK_END=$(awk -v start="$BLOCK_START" 'NR>start && /^\[Peer\]/{print NR-1; exit} END{if(!found) print NR}' "$WG_CONF")
MATCHED_TEXT=$(sed -n "${BLOCK_START},${BLOCK_END}p" "$WG_CONF")
MATCHED_IP=$(echo "$MATCHED_TEXT" | grep -oE '10\.99\.0\.[0-9]+' | head -1)

for p in "${PROTECTED_IPS[@]}"; do
  if [[ "$MATCHED_IP" == "$p" ]]; then
    if [[ "$FORCE_PRODUCTION" -ne 1 ]]; then
      echo "REFUSED: ${MATCHED_IP} is one of the pre-existing production peers (PACS/GPU) - this tooling will not touch it." >&2
      echo "If you are certain, re-run with --force-production-peer and confirm the IP when prompted." >&2
      exit 1
    fi
    echo "You are about to remove PRODUCTION peer ${MATCHED_IP}. Type the IP to confirm:"
    read -r CONFIRM
    [[ "$CONFIRM" == "$MATCHED_IP" ]] || { echo "Confirmation did not match - aborting." >&2; exit 1; }
  fi
done

echo "--- Peer block to be removed (lines ${BLOCK_START}-${BLOCK_END}) ---"
echo "$MATCHED_TEXT" | grep -vE "PrivateKey|PresharedKey"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "--- DRY RUN: no changes made ---"
  exit 0
fi

BACKUP="${WG_CONF}.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$WG_CONF" "$BACKUP"
echo "Backed up current config to ${BACKUP}"

sed -i "${BLOCK_START},${BLOCK_END}d" "$WG_CONF"

if ! wg-quick strip "$WG_CONF" > /dev/null; then
  echo "ERROR: config failed validation after removal - restoring backup" >&2
  cp -p "$BACKUP" "$WG_CONF"
  exit 1
fi

if ! wg syncconf "$WG_IFACE" <(wg-quick strip "$WG_CONF"); then
  echo "ERROR: wg syncconf failed - restoring backup" >&2
  cp -p "$BACKUP" "$WG_CONF"
  wg syncconf "$WG_IFACE" <(wg-quick strip "$WG_CONF") || true
  exit 1
fi

mkdir -p "$(dirname "$AUDIT_LOG")"
printf '%s\tREMOVE\tip=%s\toperator=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MATCHED_IP" "${SUDO_USER:-$(whoami)}" >> "$AUDIT_LOG"

echo "Removed peer ${MATCHED_IP}."
