import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import AdminDedicatedInstallations from './AdminDedicatedInstallations';

vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('@/components/layout/AdminLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const profiles = {
  crm: { label: 'CRM', tenantTypes: ['hospital'], required: ['crm.core'], modules: [['crm.core', 'CRM core'], ['crm.agent', 'Agentic CRM']], metrics: ['leads_created'] },
  lab: { label: 'Lab / LIS', tenantTypes: ['lab'], required: ['lab.core'], modules: [['lab.core', 'Lab core'], ['lab.collection', 'Collection']], metrics: ['reports_released'] },
};
const row = { id: 'test-id', tenant_uid: 'VTEST2', tenant_name: 'Laboratory', name: 'Radolabs LIS', profile: 'lab', modules: ['lab.core'],
  domain: null, aws_account_id: null, region: null, version: 1, connector_enrolled: false, freshness: 'never_reported', last_received_at: null, last_observed_at: null, release: null };
const detail = { installation: row, dailyMetrics: [], audit: [] };
const get = vi.mocked(api.get), post = vi.mocked(api.post);
beforeEach(() => {
  vi.resetAllMocks();
  get.mockImplementation(async url => {
    if (String(url).endsWith('/catalog')) return { data: { profiles } } as never;
    if (String(url).endsWith('/tenant-options')) return { data: { tenants: [
      { tenant_uid: 'VTEST1', name: 'Hospital', type: 'hospital' }, { tenant_uid: 'VTEST2', name: 'Laboratory', type: 'lab' },
    ] } } as never;
    if (String(url).endsWith('/test-id')) return { data: detail } as never;
    return { data: { installations: [row] } } as never;
  });
});
afterEach(cleanup);
const mount = () => render(<MemoryRouter><AdminDedicatedInstallations /></MemoryRouter>);

it('shows unreported health and unlinked payments without fabricated usage', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'View Radolabs LIS' }));
  expect(await screen.findByText('No analytics received.')).toBeTruthy();
  expect(screen.getByText('Not linked. No payment status has been inferred.')).toBeTruthy();
  expect(screen.getByText('never reported')).toBeTruthy();
});
it('lab registration offers only compatible organizations and persists a scoped request', async () => {
  mount();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure lab installation' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Configure lab installation' }));
  const dialog = screen.getByRole('dialog');
  const select = within(dialog).getByLabelText('Organization');
  await within(select).findByRole('option', { name: 'Laboratory (VTEST2)' });
  expect(within(select).queryByRole('option', { name: 'Hospital (VTEST1)' })).toBeNull();
  fireEvent.change(select, { target: { value: 'VTEST2' } });
  fireEvent.click(within(dialog).getByLabelText('Collection'));
  post.mockResolvedValueOnce({ data: { installation: row } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save configuration' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/dedicated-installations', expect.objectContaining({
    tenantUid: 'VTEST2', profile: 'lab', modules: ['lab.core', 'lab.collection'],
  })));
  expect(await screen.findByText(/Installation configuration saved/)).toBeTruthy();
});
it('surfaces unavailable schema without offering a fake success state', async () => {
  get.mockRejectedValue({ response: { data: { message: 'Migration required' } } });
  mount();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Migration required');
  expect(screen.getByRole('button', { name: 'Configure lab installation' }).hasAttribute('disabled')).toBe(true);
});
it('requires confirmation to rotate a connector and shows its secret once', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'View Radolabs LIS' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Issue / rotate connector credential' }));
  expect(post).not.toHaveBeenCalled();
  post.mockResolvedValueOnce({ data: { installation: { ...row, version: 2 }, token: 'one-time-test-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm rotate' }));
  const secret = await screen.findByLabelText('New connector credential');
  expect(secret).toHaveProperty('value', 'one-time-test-secret');
  expect(post).toHaveBeenCalledWith('/admin/dedicated-installations/test-id/connector/rotate', { version: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'I have saved the credential' }));
  await waitFor(() => expect(screen.queryByLabelText('New connector credential')).toBeNull());
});
