import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DoctorDashboard from '@/pages/doctor/DoctorDashboard';
import api from '@/utils/api';

vi.mock('@/components/layout/MainLayoutdoctor', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/IncomingCallNotification', () => ({
  IncomingCallNotification: () => null,
}));

vi.mock('@/services/socket.service', () => ({
  default: {
    connect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({
    currentDoctor: {
      id: 11,
      firstName: 'Asha',
      lastName: 'K',
      specialization: 'General Medicine',
      profileImage: null,
    },
    userType: 'doctor',
  }),
}));

vi.mock('@/utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const createTestClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const renderDashboard = () => {
  const queryClient = createTestClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DoctorDashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('DoctorDashboard degraded-state and retry UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('userType', 'doctor');
    localStorage.setItem('doctorToken', 'test-doctor-token');
  });

  it('shows degraded schedule lock message when appointment feed fails', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/doctors/dashboard/stats') {
        return { data: { totalPatients: 20, todayAppointments: 3, revenue: 12000, completedToday: 1, pendingAppointments: 2 } } as any;
      }
      if (url === '/appointments/doctor/today') {
        throw new Error('appointments unavailable');
      }
      if (url === '/doctors/alerts') {
        return { data: { alerts: [], unreadCount: 0 } } as any;
      }
      throw new Error(`Unhandled GET ${url}`);
    });

    renderDashboard();

    expect(await screen.findByText('Live schedule unavailable')).toBeTruthy();
    expect(screen.getByText('Retry live data')).toBeTruthy();
    expect(screen.getByText(/Clinical schedule cards are temporarily locked/i)).toBeTruthy();
  });

  it('recovers schedule cards after retry when live appointments become available', async () => {
    let appointmentsCallCount = 0;

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/doctors/dashboard/stats') {
        return { data: { totalPatients: 20, todayAppointments: 3, revenue: 12000, completedToday: 1, pendingAppointments: 2 } } as any;
      }
      if (url === '/appointments/doctor/today') {
        appointmentsCallCount += 1;
        if (appointmentsCallCount === 1) {
          throw new Error('appointments unavailable');
        }
        return {
          data: {
            appointments: [
              {
                id: 1001,
                time: '10:30 AM',
                patientName: 'Riya Shah',
                status: 'scheduled',
                type: 'Video',
              },
            ],
          },
        } as any;
      }
      if (url === '/doctors/alerts') {
        return { data: { alerts: [], unreadCount: 0 } } as any;
      }
      throw new Error(`Unhandled GET ${url}`);
    });

    renderDashboard();

    expect(await screen.findByText('Live schedule unavailable')).toBeTruthy();

    fireEvent.click(screen.getByText('Retry live data'));

    await waitFor(() => {
      expect(screen.queryByText('Live schedule unavailable')).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getAllByText('Riya Shah').length).toBeGreaterThan(0);
    });
  });
});
