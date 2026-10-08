import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const list = vi.fn();
const join = vi.fn();
vi.mock('@/services/otProctor.service', () => ({ listOtProctorRooms: (...a: unknown[]) => list(...a), joinOtProctorRoom: (...a: unknown[]) => join(...a) }));
vi.mock('@/components/video/LiveKitRoom', () => ({ SimpleLiveKitRoom: ({ token }: { token: string }) => <div>room-with-{token}</div> }));

import OtExpertConsole, { minutesAgo } from './OtExpertConsole';

beforeEach(() => { list.mockReset(); join.mockReset(); });

describe('minutesAgo', () => {
  it('formats elapsed time', () => {
    expect(minutesAgo(1_000_000, 1_000_000 + 30_000)).toBe('just now');
    expect(minutesAgo(1_000_000, 1_000_000 + 5 * 60_000)).toBe('5 min ago');
  });
});

describe('OtExpertConsole', () => {
  it('shows an empty state when no theatre is live', async () => {
    list.mockResolvedValue([]);
    render(<OtExpertConsole />);
    await waitFor(() => expect(screen.getByText(/No live OT sessions/i)).toBeTruthy());
  });

  it('joins a live room with the observer token', async () => {
    list.mockResolvedValue([{ roomId: 'display-ot-proctor-3-1', startedAt: Date.now() - 120_000 }]);
    join.mockResolvedValue({ serverUrl: 'wss://lk', token: 'tok-1' });
    render(<OtExpertConsole />);
    fireEvent.click(await screen.findByText(/Join \(watch and listen\)/));
    await waitFor(() => expect(screen.getByText('room-with-tok-1')).toBeTruthy());
    expect(join).toHaveBeenCalledWith('display-ot-proctor-3-1');
  });

  it('shows the server message when joining is refused', async () => {
    list.mockResolvedValue([{ roomId: 'display-ot-proctor-3-1', startedAt: Date.now() }]);
    join.mockRejectedValue({ response: { data: { message: 'This proctoring session has expired' } } });
    render(<OtExpertConsole />);
    fireEvent.click(await screen.findByText(/Join \(watch and listen\)/));
    await waitFor(() => expect(screen.getByText('This proctoring session has expired')).toBeTruthy());
  });
});
