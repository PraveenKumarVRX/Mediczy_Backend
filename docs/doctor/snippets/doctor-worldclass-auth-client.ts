import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import * as Keychain from 'react-native-keychain';

const API_BASE_URL = 'https://app.mediqzy.com/api';
const KEYCHAIN_SERVICE = 'mediqzy_doctor_auth';

type DoctorSession = {
  token: string;
  refreshToken: string;
  expiresIn?: number;
};

type BootstrapResponse = {
  success: boolean;
  token: string;
  refreshToken: string;
  expiresIn: number;
  doctor?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    specialization?: string;
    isVerified?: boolean;
    profilePicture?: string | null;
  };
};

class DoctorAuthStore {
  async getSession(): Promise<DoctorSession | null> {
    const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!creds) return null;

    try {
      return JSON.parse(creds.password) as DoctorSession;
    } catch {
      return null;
    }
  }

  async setSession(session: DoctorSession): Promise<void> {
    await Keychain.setGenericPassword('doctor', JSON.stringify(session), {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async clearSession(): Promise<void> {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  }
}

const authStore = new DoctorAuthStore();

class DoctorApiClient {
  private api: AxiosInstance;
  private refreshPromise: Promise<DoctorSession> | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 20000,
    });

    this.api.interceptors.request.use(async (config) => {
      const session = await authStore.getSession();
      if (session?.token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${session.token}`;
      }
      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const request = error.config as AxiosRequestConfig & { _retry?: boolean };
        const status = error.response?.status;

        if (status !== 401 || request?._retry) {
          throw error;
        }

        request._retry = true;

        try {
          const newSession = await this.refreshOnce();
          request.headers = request.headers || {};
          request.headers.Authorization = `Bearer ${newSession.token}`;
          return this.api(request);
        } catch (refreshError) {
          await authStore.clearSession();
          throw refreshError;
        }
      }
    );
  }

  get client(): AxiosInstance {
    return this.api;
  }

  async login(email: string, password: string, deviceFingerprint?: string): Promise<DoctorSession> {
    const res = await this.api.post('/doctors/login', {
      email,
      password,
    }, {
      headers: deviceFingerprint ? { 'x-device-fingerprint': deviceFingerprint } : undefined,
    });

    const session: DoctorSession = {
      token: res.data.token,
      refreshToken: res.data.refreshToken,
      expiresIn: res.data.expiresIn,
    };

    await authStore.setSession(session);
    return session;
  }

  async restoreSession(deviceFingerprint?: string): Promise<BootstrapResponse | null> {
    const existing = await authStore.getSession();
    if (!existing?.refreshToken) return null;

    const res = await this.api.post<BootstrapResponse>('/doctors/session/bootstrap', {
      refreshToken: existing.refreshToken,
      deviceFingerprint,
    }, {
      headers: deviceFingerprint ? { 'x-device-fingerprint': deviceFingerprint } : undefined,
    });

    const nextSession: DoctorSession = {
      token: res.data.token,
      refreshToken: res.data.refreshToken,
      expiresIn: res.data.expiresIn,
    };

    await authStore.setSession(nextSession);
    return res.data;
  }

  async logout(): Promise<void> {
    const existing = await authStore.getSession();
    try {
      if (existing?.refreshToken) {
        await this.api.post('/auth/logout', { refreshToken: existing.refreshToken });
      }
    } finally {
      await authStore.clearSession();
    }
  }

  private async refreshOnce(): Promise<DoctorSession> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const existing = await authStore.getSession();
        if (!existing?.refreshToken) {
          throw new Error('NO_REFRESH_TOKEN');
        }

        const res = await this.api.post('/doctors/refresh', {
          refreshToken: existing.refreshToken,
        });

        const updated: DoctorSession = {
          token: res.data.token,
          refreshToken: res.data.refreshToken,
          expiresIn: res.data.expiresIn,
        };

        await authStore.setSession(updated);
        return updated;
      })().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }
}

export const doctorApiClient = new DoctorApiClient();
export { authStore };
