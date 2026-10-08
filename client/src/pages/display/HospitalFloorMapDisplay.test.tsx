import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('./DisplayShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import HospitalFloorMapDisplay, { occupancyText } from './HospitalFloorMapDisplay';

const fetchMock = vi.fn();
beforeEach(() => { localStorage.setItem('displayDeviceToken', 'dev-1'); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('occupancyText', () => {
  it('never prints a number it does not have', () => {
    expect(occupancyText({ occupied: null, capacity: null, utilizationPct: null })).toBe('No live count');
    expect(occupancyText({ occupied: 5, capacity: 10, utilizationPct: 50 })).toBe('5/10 · 50%');
  });
});

describe('HospitalFloorMapDisplay', () => {
  it('says the map is not set up instead of showing a made-up hospital', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, configured: false, nodes: [], floors: [] }) });
    render(<HospitalFloorMapDisplay />);
    await waitFor(() => expect(screen.getByText(/has not been set up/i)).toBeTruthy());
    expect(fetchMock.mock.calls[0][1].headers['x-device-token']).toBe('dev-1');
  });

  it('renders configured departments with floors taken from the response', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({
      success: true, configured: true, live: true, floors: [{ label: 'G', name: 'Ground' }, { label: '2', name: 'Second' }],
      nodes: [
        { id: 'er', name: 'Emergency', floor: 'G', x: 12, y: 68, capacity: 10, occupied: 5, utilizationPct: 50, status: 'moderate' },
        { id: 'ph', name: 'Pharmacy', floor: 'G', x: 80, y: 70, capacity: null, occupied: null, utilizationPct: null, status: 'unknown' },
      ],
    }) });
    render(<HospitalFloorMapDisplay />);
    await waitFor(() => expect(screen.getAllByText('Emergency').length).toBeGreaterThan(0));
    expect(screen.getByText('Floor 2')).toBeTruthy();
    expect(screen.getByText('5/10 · 50%')).toBeTruthy();
    expect(screen.getByText('No live count')).toBeTruthy();
  });
});
