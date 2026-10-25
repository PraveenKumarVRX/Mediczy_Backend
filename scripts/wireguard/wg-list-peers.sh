#!/usr/bin/env bash
# Read-only: cross-reference live `wg show` handshake/traffic state with the
# human-readable name comments in wg0.conf. Safe to run as any user with
# sudo -n wg access (no writes, no lock needed).
set -euo pipefail
WG_CONF=/etc/wireguard/wg0.conf
WG_IFACE=wg0

declare -A NAME_BY_PUBKEY
current_name=""
while IFS= read -r line; do
  if [[ "$line" =~ ^#\ added\ by\ wg-add-peer\.sh\ .*\ —\ (.+)$ ]]; then
    current_name="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^PublicKey\ =\ (.+)$ ]]; then
    NAME_BY_PUBKEY["${BASH_REMATCH[1]}"]="${current_name:-unlabeled}"
    current_name=""
  elif [[ "$line" =~ ^\[Peer\]$ ]]; then
    : # no-op, name (if any) is consumed by the following PublicKey line
  fi
done < <(sudo grep -vE "PrivateKey|PresharedKey" "$WG_CONF")

printf '%-20s %-14s %-45s %-12s %-10s\n' "NAME" "OVERLAY_IP" "ENDPOINT" "LAST_HS" "RX/TX"
sudo wg show "$WG_IFACE" dump | tail -n +2 | while IFS=$'\t' read -r pubkey _psk endpoint allowed_ips handshake rx tx _keepalive; do
  name="${NAME_BY_PUBKEY[$pubkey]:-unlabeled}"
  ip=$(grep -oE '10\.99\.0\.[0-9]+' <<<"$allowed_ips" | head -1 || true)
  if [[ "$handshake" == "0" ]]; then
    hs="never"
  else
    hs="$(( ($(date +%s) - handshake) / 60 ))m ago"
  fi
  printf '%-20s %-14s %-45s %-12s %-10s\n' "$name" "${ip:-?}" "${endpoint:-(none)}" "$hs" "${rx}/${tx}"
done
