#!/usr/bin/env node
/**
 * Smoke test — corporate employee list merge for welcome email campaign.
 * Run: node server/scripts/qa/corporate-employee-list.smoke.mjs
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  mergeCorporateEmployeeRows,
  normalizeAssociationEmployee,
  normalizeRosterEmployee,
  CORPORATE_EMPLOYEE_ASSOCIATION_SQL,
  CORPORATE_EMPLOYEE_ROSTER_SQL,
} from '../../services/corporate-employee-list.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function runStaticSanityChecks() {
  const adminRoute = readFileSync(path.join(root, 'server/routes/admin.route.js'), 'utf8');
  record('admin route imports merge service', adminRoute.includes('mergeCorporateEmployeeRows'));
  record('admin route queries association + roster', adminRoute.includes('CORPORATE_EMPLOYEE_ASSOCIATION_SQL') && adminRoute.includes('CORPORATE_EMPLOYEE_ROSTER_SQL'));
  record('admin route returns total count', adminRoute.includes('total: merged.length'));

  const ui = readFileSync(path.join(root, 'client/src/pages/team/TeamCorporateManagement.tsx'), 'utf8');
  const uiChecks = [
    'isWelcomeEmailEligible',
    'employeesLoadError',
    'welcomeEligible',
    'rosterOnly',
    'welcome-ready',
    'Roster only — create/login account to email',
  ];
  for (const snippet of uiChecks) {
    record(`UI wiring: ${snippet}`, ui.includes(snippet));
  }

  record('association SQL joins corporate_employees', CORPORATE_EMPLOYEE_ASSOCIATION_SQL.includes('corporate_employees ce'));
  record('roster SQL reads corporate_employees', CORPORATE_EMPLOYEE_ROSTER_SQL.includes('FROM corporate_employees ce'));
}

console.log('=== Corporate employee list smoke ===\n');
runStaticSanityChecks();
console.log('');

const associationRows = [
  {
    id: 101,
    email: 'linked@ninjacart.com',
    firstName: 'Linked',
    lastName: 'User',
    user_employee_id: 'NC100',
    corporate_employee_id: 'NC100',
    metadata: { employeeId: 'NC100' },
    status: 'active',
    has_association: true,
  },
];

const rosterRows = [
  {
    id: 202,
    email: 'orphan@ninjacart.com',
    firstName: 'Orphan',
    lastName: 'Account',
    corporate_employee_row_id: 55,
    corporate_employee_id: 'NC202',
    ce_department: 'Ops',
    has_association: false,
  },
  {
    id: null,
    email: '',
    corporate_employee_row_id: 56,
    corporate_employee_id: 'NC203',
    ce_metadata: { department: 'Warehouse' },
    has_association: false,
  },
  {
    id: 101,
    email: 'linked@ninjacart.com',
    corporate_employee_row_id: 57,
    corporate_employee_id: 'NC100',
    has_association: true,
  },
];

const merged = mergeCorporateEmployeeRows(associationRows, rosterRows);

record('association employee included', merged.some((row) => row.id === 101));
record('orphan user account included', merged.some((row) => row.id === 202));
record('roster-only row included', merged.some((row) => row.corporate_employee_row_id === 56));
record('duplicate roster row skipped', merged.filter((row) => row.id === 101).length === 1);
record('welcome eligible when user + email', merged.find((row) => row.id === 202)?.welcomeEligible === true);
record('not welcome eligible without user account', merged.find((row) => row.corporate_employee_row_id === 56)?.welcomeEligible === false);

const assoc = normalizeAssociationEmployee(associationRows[0]);
record('association normalize sets hasAssociation', assoc.hasAssociation === true);

const roster = normalizeRosterEmployee(rosterRows[0]);
record('roster normalize flags missing association', roster.rosterOnly === true && roster.hasAssociation === false);

record('merge total count for pagination', mergeCorporateEmployeeRows(associationRows, rosterRows).length === 3);
record('pagination slice returns requested page size', mergeCorporateEmployeeRows(associationRows, rosterRows).slice(0, 2).length === 2);

console.log('\n=== Summary ===');
const failed = results.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${results.length} checks passed.`);
}
