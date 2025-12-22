import { test, expect } from '@playwright/test';

/**
 * Debug test to check actual login behavior
 */

test('debug admin login', async ({ page }) => {
  // Listen to all responses
  page.on('response', response => {
    console.log(`Response: ${response.status()} ${response.url()}`);
  });

  // Listen to console messages
  page.on('console', msg => {
    console.log(`Console ${msg.type()}: ${msg.text()}`);
  });

  await page.goto('http://localhost:3001/admin/login', { waitUntil: 'domcontentloaded' });
  
  console.log('Page loaded');
  
  // Fill credentials
  await page.locator('input[type="email"]').first().fill('admin@mediqzy.com');
  console.log('Email filled');
  
  await page.locator('input[type="password"]').first().fill('SecurePass123');
  console.log('Password filled');
  
  // Wait a bit
  await page.waitForTimeout(500);
  
  // Check if button is enabled
  const button = page.locator('button[type="submit"]').first();
  const isEnabled = await button.isEnabled();
  console.log(`Button enabled: ${isEnabled}`);
  
  if (isEnabled) {
    // Click and see what happens
    await button.click();
    console.log('Button clicked');
    
    // Wait for network activity
    await page.waitForTimeout(5000);
    
    console.log(`Final URL: ${page.url()}`);
    
    // Check localStorage
    const adminToken = await page.evaluate(() => localStorage.getItem('adminToken'));
    const userType = await page.evaluate(() => localStorage.getItem('userType'));
    console.log(`adminToken: ${adminToken}`);
    console.log(`userType: ${userType}`);
  } else {
    console.log('Button is disabled - checking why');
    const buttonClasses = await button.getAttribute('class');
    console.log(`Button classes: ${buttonClasses}`);
  }
});
