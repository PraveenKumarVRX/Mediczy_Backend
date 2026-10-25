// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/utils/api';
import TenantMobileAppsPanel from './TenantMobileAppsPanel';
vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const config = { enabled: true, origin: 'https://rado.example', revision: 1, deploymentId: 'deployment-rado-1', apps: [{ product: 'patient', name: 'Rado Patient', appId: 'com.rado.patient', registration: 'open' }] };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.get).mockResolvedValue({ data: { configuration: config } }); });
describe('tenant app admin controls', () => {
  it('loads tenant settings and saves policy to that tenant with revision and authentication', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { configuration: { ...config, revision: 2 } } });
    render(<TenantMobileAppsPanel tenantId={42} tenantName="Rado" token="admin-token" />);
    await screen.findByDisplayValue('https://rado.example');
    fireEvent.click(screen.getByLabelText('Allow patient self-registration'));
    fireEvent.click(screen.getByRole('button', { name: 'Save app configuration' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/superadmin/tenants/tenants/42/mobile-apps', expect.objectContaining({ revision: 1, apps: [expect.objectContaining({ registration: 'disabled' })] }), { headers: { Authorization: 'Bearer admin-token' } }));
    expect(await screen.findByText(/App configuration saved/)).toBeTruthy();
  });
  it('shows backend conflicts without reporting success', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { data: { message: 'Configuration changed. Reload before saving.' } } });
    render(<TenantMobileAppsPanel tenantId={42} tenantName="Rado" token="admin-token" />);
    await screen.findByDisplayValue('https://rado.example');
    fireEvent.click(screen.getByRole('button', { name: 'Save app configuration' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Reload before saving');
    expect(screen.queryByText(/App configuration saved/)).toBeNull();
  });
  it('does not expose an editable form when loading is denied', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { message: 'Platform administrator access required.' } } });
    render(<TenantMobileAppsPanel tenantId={42} tenantName="Rado" token="denied" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Platform administrator');
    expect(screen.queryByRole('button', { name: 'Save app configuration' })).toBeNull();
  });
});
