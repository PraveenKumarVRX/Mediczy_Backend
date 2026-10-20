import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import CRMTelecallerDialer from './CRMTelecallerDialer';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const baseOverview = (overrides: Record<string, any> = {}) => ({
  providerConfigured: true,
  agents: [{ user_id: 1, name: 'Test Agent', phone: '+919800000000', role: 'agent', presence: 'offline', active_call_id: null }],
  calls: [],
  callbacks: [],
  metrics: { total: 0, active: 0 },
  ...overrides,
});

function mockApi(overview: Record<string, any>, extra: Record<string, (url: string, body?: any) => any> = {}) {
  return {
    get: vi.fn(async (url: string, config?: any) => {
      if (url === '/crm/contact-center') return { data: overview };
      if (url === '/crm/leads') return { data: { data: [{ id: 10, name: 'Lead One', phone: '+919811111111' }] } };
      if (url.startsWith('/crm/contact-center/calls/')) return { data: extra.getCall ? extra.getCall(url) : {} };
      return { data: {} };
    }),
    patch: vi.fn(async (url: string, body: any) => ({ data: extra.patch ? extra.patch(url, body) : {} })),
    post: vi.fn(async (url: string, body: any) => ({ data: extra.post ? extra.post(url, body) : { id: 'call-1', state: 'queued', destination: body?.to } })),
  };
}

vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));

describe('CRM telecaller mobile dialer', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('crmToken', 'synthetic-token');
    localStorage.setItem('crmUserData', JSON.stringify({ id: 1, crmRole: 'telecaller', firstName: 'Riya' }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('shows a blocking empty state when the agent has no registered phone', async () => {
    const api = (await import('@/utils/api')).default as any;
    Object.assign(api, mockApi(baseOverview({ agents: [] })));
    render(<CRMTelecallerDialer />);
    await screen.findByText(/dialer number isn't set up yet/i);
    expect(screen.queryByText('My Leads')).toBeNull();
  });

  it('lists assigned leads and lets the agent call one', async () => {
    const api = (await import('@/utils/api')).default as any;
    Object.assign(api, mockApi(baseOverview({ agents: [{ user_id: 1, name: 'Test Agent', phone: '+919800000000', role: 'agent', presence: 'available', active_call_id: null }] })));
    render(<CRMTelecallerDialer />);
    await screen.findByText('Lead One');
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/crm/contact-center/calls',
      { to: '+919811111111' },
      expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }) })
    ));
  });

  it('polls call status until terminal, then shows disposition options', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = (await import('@/utils/api')).default as any;
    let state = 'queued';
    Object.assign(api, mockApi(
      baseOverview({ agents: [{ user_id: 1, name: 'Test Agent', phone: '+919800000000', role: 'agent', presence: 'available', active_call_id: null }] }),
      {
        post: () => ({ id: 'call-1', state: 'queued', destination: '+919811111111' }),
        getCall: () => ({ call: { id: 'call-1', state, destination: '+919811111111' }, events: [], transcripts: [], artifacts: [], recordings: [] }),
      }
    ));
    render(<CRMTelecallerDialer />);
    await screen.findByText('Lead One');
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await screen.findByText(/answer it to connect/i);
    state = 'completed';
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(screen.getByText(/how did this call go/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Wrong number' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/crm/contact-center/calls/call-1/disposition',
      { disposition: 'wrong_number' },
      expect.anything()
    ));
  });

  it('drops presence to offline when the tab is hidden while available', async () => {
    const api = (await import('@/utils/api')).default as any;
    Object.assign(api, mockApi(baseOverview({ agents: [{ user_id: 1, name: 'Test Agent', phone: '+919800000000', role: 'agent', presence: 'available', active_call_id: null }] })));
    render(<CRMTelecallerDialer />);
    await screen.findByText('Lead One');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/crm/contact-center/presence', { presence: 'offline' }, expect.anything()));
  });
});
