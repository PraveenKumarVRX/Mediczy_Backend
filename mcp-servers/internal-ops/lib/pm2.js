/**
 * PM2 process introspection — shells out to the real `pm2` CLI via execFile
 * (never a shell string), so there is no command-injection surface even
 * though the process name comes from the MCP tool call.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Defense in depth on top of execFile's own argv-array safety: PM2 process
// names in this deployment are short, plain identifiers — reject anything
// that doesn't look like one rather than passing arbitrary input through.
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export async function getPm2Status() {
  const { stdout } = await execFileAsync('pm2', ['jlist'], { maxBuffer: 10 * 1024 * 1024 });
  const processes = JSON.parse(stdout);
  return processes.map((p) => ({
    name: p.name,
    pid: p.pid,
    status: p.pm2_env?.status,
    restarts: p.pm2_env?.restart_time,
    uptime_ms: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : null,
    memory_mb: p.monit?.memory ? Math.round(p.monit.memory / 1024 / 1024) : null,
    cpu_percent: p.monit?.cpu ?? null,
    instances: p.pm2_env?.instances ?? 1,
    exec_mode: p.pm2_env?.exec_mode,
  }));
}

export async function getPm2Logs(name, lines = 50) {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid process name: "${name}" — must be alphanumeric/dash/underscore only`);
  }
  const boundedLines = Math.max(1, Math.min(Number(lines) || 50, 500));
  const { stdout } = await execFileAsync(
    'pm2',
    ['logs', name, '--lines', String(boundedLines), '--nostream'],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  // Strip ANSI colour codes — pm2 logs always colourises, even non-TTY.
  // eslint-disable-next-line no-control-regex
  return stdout.replace(/\x1b\[[0-9;]*m/g, '');
}
