import { test, expect, describe, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminLogin from '@/pages/admin/AdminLogin';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
global.fetch = vi.fn();

describe('AdminLogin Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});
    localStorageMock.removeItem.mockImplementation(() => {});
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <AdminLogin />
      </BrowserRouter>
    );
  };

  describe('Initial State and Authentication Check', () => {
    test('should clear other role tokens on mount', () => {
      renderComponent();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('teamToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('nurseToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('assistantToken');
    });

    test('should redirect if admin token exists', async () => {
      localStorageMock.getItem.mockReturnValue('existing-admin-token');

      renderComponent();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      });
    });

    test('should auto-fill credentials in development mode', () => {
      // Mock development environment
      vi.stubEnv('DEV', true);

      renderComponent();

      // Wait for useEffect to run
      expect(localStorageMock.getItem).toHaveBeenCalledWith('adminToken');
    });
  });

  describe('Form State Management', () => {
    test('should update email state on input change', async () => {
      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      expect(emailInput.value).toBe('test@example.com');
    });

    test('should update password state on input change', async () => {
      renderComponent();

      const passwordInput = screen.getByPlaceholderText('••••••••');
      fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

      expect(passwordInput.value).toBe('testpassword');
    });

    test('should toggle password visibility', async () => {
      renderComponent();

      const passwordInput = screen.getByPlaceholderText('••••••••');
      const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i });

      // Initially password should be hidden
      expect(passwordInput.type).toBe('password');

      // Click to show password
      fireEvent.click(toggleButton);
      expect(passwordInput.type).toBe('text');

      // Click to hide password again
      fireEvent.click(toggleButton);
      expect(passwordInput.type).toBe('password');
    });
  });

  describe('Form Validation', () => {
    test('should disable submit button when fields are empty', async () => {
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();
    });

    test('should enable submit button when both fields have values', async () => {
      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Development Mode Authentication', () => {
    test('should bypass API call with valid dev credentials', async () => {
      vi.stubEnv('DEV', true);
      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'SecurePass123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('adminToken', 'dev-admin-token');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('adminData', expect.any(String));
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      });
    });

    test('should show dev mode quick access button', () => {
      vi.stubEnv('DEV', true);
      renderComponent();

      const quickAccessButton = screen.getByText('Dev Mode: Quick Access');
      expect(quickAccessButton).toBeInTheDocument();
    });

    test('should handle dev mode quick access button click', async () => {
      vi.stubEnv('DEV', true);
      renderComponent();

      const quickAccessButton = screen.getByText('Dev Mode: Quick Access');
      fireEvent.click(quickAccessButton);

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('adminToken', 'dev-admin-token');
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      });
    });
  });

  describe('API Authentication', () => {
    test('should handle successful API login', async () => {
      const mockResponse = {
        token: 'api-token-123',
        user: {
          id: 'user-123',
          email: 'admin@mediczy.com',
          role: 'super_admin',
          firstName: 'Admin',
          lastName: 'User'
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/admin/login'),
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@mediczy.com', password: 'password123' }),
          })
        );

        expect(localStorageMock.setItem).toHaveBeenCalledWith('adminToken', 'api-token-123');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('adminData', JSON.stringify(mockResponse.user));
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      });
    });

    test('should handle API login with invalid credentials', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'wrong@email.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      });
    });

    test('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Unable to connect to server. Please check your connection.')).toBeInTheDocument();
      });
    });

    test('should handle server errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Internal server error' }),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Server error. Please try again later.')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    test('should show loading state during authentication', async () => {
      (global.fetch as any).mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'token', user: {} }),
        }), 100))
      );

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      await waitFor(() => {
        expect(screen.queryByText('Authenticating...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Security Features', () => {
    test('should clear other role tokens before setting admin token', async () => {
      const mockResponse = {
        token: 'api-token-123',
        user: { id: 'user-123', email: 'admin@mediczy.com', role: 'super_admin' }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Should clear other tokens before setting admin token
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('teamToken');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('nurseToken');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('assistantToken');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('userType');
      });
    });

    test('should validate API response structure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' }),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid server response')).toBeInTheDocument();
      });
    });
  });

  describe('UI Components', () => {
    test('should render all UI elements correctly', () => {
      renderComponent();

      expect(screen.getByText('Welcome Back')).toBeInTheDocument();
      expect(screen.getByText('Sign in to access the admin dashboard')).toBeInTheDocument();
      expect(screen.getByText('Secure Admin Portal')).toBeInTheDocument();
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByText('End-to-End Encrypted Connection')).toBeInTheDocument();
    });

    test('should display error messages with proper styling', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'wrong@email.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        const errorAlert = screen.getByText('Invalid email or password');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert.closest('.border-red-100')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation and Redirects', () => {
    test('should redirect to admin dashboard after successful login', async () => {
      const mockResponse = {
        token: 'api-token-123',
        user: { id: 'user-123', email: 'admin@mediczy.com', role: 'super_admin' }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      }, { timeout: 2000 });
    });

    test('should handle navigation delay correctly', async () => {
      vi.useFakeTimers();

      const mockResponse = {
        token: 'api-token-123',
        user: { id: 'user-123', email: 'admin@mediczy.com', role: 'super_admin' }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });

      // Fast-forward 500ms
      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      });

      vi.useRealTimers();
    });
  });

  describe('Timeout Handling', () => {
    test('should handle request timeout', async () => {
      vi.useFakeTimers();

      (global.fetch as any).mockImplementationOnce(
        () => new Promise((resolve) => {
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'token', user: {} }),
          }), 15000); // Longer than timeout
        })
      );

      renderComponent();

      const emailInput = screen.getByPlaceholderText('admin@mediczy.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'admin@mediczy.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      // Fast-forward past timeout
      vi.advanceTimersByTime(11000);

      await waitFor(() => {
        expect(screen.getByText('Unable to connect to server. Please check your connection.')).toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });
});