#!/usr/bin/env bash
# Add exactly one new peer to the live WireGuard hub (wg0) without ever touching
# existing peer blocks, and apply it with a HOT RELOAD ONLY.
#
# This hub carries live clinical traffic today (a hospital PACS/DICOM imaging
# feed on peer 10.99.0.3 and a GPU inference workstation on 10.99.0.4/.5).
# `systemctl restart wg-quick@wg0` or `wg-quick down`/`up` would tear down and
# re-establish every tunnel at once, risking a dropped in-flight DICOM transfer.
# This script therefore only ever appends to the config and applies via
# `wg syncconf`, which updates the running interface without a restart.
#
# Usage:
#   sudo scripts/wireguard/wg-add-peer.sh --name <label> --allowed-ips <cidr[,cidr...]> [--ip 10.99.0.N] [--no-psk] [--dry-run]
set -euo pipefail

WG_CONF=/etc/wireguard/wg0.conf
WG_IFACE=wg0
PEERS_DIR=/etc/wireguard/peers
LOCK_FILE=/etc/wireguard/.wg-provision.lock
AUDIT_LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/logs/wireguard-peer-changes.log"

NAME=""
ALLOWED_IPS=""
EXPLICIT_IP=""
WANT_PSK=1
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --allowed-ips) ALLOWED_IPS="$2"; shift 2 ;;
    --ip) EXPLICIT_IP="$2"; shift 2 ;;
    --no-psk) WANT_PSK=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$NAME" ]] || { echo "ERROR: --name is required" >&2; exit 1; }
[[ -n "$ALLOWED_IPS" ]] || { echo "ERROR: --allowed-ips is required (e.g. 10.99.0.6/32)" >&2; exit 1; }
if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9-]{1,62}$ ]]; then
  echo "ERROR: --name must be lowercase alphanumeric/hyphen (got: $NAME)" >&2; exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must run as root (sudo) - wg0.conf is root-only" >&2; exit 1
fi

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "ERROR: another wg peer operation is in progress" >&2; exit 1; }

pick_next_ip() {
  local used
  used=$(grep -oE '10\.99\.0\.[0-9]+' "$WG_CONF" | awk -F. '{print $4}' | sort -n -u)
  for n in $(seq 2 254); do
    if ! grep -qx "$n" <<<"$used"; then
      echo "10.99.0.$n"
      return 0
    fi
  done
  echo "ERROR: no free address in 10.99.0.0/24" >&2
  return 1
}

if [[ -n "$EXPLICIT_IP" ]]; then
  PEER_IP="$EXPLICIT_IP"
  if grep -q "${PEER_IP}/32\|${PEER_IP} " "$WG_CONF"; then
    echo "ERROR: $PEER_IP already appears in $WG_CONF - pick another or omit --ip" >&2
    exit 1
  fi
else
  PEER_IP="$(pick_next_ip)"
fi

echo "Assigning peer address: ${PEER_IP}/32"

mkdir -p -m 700 "$PEERS_DIR"
umask 077
PRIV_KEY="$(wg genkey)"
PUB_KEY="$(echo "$PRIV_KEY" | wg pubkey)"
PSK=""
if [[ "$WANT_PSK" -eq 1 ]]; then
  PSK="$(wg genpsk)"
fi

echo "$PRIV_KEY" > "${PEERS_DIR}/${NAME}.key"
echo "$PUB_KEY" > "${PEERS_DIR}/${NAME}.pub"
[[ -n "$PSK" ]] && echo "$PSK" > "${PEERS_DIR}/${NAME}.psk"
chmod 600 "${PEERS_DIR}/${NAME}".key "${PEERS_DIR}/${NAME}".pub 2>/dev/null || true
[[ -n "$PSK" ]] && chmod 600 "${PEERS_DIR}/${NAME}.psk"

PEER_BLOCK=$(cat <<EOF

[Peer]
# added by wg-add-peer.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) — ${NAME}
PublicKey = ${PUB_KEY}
$( [[ -n "$PSK" ]] && echo "PresharedKey = ${PSK}" )
AllowedIPs = ${ALLOWED_IPS}
PersistentKeepalive = 25
EOF
)

HUB_PUBKEY="$(wg show "$WG_IFACE" public-key)"
HUB_ENDPOINT_IP="${HUB_ENDPOINT_IP:-}"
if [[ -z "$HUB_ENDPOINT_IP" ]]; then
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
  HUB_ENDPOINT_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
fi

CLIENT_CONF=$(cat <<EOF
[Interface]
PrivateKey = ${PRIV_KEY}
Address = ${PEER_IP}/32

[Peer]
PublicKey = ${HUB_PUBKEY}
$( [[ -n "$PSK" ]] && echo "PresharedKey = ${PSK}" )
Endpoint = ${HUB_ENDPOINT_IP:-REPLACE_WITH_HUB_PUBLIC_IP}:51820
AllowedIPs = 10.99.0.1/32
PersistentKeepalive = 25
EOF
)

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "--- DRY RUN: would append to ${WG_CONF} ---"
  echo "$PEER_BLOCK"
  echo "--- DRY RUN: client config (would be saved to ${PEERS_DIR}/${NAME}.conf.client) ---"
  echo "$CLIENT_CONF"
  echo "--- DRY RUN: no backup taken, no file written, no syncconf applied ---"
  rm -f "${PEERS_DIR}/${NAME}.key" "${PEERS_DIR}/${NAME}.pub" "${PEERS_DIR}/${NAME}.psk"
  exit 0
fi

BACKUP="${WG_CONF}.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$WG_CONF" "$BACKUP"
echo "Backed up current config to ${BACKUP}"

echo "$PEER_BLOCK" >> "$WG_CONF"

if ! wg-quick strip "$WG_CONF" > /dev/null; then
  echo "ERROR: config failed validation after append - restoring backup" >&2
  cp -p "$BACKUP" "$WG_CONF"
  exit 1
fi

if ! wg syncconf "$WG_IFACE" <(wg-quick strip "$WG_CONF"); then
  echo "ERROR: wg syncconf failed - restoring backup (interface may be in a mixed state, verify with 'wg show')" >&2
  cp -p "$BACKUP" "$WG_CONF"
  wg syncconf "$WG_IFACE" <(wg-quick strip "$WG_CONF") || true
  exit 1
fi

echo "$CLIENT_CONF" > "${PEERS_DIR}/${NAME}.conf.client"
chmod 600 "${PEERS_DIR}/${NAME}.conf.client"

mkdir -p "$(dirname "$AUDIT_LOG")"
printf '%s\tADD\tname=%s\tip=%s\tallowed_ips=%s\toperator=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NAME" "${PEER_IP}/32" "$ALLOWED_IPS" "${SUDO_USER:-$(whoami)}" >> "$AUDIT_LOG"

echo "Peer '${NAME}' added as ${PEER_IP}/32, allowed to reach: ${ALLOWED_IPS}"
echo "Client config saved to ${PEERS_DIR}/${NAME}.conf.client"
echo "$CLIENT_CONF"
