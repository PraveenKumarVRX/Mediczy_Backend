const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const out = mkdtempSync(path.join(tmpdir(), 'tenant-mobile-test-'));
try {
  let result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'src/connection/core.ts', '--outDir', out, '--module', 'commonjs', '--target', 'es2022', '--strict', '--skipLibCheck'], { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = result.status || 1;
  else {
    result = spawnSync(process.execPath, ['--test', 'tests/connection.cjs'], { stdio: 'inherit', env: { ...process.env, CONNECTION_CORE: path.join(out, 'core.js') } });
    process.exitCode = result.status || 0;
  }
} finally { rmSync(out, { recursive: true, force: true }); }
