# Mediczy Internal-Ops MCP Server

Read-only operational visibility for engineering/on-call, exposed as MCP tools so
any MCP client (Claude Desktop, Claude Code, a future internal agent) can run the
same diagnostics that would otherwise require shell access to this box.

## What it is NOT

This is **not** the clinical-data MCP server. Nothing here returns a
patient-identifiable row — every DB tool is aggregate/count-shaped by design.
A future clinical-data server (patient vitals, imaging evidence bundles, clinical
assertions) is separate work and must route through the existing SaMD quality-gate
/ interpretability layer (`server/services/ai-quality-gates.service.js`,
`ai-interpretability.service.js`) before anything reaches a model — this server
does not, and should not, grow clinical tools without that gate in front of them.

## Tools

| Tool | What it does |
|---|---|
| `get_pm2_status` | Lists every PM2 process — status, uptime, memory, CPU, restarts |
| `get_pm2_logs` | Tails recent stdout/stderr for one named process |
| `get_service_health` | Live HTTP check of `mediczy-server` and `imaging-triage` `/health` endpoints |
| `check_object_storage` | Reachability check of the configured MinIO endpoint |
| `get_db_connection_stats` | Postgres connection pool state (active/idle/idle-in-tx, longest active query) |
| `get_ris_study_stats` | Aggregate RIS study counts by modality/report status, 24h ingest volume |
| `get_corporate_health_report_stats` | Aggregate upload/notification-success counts for corporate health reports |

Each tool's description in `index.js` names the real incident it was built to catch
(the MinIO Cloudflare-tunnel outage, the corporate-report notification gap) — these
aren't hypothetical tools, they're the manual checks from real investigations this
session, made callable.

## Security scoping — read this before adding tools

- **Transport is stdio only.** Whoever can execute `node index.js` already has
  shell access to this box, and therefore already has direct `pm2`/`psql`/`curl`
  access — this grants no new privilege, it only makes existing read-only
  operations callable by an MCP client instead of typed by hand.
- **It is NOT yet safe to expose over a network** (HTTP/SSE transport) without
  adding real authentication and re-auditing every tool for what it would expose
  to an unauthenticated or lower-trust caller. Don't add a network transport to
  this file without that work.
- **No PHI, no patient-identifiable data, no mutation.** Every tool is read-only
  and returns counts/status/aggregates. If you're tempted to add a tool that
  returns an individual patient/study/report row, that belongs in the (not yet
  built) clinical-data server behind the governance gate, not here.
- `get_pm2_logs`'s process name is validated against `^[a-zA-Z0-9_-]{1,64}$`
  and both PM2 calls use `execFile` (argv array, no shell) — there is no command
  injection surface even though the name is a tool argument. Keep that pattern
  for any new PM2/shell-adjacent tool.

## Setup

```bash
cd mcp-servers/internal-ops
npm install
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mediczy-internal-ops": {
      "command": "node",
      "args": ["/home/ubuntu/Mediczy/mcp-servers/internal-ops/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mediczy-internal-ops -- node /home/ubuntu/Mediczy/mcp-servers/internal-ops/index.js
```

## Testing without a full MCP client

`test-client.mjs` spawns the server and calls every tool directly — useful when
changing a tool and wanting a fast, real (not mocked) check before wiring up
Claude Desktop/Code:

```bash
node test-client.mjs
```

It also calls `get_pm2_logs` with a deliberately malicious process name
(`"rm -rf /; #"`) to verify the input-validation guard rejects it cleanly instead
of reaching `execFile`.
