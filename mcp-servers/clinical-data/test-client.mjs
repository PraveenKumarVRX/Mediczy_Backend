import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', 'server', '.env') });
const { JWT_CONFIG } = await import('../../server/config/auth.config.js');

// Real study 11 (YOGAVARSHAN) — lab_id 2433, referring_doctor_id 70, has a
// real persisted draft from earlier this session's testing.
const STUDY_ID = 11;
const authorizedLabToken = jwt.sign({ id: 2433, role: 'lab' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
const authorizedDoctorToken = jwt.sign({ id: 70, role: 'doctor' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
const wrongTenantLabToken = jwt.sign({ id: 999999, role: 'lab' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
const garbageToken = 'not-a-real-token-at-all';

const transport = new StdioClientTransport({ command: 'node', args: ['index.js'] });
const client = new Client({ name: 'test-client', version: '0.1.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('=== TOOLS ===');
console.log(tools.tools.map((t) => t.name).join('\n'));

console.log('\n=== AUTHORIZED (lab owns study 11): get_report_draft ===');
let r = await client.callTool({ name: 'get_report_draft', arguments: { token: authorizedLabToken, studyId: STUDY_ID } });
console.log('isError:', r.isError);
console.log(r.content[0].text.slice(0, 1200));

console.log('\n=== AUTHORIZED (referring doctor): get_analysis_status ===');
r = await client.callTool({ name: 'get_analysis_status', arguments: { token: authorizedDoctorToken, studyId: STUDY_ID } });
console.log('isError:', r.isError);
console.log(r.content[0].text);

console.log('\n=== AUTHORIZED: check_report_against_evidence (a real, compliant sentence) ===');
r = await client.callTool({
  name: 'check_report_against_evidence',
  arguments: {
    token: authorizedLabToken,
    studyId: STUDY_ID,
    reportText: 'FINDINGS: There is lateral ventricular asymmetry, with the right lateral ventricle measuring 3977.9mm3 and the left lateral ventricle measuring 641.2mm3.',
  },
});
console.log('isError:', r.isError);
console.log(r.content[0].text);

console.log('\n=== AUTHORIZED: check_report_against_evidence (a real fabricated swap — should BLOCK) ===');
r = await client.callTool({
  name: 'check_report_against_evidence',
  arguments: {
    token: authorizedLabToken,
    studyId: STUDY_ID,
    reportText: 'FINDINGS: left lateral ventricle measures 3977.9mm3 vs. right lateral ventricle measures 641.2mm3.',
  },
});
console.log('isError:', r.isError);
console.log(r.content[0].text);

console.log('\n=== DENIED: wrong-tenant lab token (real 403) ===');
r = await client.callTool({ name: 'get_report_draft', arguments: { token: wrongTenantLabToken, studyId: STUDY_ID } });
console.log('isError:', r.isError, '-', r.content[0].text);

console.log('\n=== DENIED: garbage/invalid token (real 401) ===');
r = await client.callTool({ name: 'get_report_draft', arguments: { token: garbageToken, studyId: STUDY_ID } });
console.log('isError:', r.isError, '-', r.content[0].text);

console.log('\n=== DENIED: nonexistent study (real 404) ===');
r = await client.callTool({ name: 'get_report_draft', arguments: { token: authorizedLabToken, studyId: 999999999 } });
console.log('isError:', r.isError, '-', r.content[0].text);

await client.close();
process.exit(0);
