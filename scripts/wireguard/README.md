# WireGuard tenant peer tooling

Safe, scriptable add/remove/list for peers on the live hub (`wg0`, `10.99.0.1/24`,
`/etc/wireguard/wg0.conf`). This hub carries real clinical traffic today (the PACS/DICOM feed on
`10.99.0.3` and a GPU inference workstation on `10.99.0.4`/`.5`) — every script here is
append-only against existing peer blocks and applies changes via `wg syncconf` (hot reload),
**never** `systemctl restart wg-quick@wg0` or `wg-quick down`/`up`, which would tear down and
re-establish every tunnel at once.

## Add a peer

```
sudo scripts/wireguard/wg-add-peer.sh --name <label> --allowed-ips <cidr[,cidr...]> [--ip 10.99.0.N] [--no-psk] [--dry-run]
```

- `--name`: lowercase alphanumeric/hyphen label (e.g. `medstar-crm-ec2`, `medstar-oncall-drsharma`).
  Stored as a comment above the peer's `PublicKey` line and used by `wg-list-peers.sh` and
  `scripts/monitoring/tenant-peer-health-monitor.sh` to identify tenant peers.
- `--allowed-ips`: what this peer is allowed to reach through the hub. Default convention: scope
  it to exactly the one tenant `/32` the peer is authorized for (e.g. `10.99.0.6/32`), never a
  broader route, unless there's a specific, confirmed need.
- `--ip`: pin a specific overlay address; otherwise the next free `10.99.0.N` is picked
  automatically.
- `--dry-run`: prints what would be appended and the client config that would be generated,
  without writing or applying anything. Always dry-run a new peer type before applying for real.

The client-side config (ready to hand to whoever owns the other end — paste onto a tenant's EC2,
or send to a remote staff member) is printed and saved to
`/etc/wireguard/peers/<name>.conf.client` (mode 600).

## Remove a peer

```
sudo scripts/wireguard/wg-remove-peer.sh --name <label> [--dry-run]
sudo scripts/wireguard/wg-remove-peer.sh --ip 10.99.0.7 [--dry-run]
```

Refuses to touch the pre-existing, undocumented, clinically-live peers (`10.99.0.2`, `.3`, `.4`,
`.5`) without `--force-production-peer` plus typed confirmation of the exact IP.

## List peers

```
bash scripts/wireguard/wg-list-peers.sh
```

Read-only. Cross-references live handshake/traffic (`wg show wg0 dump`) with the name comments in
`wg0.conf`. Pre-existing peers from before this tooling existed show as `unlabeled`.

## Audit trail

Every add/remove is appended to `logs/wireguard-peer-changes.log` (name, IP, AllowedIPs,
timestamp, operator).

## Safety invariants

- Every write takes a timestamped backup first (`wg0.conf.bak-YYYYMMDDHHMMSS`, same convention as
  the pre-existing hand-made backups).
- Every write validates with `wg-quick strip` before applying; a failed validation restores the
  backup and makes no change to the running interface.
- Applied via `wg syncconf` only — the running tunnel is never torn down.
- A file lock (`/etc/wireguard/.wg-provision.lock`) prevents two concurrent runs from racing on
  "pick the next free IP."
