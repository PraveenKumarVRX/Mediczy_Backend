import { it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : []);
}
it('keeps vendor SDKs and HTTP clients behind the managed adapters in runtime modules', () => {
  const violations = [];
  const modules = ['services','routes','controller','controllers','utils','config','api'].flatMap(dir => files(join(root, dir)));
  modules.push(join(root, 'app.js'));
  for (const path of modules) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\(\s*)['"](axios|node-fetch|twilio|nodemailer|razorpay|livekit-server-sdk|@aws-sdk\/client-sesv2)['"]/g)) {
      // SIB keeps its own signed internal transport; all external requests are explicitly wrapped.
      if (path.endsWith('/services/sib-client.js') && match[1] === 'node-fetch') continue;
      violations.push(path.slice(root.length) + ': ' + match[1]);
    }
  }
  expect(violations).toEqual([]);
});
