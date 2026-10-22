/** Disposable local PostgreSQL verification. Never loads production credentials. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { corporateAccessAudit } from '../../services/corporate-access-audit.service.js';
const calls = [];
const audit = corporateAccessAudit({ query: async (sql, options) => { calls.push({ sql, ...options }); return [[{ ok: 1 }]]; } });
const req = { user: { role: 'corporate', corporateId: 3, id: 3, userId: 3, email: 'synthetic@example.invalid' } };
await audit.requireHealthConsent(req, { employeeId: 'EMP-1' });
await audit.record(req, { resourceId: 'employee:EMP-1', title: 'Health records', action: 'view' });
await audit.record({ user: { ...req.user, role: 'hr_staff', userId: 42 } }, { resourceId: 'employee:EMP-1', action: 'export' });
const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const expand = call => call.sql.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_, key) => { assert.ok(key in call.replacements); return literal(call.replacements[key]); });
const consentSql = expand(calls[0]);
const checkConsent = (description, count) => `DO $$ BEGIN IF (SELECT COUNT(*) FROM (${consentSql}) eligible) <> ${count} THEN RAISE EXCEPTION '${description}'; END IF; END $$;`;
const sql = `BEGIN;
CREATE TEMP TABLE corporate_employee_consents (corporate_id int, employee_id text, consent_type text, granted boolean, revoked_at timestamptz);
CREATE TEMP TABLE users (id int PRIMARY KEY);
INSERT INTO users VALUES (42);
CREATE TEMP TABLE corporate_report_access_log (corporate_id int, report_id varchar(100), report_title varchar(255), accessed_by_type varchar(30), accessed_by_user_id int REFERENCES users(id), accessed_by_name varchar(255), action varchar(30), ip_address varchar(45), accessed_at timestamptz);
${checkConsent('absent consent', 0)}
INSERT INTO corporate_employee_consents VALUES (4,'EMP-1','health_data',true,NULL),(3,'EMP-1','marketing',true,NULL),(3,'EMP-1','health_data',false,NULL);
${checkConsent('foreign purpose or denied consent', 0)}
UPDATE corporate_employee_consents SET granted=true,revoked_at=NOW() WHERE corporate_id=3 AND consent_type='health_data';
${checkConsent('revoked consent', 0)}
UPDATE corporate_employee_consents SET revoked_at=NULL WHERE corporate_id=3 AND consent_type='health_data';
${checkConsent('active consent', 1)}
${expand(calls[1])};
${expand(calls[2])};
DO $$ BEGIN
 IF (SELECT COUNT(*) FROM corporate_report_access_log WHERE accessed_by_type='corporate' AND accessed_by_user_id IS NULL) <> 1 THEN RAISE EXCEPTION 'direct corporate identity'; END IF;
 IF (SELECT COUNT(*) FROM corporate_report_access_log WHERE accessed_by_type='hr' AND accessed_by_user_id=42) <> 1 THEN RAISE EXCEPTION 'invited staff identity'; END IF;
END $$;
ROLLBACK;`;
execFileSync('sudo', ['-u', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-d', 'postgres'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
console.log(JSON.stringify({ passed: true, checks: 6, database: 'local PostgreSQL; temporary tables rolled back', productionMutations: 0 }));
