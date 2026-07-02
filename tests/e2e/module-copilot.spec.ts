/**
 * E2E — Hospital module copilot smoke (billing page + API)
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://app.mediqzy.com';

test.describe('Module Copilot', () => {
  test('GET /api/v3/module-copilot/modules is reachable', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v3/module-copilot/modules`);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.modules)).toBe(true);
    }
  });

  test('hospital billing page loads', async ({ page }) => {
    await page.goto(`${BASE}/hospital/billing`);
    await expect(page).toHaveURL(/hospital\/(billing|login)/);
  });

  test('enterprise login page renders providers section', async ({ page }) => {
    await page.goto(`${BASE}/enterprise/login`);
    await expect(page.getByText(/Enterprise Sign-In/i)).toBeVisible({ timeout: 15000 });
  });

  test('hypergrid marketplace page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/hypergrid/marketplace`);
    await expect(page).toHaveURL(/hypergrid\/marketplace|admin\/login/);
  });
});
