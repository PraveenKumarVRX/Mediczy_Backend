import { describe, expect, beforeEach, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminLogin from '@/pages/admin/AdminLogin';
import api from '@/utils/api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/utils/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

const apiPostMock = vi.mocked(api.post);

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const renderComponent = () =>
  render(
    <BrowserRouter>
      <AdminLogin />
    </BrowserRouter>
  );

const fillAndSubmit = (email = 'admin@mediqzy.com', password = 'password123') => {
  fireEvent.change(screen.getByLabelText('Work Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
};

describe('AdminLogin Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});
    localStorageMock.removeItem.mockImplementation(() => {});
    apiPostMock.mockReset();
  });

  test('redirects if an admin token already exists', async () => {
    localStorageMock.getItem.mockReturnValue('existing-admin-token');

    renderComponent();

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('userType', 'admin');
      expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
    });
  });

  test('renders the current admin login UI', () => {
    renderComponent();

    expect(screen.getByText('Welcome Back')).toBeTruthy();
    expect(screen.getByText('Sign in to access the admin dashboard.')).toBeTruthy();
    expect(screen.getByText('Admin Portal')).toBeTruthy();
    expect(screen.getByLabelText('Work Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByText('End-to-end encrypted connection')).toBeTruthy();
  });

  test('updates form state and enables submit when both fields are present', () => {
    renderComponent();

    const emailInput = screen.getByPlaceholderText('admin@mediqzy.com') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    expect(submitButton).toHaveProperty('disabled', true);

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('testpassword');
    expect(submitButton).toHaveProperty('disabled', false);
  });

  test('toggles password visibility', () => {
    renderComponent();

    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(passwordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput.type).toBe('password');
  });

  test('posts credentials and stores an admin session on successful login', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'admin@mediqzy.com',
      role: 'super_admin',
      firstName: 'Admin',
      lastName: 'User',
    };
    apiPostMock.mockResolvedValueOnce({ data: { token: 'api-token-123', user: mockUser } });

    renderComponent();
    fillAndSubmit();

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/admin/login',
        { email: 'admin@mediqzy.com', password: 'password123' },
        expect.objectContaining({ skipAuth: true, withCredentials: true })
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith('adminToken', 'api-token-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'api-token-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('userType', 'admin');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('adminData', JSON.stringify(mockUser));
    });
  });

  test('clears existing auth state before setting admin token', async () => {
    apiPostMock.mockResolvedValueOnce({
      data: { token: 'api-token-123', user: { id: 'user-123', email: 'admin@mediqzy.com' } },
    });

    renderComponent();
    fillAndSubmit();

    await waitFor(() => {
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('teamToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('nurseToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('assistantToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('userType');
    });
  });

  test('shows invalid credentials message for HTTP 401', async () => {
    apiPostMock.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Invalid credentials' } } });

    renderComponent();
    fillAndSubmit('wrong@email.com', 'wrongpassword');

    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
  });

  test('shows network error message', async () => {
    apiPostMock.mockRejectedValueOnce(new Error('Network error'));

    renderComponent();
    fillAndSubmit();

    expect(await screen.findByText('Unable to connect to server. Please check your connection.')).toBeTruthy();
  });

  test('shows server error message', async () => {
    apiPostMock.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } });

    renderComponent();
    fillAndSubmit();

    expect(await screen.findByText('Server error. Please try again later.')).toBeTruthy();
  });

  test('shows loading state during authentication', async () => {
    let resolveLogin: (value: unknown) => void;
    apiPostMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );

    renderComponent();
    fillAndSubmit();

    expect(screen.getByText('Authenticating...')).toBeTruthy();
    expect(screen.getByRole('button', { name: /authenticating/i })).toHaveProperty('disabled', true);

    await act(async () => {
      resolveLogin({ data: { token: 'token', user: { id: 1, email: 'admin@mediqzy.com' } } });
    });

    await waitFor(() => {
      expect(screen.queryByText('Authenticating...')).toBeNull();
    });
  });

  test('rejects invalid success response shape', async () => {
    apiPostMock.mockResolvedValueOnce({ data: { invalid: 'response' } });

    renderComponent();
    fillAndSubmit();

    expect(await screen.findByText('Invalid server response')).toBeTruthy();
  });

  test('redirects to admin dashboard after the success delay', async () => {
    apiPostMock.mockResolvedValueOnce({
      data: { token: 'api-token-123', user: { id: 'user-123', email: 'admin@mediqzy.com' } },
    });

    renderComponent();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
    });
  });

  test('handles request timeout cancellation', async () => {
    apiPostMock.mockRejectedValueOnce({ code: 'ERR_CANCELED' });

    renderComponent();
    fillAndSubmit();

    expect(await screen.findByText('Request timed out. Please try again.')).toBeTruthy();
  });
});
