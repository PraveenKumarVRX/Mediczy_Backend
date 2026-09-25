# Memory & OOM runbook (prod EC2, 16 GB RAM + 8 GB swap)

Investigated 2026-09-25. **No kernel OOM kill since boot (2026-09-15) and no `earlyoom` kill in the retained
logs; lowest MemAvailable in 7 days was 1.77 GB.** The API server is not OOM-crashing: all 71 `mediczy-server`
restarts were deliberate reloads (SIGINT, exit 0). The historical "OOMs" were client builds dying at the V8
heap limit (fixed: leaked processes 2026-09-22, hard-coded `NODE_OPTIONS` in `client/package.json` 2026-09-23).

## Where the memory goes (typical)
| Consumer | RSS |
|---|---|
| VS Code remote server (extension host 3.3 GB, TS native-preview LSP 2 GB, eslint/tailwind/etc.) | ~7 GB |
| `mediczy-server` (cluster, 1 worker) | ~1.35 GB, flat |
| sib-fastapi (Python) | ~0.4 GB (+1 GB in swap) |
| everything else (worker, n8n, redis, postgres, nginx...) | ~1 GB |
| **A client build (`vite build`, 7784 modules)** | **peaks ~4.6 GB RSS (~5 GB with children), ~1m45s** |

Building on this host with the IDE open leaves ~2.3 GB free at the peak. `earlyoom` (`-m 8 -s 10`) starts
killing at ~1.3 GB free.

## Protections in place
- **Deploy preflight** (`scripts/deploy/deploy-full-prod-s3.sh`): aborts *before any change* if
  `MemAvailable < 5500 MB` for an on-host client build. Skipped for `CLIENT_DIST_ARCHIVE` (off-host) builds.
  Override: `SKIP_MEM_CHECK=true` or `MIN_BUILD_MEM_MB=<n>`.
- **Kill order** (`scripts/ops/oom-protect.sh`): prod services `oom_score_adj=-500` (nginx, redis, pgbouncer,
  every PM2 daemon and its apps; postgres already -900); VS Code remote tooling `+300`. Applied live, and made
  persistent by:
  - systemd drop-ins `/etc/systemd/system/{nginx,redis-server,pgbouncer,pm2-ubuntu}.service.d/oom-protect.conf`
    (`OOMScoreAdjust=-500`, effective from each service's next start),
  - `~/.vscode-server/server-env-setup` (VS Code server starts at +300).
  PM2 apps started/reloaded after the daemon is protected inherit its value. Re-run
  `sudo bash scripts/ops/oom-protect.sh` (and `--show` to inspect) if the PM2 daemon itself is restarted.
  Trade-off: in a real memory emergency the IDE / Claude Code / Codex sessions go first, not production.
- **IDE caps** (`.vscode/settings.json`, git-ignored, local): `js/ts.server.goMemLimit=1024MiB`,
  `typescript.tsserver.maxTsServerMemory=2048`, watcher/search exclusions for the BLE SDK folders and
  `whisper.cpp`. Takes effect when the language server restarts.

## Known drift / follow-ups
- `ecosystem.config.js` is **not** the live `mediczy-server` definition (see the header in that file). The live
  process has **no V8 heap cap**; `max_memory_restart: 3G` (RSS) is what bounds it. Adding
  `--max-old-space-size` means re-defining the PM2 app (restart of prod API) — do it in a deploy window from
  a clean tree, then `pm2 save`.
- There is a second PM2 daemon under **root** (`/root/.pm2`); confirm it is intentional.
- Build off-host: the CI `build-client` job + `CLIENT_DIST_ARCHIVE` path exist (`.github/workflows/ci.yml`,
  `deploy-with-checks.yml`) but have never run on GitHub Actions (WP-0.6). Once verified, prod never needs to
  run a 5 GB build.
- Idle IDE extensions worth disabling on this host if memory gets tight: Java (redhat.java), C/C++ pack,
  Cline (claude-dev), Roo, one of Claude Code / Codex when not in use.

## Quick triage
```
free -m; ps -eo pid,rss,oom_score,oom_score_adj,args --sort=-rss | head -15
sudo journalctl -u earlyoom --since -1d | grep -v "mem avail"   # kills, if any
sudo journalctl -k -b | grep -i -E "oom|killed process"
pm2 jlist | jq '.[]|{name,restart_time,mem:.monit.memory}'
```
