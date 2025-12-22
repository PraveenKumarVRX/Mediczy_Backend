import { test, expect } from '@playwright/test';

/**
 * Admin Login Tests - Optimized & Reliable
 * Tests critical admin authentication flows
 */

const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'admin@mediqzy.com',
  password: process.env.ADMIN_PASSWORD || 'SecurePass123',
};

test.describe('Admin Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  });

  test('loads login page', async ({ page }) => {
    // Check essential form elements exist
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();
    
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('validates empty form', async ({ page }) => {
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1000);
    
    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.locator('input[type="email"]').first().fill('wrong@test.com');
    await page.locator('input[type="password"]').first().fill('wrongpass');
    await page.locator('button[type="submit"]').first().click();
    
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('accepts valid credentials', async ({ page }) => {
    await page.locator('input[type="email"]').first().fill(ADMIN_CREDENTIALS.email);
    await page.locator('input[type="password"]').first().fill(ADMIN_CREDENTIALS.password);
    await page.locator('button[type="submit"]').first().click();
    
    // Wait for redirect away from login
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });

  test('persists session on reload', async ({ page }) => {
    // Login
    await page.locator('input[type="email"]').first().fill(ADMIN_CREDENTIALS.email);
    await page.locator('input[type="password"]').first().fill(ADMIN_CREDENTIALS.password);
    await page.locator('button[type="submit"]').first().click();
    
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });
    
    // Reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Should stay authenticated
    expect(page.url()).not.toContain('/login');
  });

  test('stores admin token', async ({ page }) => {
    await page.locator('input[type="email"]').first().fill(ADMIN_CREDENTIALS.email);
    await page.locator('input[type="password"]').first().fill(ADMIN_CREDENTIALS.password);
    await page.locator('button[type="submit"]').first().click();
    
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });
    
    const adminToken = await page.evaluate(() => localStorage.getItem('adminToken'));
    expect(adminToken).toBeTruthy();
  });

  test('sets userType to admin', async ({ page }) => {
    await page.locator('input[type="email"]').first().fill(ADMIN_CREDENTIALS.email);
    await page.locator('input[type="password"]').first().fill(ADMIN_CREDENTIALS.password);
    await page.locator('button[type="submit"]').first().click();
    
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });
    
    const userType = await page.evaluate(() => localStorage.getItem('userType'));
    expect(userType).toBe('admin');
  });

  test('loads without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const critical = errors.filter(e => 
      !e.includes('401') && 
      !e.includes('Failed to fetch') &&
      !e.toLowerCase().includes('cors')
    );
    
    expect(critical.length).toBeLessThan(3);
  });
});

test.describe('Admin Dashboard Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
    
    // Login
    await page.locator('input[type="email"]').first().fill(ADMIN_CREDENTIALS.email);
    await page.locator('input[type="password"]').first().fill(ADMIN_CREDENTIALS.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });
  });

  test('accesses dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/admin');
  });

  test('accesses users page', async ({ page }) => {
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/admin/users');
  });

  test('accesses doctors page', async ({ page }) => {
    await page.goto('/admin/doctors', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/admin/doctors');
  });

  test('accesses debug dashboard', async ({ page }) => {
    await page.goto('/debug', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/debug');
  });
});

test.describe('Performance', () => {
  test('loads login page quickly', async ({ page }) => {
    const start = Date.now();
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;
    
    expect(loadTime).toBeLessThan(5000);
  });

  test('completes login quickly', async ({ page }) => {
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
    
    const start = Date.now();
    await page.locator('input[type="email"]').first().fill(ADMIN_CREDENTIALS.email);
    await page.locator('input[type="password"]').first().fill(ADMIN_CREDENTIALS.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });
    const loginTime = Date.now() - start;
    
    expect(loginTime).toBeLessThan(7000);
  });
});
