import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatwootWorkspace from './ChatwootWorkspace';
import api from '@/utils/api';

vi.mock('@/utils/api', () => ({ default: { get: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('Chatwoot workspace', () => {
  it('opens the configured tenant account with explicit portal authentication', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { state: 'configured', configured: true,
      agentUrl: 'https://chat.mediqzy.com/app/accounts/101/dashboard', inboxes: [
        { inbox_id: 201, channel: 'whatsapp', channel_address: '+919876543210', enabled: true },
      ], jobs: [{ status: 'uncertain', count: 2 }] } } });
    render(<ChatwootWorkspace endpoint="/crm/communication-hub/chatwoot" token="crm-test-token" />);
    const link = await screen.findByRole('link', { name: 'Open Chatwoot' });
    expect(link.getAttribute('href')).toBe('https://chat.mediqzy.com/app/accounts/101/dashboard');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('2 need attention')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/crm/communication-hub/chatwoot', { headers: { Authorization: 'Bearer crm-test-token' } });
  });
  it('shows pending setup without a workspace link', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { state: 'not_configured', configured: false } } });
    render(<ChatwootWorkspace endpoint="/hospital/communication/chatwoot" token="hospital-test-token" />);
    expect(await screen.findByText('Not connected')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('checks health and shows an inbox mismatch', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { state: 'configured', configured: true } } })
      .mockResolvedValueOnce({ data: { data: { state: 'inbox_mismatch', configured: true } } });
    render(<ChatwootWorkspace endpoint="/crm/communication-hub/chatwoot" token="crm-test-token" />);
    await screen.findByText('Connected');
    fireEvent.click(screen.getByRole('button', { name: 'Check Chatwoot connection' }));
    expect(await screen.findByText('Inbox needs attention')).toBeTruthy();
    expect(api.get).toHaveBeenLastCalledWith('/crm/communication-hub/chatwoot/health', { headers: { Authorization: 'Bearer crm-test-token' } });
  });
  it('keeps workspace errors contained in the status area', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network failure'));
    render(<ChatwootWorkspace endpoint="/hospital/communication/chatwoot" token={null} />);
    expect(await screen.findByText('Agent workspace unavailable')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
