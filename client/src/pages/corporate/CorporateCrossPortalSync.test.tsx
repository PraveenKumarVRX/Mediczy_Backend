import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import CorporateHealthAnalysis from './CorporateHealthAnalysis';
import CorporateNotifications from './CorporateNotifications';
vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/components/corporate/CorporateLayout', () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('does not invent scores or trend improvements for unassessed employees', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { totalEmployees: 2, monitoredEmployees: 0, averageRiskScore: null, riskDistribution: {}, departmentRisks: [{ department: 'General', totalEmployees: 2, avgRiskScore: null, checkupCompletion: 0 }] } } });
  render(<MemoryRouter><CorporateHealthAnalysis /></MemoryRouter>);
  expect(await screen.findByText('No measured health scores available.')).toBeTruthy();
  expect(screen.queryByText('Chronic Conditions')).toBeNull();
  expect(screen.queryByText('3%')).toBeNull();
  expect(screen.queryByText('5%')).toBeNull();
  expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
  expect(screen.getByText('General')).toBeTruthy();
});
it('shows one notification search field', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { notifications: [] } } });
  render(<MemoryRouter><CorporateNotifications /></MemoryRouter>);
  expect(screen.getAllByPlaceholderText('Search notifications...')).toHaveLength(1);
});
