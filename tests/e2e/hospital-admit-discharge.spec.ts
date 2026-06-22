import hospitalOpenApi from '../routes/hospital-openapi.route.js';

/** GAP-QA-001 — Admit → discharge E2E (skeleton) */
import { test, expect } from '@playwright/test';

test.describe('Hospital IPD journey', () => {
  test('HMIS command centre loads', async ({ page }) => {
    await page.goto('/hmis/command-center');
    await expect(page).toHaveURL(/command-center/);
  });

  test('kiosk check-in page loads', async ({ page }) => {
    await page.goto('/kiosk/checkin');
    await expect(page.getByText(/check-in|Paperless/i)).toBeVisible({ timeout: 15000 });
  });

  test('wayfinding kiosk loads', async ({ page }) => {
    await page.goto('/kiosk/wayfinding');
    await expect(page.getByText(/Where do you need/i)).toBeVisible();
  });
});
