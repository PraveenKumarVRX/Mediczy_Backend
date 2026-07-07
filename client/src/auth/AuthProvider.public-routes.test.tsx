import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AuthProvider public route guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test('does not redirect unauthenticated users away from /forgot-password', async () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/forgot-password?type=user']}>
          <AuthProvider>
            <div>forgot-password-screen</div>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  test('does not redirect unauthenticated users away from portal-specific forgot-password routes', async () => {
    const routes = ['/user/forgot-password', '/doctor/forgot-password', '/team/forgot-password'];

    for (const route of routes) {
      const queryClient = new QueryClient();
      mockNavigate.mockClear();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider>
              <div>forgot-password-screen</div>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
      });
    }
  });

  test('does not redirect unauthenticated users away from portal login routes', async () => {
    const routes = [
      '/doctor/login',
      '/hospital/login',
      '/clinic/login',
      '/lab/login',
      '/ambulance/login',
      '/homecare/login',
    ];

    for (const route of routes) {
      const queryClient = new QueryClient();
      mockNavigate.mockClear();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider>
              <div>portal-login-screen</div>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
        expect(mockNavigate).not.toHaveBeenCalledWith('/', { replace: true });
      });
    }
  });

  test('does not redirect unauthenticated users away from /reset-password', async () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reset-password?token=abc123&type=user']}>
          <AuthProvider>
            <div>reset-password-screen</div>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
    });
  });
});
