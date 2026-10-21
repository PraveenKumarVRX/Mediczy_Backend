import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import CorporateCompliance from './CorporateCompliance';
import CorporateHrTeam from './CorporateHrTeam';
vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), post: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('@/components/corporate/CorporateLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
const get = vi.mocked(api.get);
const employee = { employeeId: 'EMP-1', name: 'Synthetic Employee', granted: null, department: 'QA' };
let failEmployees = false;
function consentApi() {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith('/summary')) return { data: { success: true, data: { total: 1, granted: 0, pending: 1, consentRate: 0 } } } as never;
    if (url.endsWith('/employees')) { if (failEmployees) throw new Error('Synthetic unavailable'); return { data: { success: true, data: { employees: [employee] } } } as never; }
    return { data: { success: true, data: {} } } as never;
  });
}
const show = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); failEmployees = false; });
afterEach(cleanup);
describe('corporate consent failures', () => {
  it('shows a retryable error instead of a false empty roster, then recovers', async () => {
    failEmployees = true; consentApi(); show(<CorporateCompliance />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No employees found')).toBeNull();
    failEmployees = false; fireEvent.click(screen.getByRole('button', { name: 'Retry consent data' }));
    expect(await screen.findByText('Synthetic Employee')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps previous data on refresh failure and disables stale exports/mutations', async () => {
    consentApi(); show(<CorporateCompliance />); await screen.findByText('Synthetic Employee');
    failEmployees = true;
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await screen.findByRole('alert');
    expect(screen.getByText('Synthetic Employee')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Create Pending Records' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
describe('direct corporate HR identity', () => {
  it('marks the direct identity as you without treating a colliding users ID as self or using a seat', async () => {
    localStorage.setItem('corporateToken', 'x.' + btoa(JSON.stringify({ id: 3, role: 'corporate' })) + '.x');
    get.mockResolvedValue({ data: { success: true, data: [
      { id: 'corporate:3', firstName: 'Direct', lastName: 'Contact', email: 'direct@example.invalid', role: 'corporate_admin', createdAt: '2026-01-01', isDirectLogin: true },
      { id: 3, firstName: 'Actual', lastName: 'Admin', email: 'admin@example.invalid', role: 'corporate_admin', createdAt: '2026-01-01' },
    ] } } as never);
    show(<CorporateHrTeam />); await screen.findByText('Direct Contact');
    const direct = screen.getByText('Direct Contact').closest('tr')!;
    const actual = screen.getByText('Actual Admin').closest('tr')!;
    expect(within(direct).getByText('(you)')).toBeTruthy();
    expect(within(actual).queryByText('(you)')).toBeNull();
    expect(within(direct).queryByRole('button')).toBeNull();
    expect(await screen.findByText('1/15 seats used')).toBeTruthy();
  });
});
