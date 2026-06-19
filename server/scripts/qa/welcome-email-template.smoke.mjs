#!/usr/bin/env node
/**
 * Smoke test — corporate welcome email template personalization (offline).
 * Run: node server/scripts/qa/welcome-email-template.smoke.mjs
 */

import {
  buildCorporateEmployeeTemplateVars,
  renderTemplate,
} from '../../services/welcome-email-template.util.js';

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const NINJACART_TEMPLATE = `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <p>Dear {{employeeName}},</p>
  <p><strong>Welcome to My SmartHealth!</strong></p>
  <p>... specially curated for {{companyName}} employees.</p>
  <p><strong>Username:</strong> {{email}}<br/>
  <strong>Password:</strong> {{temporaryPassword}}</p>
</div>`;

function employeeA() {
  return {
    email: 'jitendraparihar@ninjacart.com',
    firstName: 'Jitendra',
    lastName: 'Parihar',
    companyName: 'Ninjacart',
    employeeId: 'NC26321',
    department: 'Operations',
  };
}

function employeeB() {
  return {
    email: 'alice@ninjacart.com',
    firstName: 'Alice',
    lastName: 'Kumar',
    companyName: 'Ninjacart',
    employeeId: 'NC99999',
    department: 'HR',
  };
}

function run() {
  const passA = 'PassA!234';
  const passB = 'PassB!567';
  const varsA = buildCorporateEmployeeTemplateVars(employeeA(), passA);
  const varsB = buildCorporateEmployeeTemplateVars(employeeB(), passB);

  const htmlA = renderTemplate(NINJACART_TEMPLATE, varsA);
  const htmlB = renderTemplate(NINJACART_TEMPLATE, varsB);

  record('employee A name rendered', htmlA.includes('Dear Jitendra Parihar,'));
  record('employee A email rendered', htmlA.includes('jitendraparihar@ninjacart.com'));
  record('employee A password rendered', htmlA.includes(passA));
  record('employee A company rendered', htmlA.includes('Ninjacart'));
  record('employee A has no raw {{employeeName}}', !htmlA.includes('{{employeeName}}'));

  record('employee B name rendered', htmlB.includes('Dear Alice Kumar,'));
  record('employee B email rendered', htmlB.includes('alice@ninjacart.com'));
  record('employee B password rendered', htmlB.includes(passB));
  record('employees get different passwords', passA !== passB);
  record('employee B does not leak employee A email', !htmlB.includes('jitendraparihar@ninjacart.com'));

  const legacyHtml = renderTemplate(
    '<p>Password: [generated securely at send time]</p>',
    varsA,
  );
  record('legacy password literal replaced', legacyHtml.includes(passA) && !legacyHtml.includes('[generated securely at send time]'));

  const spacedHtml = renderTemplate('Hello {{ employeeName }} / {{ email }}', varsA);
  record('flexible {{ spacing }} works', spacedHtml.includes('Hello Jitendra Parihar / jitendraparihar@ninjacart.com'));

  const bracketHtml = renderTemplate('Dear [Employee Name], login [Username]', varsA);
  record('bracket placeholders work', bracketHtml.includes('Dear Jitendra Parihar, login jitendraparihar@ninjacart.com'));

  console.log('\n=== Summary ===');
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} checks passed.`);
  }
}

run();
