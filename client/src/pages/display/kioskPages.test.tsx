import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('./DisplayShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import WayfindingKiosk from './WayfindingKiosk';
import OTProctorDisplay from './OTProctorDisplay';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.setItem('displayDeviceToken', 'dev-123');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('WayfindingKiosk', () => {
  it('sends the device token and renders the configured steps', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, destination: 'Pharmacy', steps: ['Turn right after reception.', 'Look for: green signboard.'] }),
    });
    render(<WayfindingKiosk />);
    fireEvent.change(screen.getByPlaceholderText(/OPD, lab/i), { target: { value: 'pharmacy' } });
    fireEvent.click(screen.getByText('Get directions'));

    await waitFor(() => expect(screen.getByText('Turn right after reception.')).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/display/kiosk/wayfinding');
    expect(init.headers['x-device-token']).toBe('dev-123');
  });

  it('tells the visitor to ask at reception when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ success: false }) });
    render(<WayfindingKiosk />);
    fireEvent.change(screen.getByPlaceholderText(/OPD, lab/i), { target: { value: 'pharmacy' } });
    fireEvent.click(screen.getByText('Get directions'));
    await waitFor(() => expect(screen.getByText(/ask at the reception desk/i)).toBeTruthy());
  });
});

describe('OTProctorDisplay', () => {
  it('starts the session on the display video endpoint with the device token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, roomId: 'display-ot-proctor-3-1' }) });
    render(<OTProctorDisplay />);
    fireEvent.click(screen.getByText('Start expert video'));

    await waitFor(() => expect(screen.getByText('display-ot-proctor-3-1')).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/display/video/sessions');
    expect(init.headers['x-device-token']).toBe('dev-123');
    expect(JSON.parse(init.body)).toMatchObject({ sessionType: 'ot-proctor', targetZone: 'ot' });
  });

  it('shows an error instead of failing silently', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ success: false, message: 'LiveKit is not configured' }) });
    render(<OTProctorDisplay />);
    fireEvent.click(screen.getByText('Start expert video'));
    await waitFor(() => expect(screen.getByText('LiveKit is not configured')).toBeTruthy());
  });
});
