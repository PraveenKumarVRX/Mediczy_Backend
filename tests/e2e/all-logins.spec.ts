import { test, expect } from '@playwright/test';

/**
 * Doctor Login Tests
 * Tests for doctor authentication and dashboard access
 */

const DOCTOR_CREDENTIALS = {
  email: process.env.DOCTOR_EMAIL || 'doctor@mediczy.com',
  password: process.env.DOCTOR_PASSWORD || 'Doctor@123',
};

test.describe('Doctor Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor/login');
  });

  test('should load doctor login page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /doctor login/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForTimeout(500);
    
    const errorMessages = page.locator('[role="alert"], .error, .text-red-500');
    await expect(errorMessages.first()).toBeVisible({ timeout: 3000 });
  });

  test('should handle invalid credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid@doctor.com');
    await page.getByLabel(/password/i).fill('WrongPassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    
    await page.waitForTimeout(2000);
    const errorElement = page.locator('text=/invalid|incorrect|failed/i').first();
    await expect(errorElement).toBeVisible({ timeout: 5000 });
  });

  test('should have OAuth buttons', async ({ page }) => {
    const googleButton = page.locator('button, a').filter({ hasText: /google/i });
    const facebookButton = page.locator('button, a').filter({ hasText: /facebook/i });
    
    expect(await googleButton.count() + await facebookButton.count()).toBeGreaterThan(0);
  });
});

test.describe('User Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should load user login page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForTimeout(500);
    
    const errorMessages = page.locator('[role="alert"], .error, .text-red-500');
    await expect(errorMessages.first()).toBeVisible({ timeout: 3000 });
  });

  test('should have OAuth buttons', async ({ page }) => {
    const googleButton = page.locator('button, a').filter({ hasText: /google/i });
    const facebookButton = page.locator('button, a').filter({ hasText: /facebook/i });
    
    expect(await googleButton.count() + await facebookButton.count()).toBeGreaterThan(0);
  });

  test('should have register link', async ({ page }) => {
    const registerLink = page.locator('a').filter({ hasText: /register|sign up/i });
    await expect(registerLink.first()).toBeVisible();
  });
});

test.describe('User Registration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('should load registration page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /register|sign up/i })).toBeVisible();
  });

  test('should have required form fields', async ({ page }) => {
    await expect(page.getByLabel(/name|full name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('should have OAuth buttons', async ({ page }) => {
    const googleButton = page.locator('button, a').filter({ hasText: /google/i });
    const facebookButton = page.locator('button, a').filter({ hasText: /facebook/i });
    
    expect(await googleButton.count() + await facebookButton.count()).toBeGreaterThan(0);
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign up|register|create/i }).click();
    await page.waitForTimeout(500);
    
    const errorMessages = page.locator('[role="alert"], .error, .text-red-500');
    await expect(errorMessages.first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Doctor Registration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor/register');
  });

  test('should load doctor registration page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /doctor.*register|register.*doctor/i })).toBeVisible();
  });

  test('should have OAuth buttons', async ({ page }) => {
    const googleButton = page.locator('button, a').filter({ hasText: /google/i });
    const facebookButton = page.locator('button, a').filter({ hasText: /facebook/i });
    
    expect(await googleButton.count() + await facebookButton.count()).toBeGreaterThan(0);
  });
});
