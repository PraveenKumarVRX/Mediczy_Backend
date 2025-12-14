#!/usr/bin/env node
/**
 * Simple headless E2E test for Nurse Login flow using Puppeteer.
 * Steps:
 * 1. Load nurse login page
 * 2. Fill credentials
 * 3. Submit form
 * 4. Wait for redirect to dashboard
 * 5. Verify localStorage nurseToken exists
 */

import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:9443';
const EMAIL = process.env.NURSE_EMAIL || 'nurse@test.com';
const PASSWORD = process.env.NURSE_PASSWORD || 'nurse123';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  const consoleMessages = [];
  const networkLog = [];
  page.on('console', msg => consoleMessages.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));
  page.on('request', req => {
    if (/nurse\/login/.test(req.url())) {
      networkLog.push(`[request] ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', res => {
    if (/nurse\/login/.test(res.url())) {
      networkLog.push(`[response] ${res.status()} ${res.url()}`);
    }
  });

  const loginUrl = `${BASE_URL}/nurse/login`;
  console.log(`Navigating to ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle2' });

  // Wait for email input (fallback selectors tried)
  const emailSelector = 'input[name="email"], input[type="email"]';
  await page.waitForSelector(emailSelector);

  // Fill form
  await page.focus(emailSelector);
  await page.keyboard.type(EMAIL);

  const passwordSelector = 'input[name="password"], input[type="password"]';
  await page.waitForSelector(passwordSelector);
  await page.focus(passwordSelector);
  await page.keyboard.type(PASSWORD);

  // Find submit button: try by text content
  // Log available buttons
  const btnTexts = await page.$$eval('button', arr => arr.map(b => b.textContent));
  console.log('Buttons found:', btnTexts);
  // Try locating by role/text instead of XPath
  const buttons = await page.$$('button');
  let clicked = false;
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent || '', b);
    if (/sign/i.test(text) || /login/i.test(text)) {
      await b.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.log('Fallback: attempting manual invocation via window handleSubmit');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /sign/i.test((b.textContent || '')));
      if (btn) btn.click();
    });
  }

  // Wait for potential navigation or dashboard element
  // Poll for nurseToken
  let token = null;
  for (let i = 0; i < 10; i++) {
    token = await page.evaluate(() => localStorage.getItem('nurseToken'));
    if (token) break;
    await new Promise(r => setTimeout(r, 500));
  }

  // Check URL change
  const currentUrl = page.url();
  console.log('Current URL after submit:', currentUrl);

  // Evaluate localStorage token
  console.log('nurseToken presence:', token ? 'FOUND' : 'MISSING');

  // Basic assertions
  const ok = token && /nurse\/dashboard/.test(currentUrl);

  if (!ok) {
    console.log('--- Console messages ---');
    consoleMessages.forEach(m => console.log(m));
    console.log('--- Network log ---');
    networkLog.forEach(m => console.log(m));
    const html = await page.content();
    console.log('--- HTML snippet ---');
    console.log(html.slice(0, 2000));
    throw new Error('E2E nurse login test FAILED');
  }

  console.log('✅ Nurse login E2E test PASSED');
  await browser.close();
}

run().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
