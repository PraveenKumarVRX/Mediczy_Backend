import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HospitalCRMCommunicationHubPage from '@/pages/crm/HospitalCRMCommunicationHubPage';
vi.mock('@/utils/api', () => ({ default: { get: vi.fn(async () => ({ data: { data: {} } })) } }));
vi.mock('@/pages/crm/CRMModulePages', () => ({ CRMLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('./ChatwootWorkspace', () => ({ default: () => <div>Tenant workspace</div> }));
afterEach(cleanup);
it('opens SMS compose from a deep link and changes to email without losing the hub navigation', async () => {
  render(<MemoryRouter initialEntries={['/crm/hospital/communication-hub?channel=sms']}><HospitalCRMCommunicationHubPage /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Send a message' });
  expect(screen.queryByPlaceholderText('Subject')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Email' }));
  expect(await screen.findByPlaceholderText('Subject')).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Communication channels' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Campaigns' })).toBeTruthy();
});
