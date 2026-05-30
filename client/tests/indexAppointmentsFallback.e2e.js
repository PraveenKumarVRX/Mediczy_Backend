#!/usr/bin/env node
/**
 * Regression: dashboard must not show sample appointments for authenticated users
 * when /appointments/my-appointments fails. It should show retry/error messaging.
 */

import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:9443';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setBypassServiceWorker(true);

  const debug = [];
  page.on('console', msg => debug.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => debug.push(`[pageerror] ${err.message}`));

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyVHlwZSI6InVzZXIiLCJleHAiOjQ3MjM2NjA4MDB9.c2ln');
    localStorage.setItem('userType', 'user');
  });

  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    const method = req.method();
    const pathname = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();

    const isMockedApi =
      pathname.endsWith('/api/users/profile') ||
      pathname.endsWith('/api/appointments/my-appointments') ||
      pathname.endsWith('/api/health-data/summary') ||
      pathname.endsWith('/api/membership/my/current');

    if (method === 'OPTIONS' && isMockedApi) {
      req.respond({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'Content-Type, Authorization, X-Tenant-ID',
        },
      });
      return;
    }

    if (pathname.endsWith('/api/users/profile')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ id: 999, firstName: 'QA', role: 'user', email: 'qa@example.com' }),
      });
      return;
    }

    if (pathname.endsWith('/api/appointments/my-appointments')) {
      req.respond({
        status: 500,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ success: false, message: 'Forced test failure' }),
      });
      return;
    }

    if (pathname.endsWith('/api/health-data/summary')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ latest: { steps: { value: 1234 }, heart_rate: { value: 72 }, sleep: { value: 25200 } } }),
      });
      return;
    }

    if (pathname.endsWith('/api/membership/my/current')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ userPlan: { endDate: '2099-12-31', status: 'active' } }),
      });
      return;
    }

    req.continue();
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

  await page.waitForFunction(() => {
    return document.body.innerText.includes('Upcoming Appointments');
  });

  const bodyText = await page.evaluate(() => document.body.innerText);

  const hasErrorMessage = bodyText.includes('Could not load appointments right now.');
  const hasRetry = bodyText.includes('Retry');
  const leakedSampleAppointment = bodyText.includes('Dr. Sarah Johnson');

  if (!hasErrorMessage || !hasRetry || leakedSampleAppointment) {
    console.log('--- Debug output ---');
    debug.forEach(line => console.log(line));
    console.log('--- Body snippet ---');
    console.log(bodyText.slice(0, 2400));
    throw new Error('Regression failed: dashboard fallback behavior is incorrect');
  }

  console.log('✅ Dashboard appointment fallback regression PASSED');
  await browser.close();
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
