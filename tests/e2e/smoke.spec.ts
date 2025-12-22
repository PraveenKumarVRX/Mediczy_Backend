import { test, expect } from '@playwright/test';

/**
 * Quick Smoke Tests - Critical Functionality Only
 * Run these first to validate basic functionality
 */

const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'admin@mediqzy.com',
  password: process.env.ADMIN_PASSWORD || 'SecurePass123',
};

test.describe('Critical Smoke Tests', () => {
  test('admin can login successfully', async ({ page }) => {
    await page.goto('/admin/login');
    
    await page.getByLabel(/email/i).fill(ADMIN_CREDENTIALS.email);
    await page.getByLabel(/password/i).fill(ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    
    // Should redirect to admin area
    await page.waitForURL(/\/admin/i, { timeout: 10000 });
    expect(page.url()).toMatch(/\/admin/i);
  });

  test('user registration page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /register|sign up/i })).toBeVisible({ timeout: 5000 });
  });

  test('doctor login page loads', async ({ page }) => {
    await page.goto('/doctor/login');
    await expect(page.getByRole('heading', { name: /doctor login/i })).toBeVisible({ timeout: 5000 });
  });

  test('user login page loads', async ({ page }) => {
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
    await page.getByLabel(/email/i).fill(ADMIN_CREDENTIALS.email);
    await page.getByLabel(/password/i).fill(ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    
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
    
    expect(criticalErrors.length).toBe(0);
  });

  test('debug dashboard accessible to admin', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel(/email/i).fill(ADMIN_CREDENTIALS.email);
    await page.getByLabel(/password/i).fill(ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    
    await page.waitForURL(/\/admin/i, { timeout: 10000 });
    
    await page.goto('/debug');
    await expect(page.locator('text=/debug/i')).toBeVisible({ timeout: 5000 });
  });
});
