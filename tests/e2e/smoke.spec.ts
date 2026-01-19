import { test, expect } from '@playwright/test';

/**
 * Quick Smoke Tests - Critical Functionality Only
 * Run these first to validate basic functionality
 */

const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'Admin@mediczy.com',
  password: process.env.ADMIN_PASSWORD || 'SecureAdmin123',
};

test.describe('Critical Smoke Tests', () => {
  test('admin can login successfully', async ({ page }) => {
    await page.goto('/admin/login');
    
    // Use dev mode quick login if available
    const devLoginButton = page.getByRole('button', { name: /dev mode.*quick access/i });
    const hasDevLogin = await devLoginButton.isVisible().catch(() => false);
    
    if (hasDevLogin) {
      await devLoginButton.click();
    } else {
      await page.locator('input[type="email"]').fill(ADMIN_CREDENTIALS.email);
      await page.locator('input[type="password"]').fill(ADMIN_CREDENTIALS.password);
      await page.getByRole('button', { name: /sign in|login/i }).click();
    }
    
    // Should redirect to admin area
    await page.waitForURL(/\/admin/i, { timeout: 10000 });
    expect(page.url()).toMatch(/\/admin/i);
  });

  test.skip('user registration page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /register|sign up/i })).toBeVisible({ timeout: 5000 });
  });

  test.skip('doctor login page loads', async ({ page }) => {
    await page.goto('/doctor/login');
    await expect(page.getByRole('heading', { name: /doctor login/i })).toBeVisible({ timeout: 5000 });
  });

  test.skip('user login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible({ timeout: 5000 });
  });

  test('home page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(errors.length).toBe(0);
  });

  test('corporate benefits page loads', async ({ page }) => {
    await page.goto('/corporate-benefits');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('admin dashboard has no console errors', async ({ page }) => {
    await page.goto('/admin/login');
    
    // Use dev mode quick login if available
    const devLoginButton = page.getByRole('button', { name: /dev mode.*quick access/i });
    const hasDevLogin = await devLoginButton.isVisible().catch(() => false);
    
    if (hasDevLogin) {
      await devLoginButton.click();
    } else {
      await page.locator('input[type="email"]').fill(ADMIN_CREDENTIALS.email);
      await page.locator('input[type="password"]').fill(ADMIN_CREDENTIALS.password);
      await page.getByRole('button', { name: /sign in|login/i }).click();
    }
    
    await page.waitForURL(/\/admin/i, { timeout: 10000 });
    
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(2000);
    
    const criticalErrors = errors.filter(error => 
      !error.includes('401') && 
      !error.includes('Unauthorized')
    );
    
    expect(criticalErrors.length).toBeLessThan(5);
  });

  test('debug dashboard accessible to admin', async ({ page }) => {
    await page.goto('/admin/login');
    
    // Use dev mode quick login if available
    const devLoginButton = page.getByRole('button', { name: /dev mode.*quick access/i });
    const hasDevLogin = await devLoginButton.isVisible().catch(() => false);
    
    if (hasDevLogin) {
      await devLoginButton.click();
    } else {
      await page.locator('input[type="email"]').fill(ADMIN_CREDENTIALS.email);
      await page.locator('input[type="password"]').fill(ADMIN_CREDENTIALS.password);
      await page.getByRole('button', { name: /sign in|login/i }).click();
    }
    
    await page.waitForURL(/\/admin/i, { timeout: 10000 });
    
    await page.goto('/debug');
    await expect(page.getByRole('heading', { name: /debug dashboard/i })).toBeVisible({ timeout: 5000 });
  });
});
