/**
 * Writes server/openapi/dist/app.openapi.json from server/openapi/.
 * Run after changing the contract: npm run openapi:export
 * __tests__/openapi-contract.test.js fails if the committed file is stale.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAppSpec } from '../../openapi/index.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../openapi/dist/app.openapi.json');
fs.writeFileSync(out, `${JSON.stringify(buildAppSpec(), null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
