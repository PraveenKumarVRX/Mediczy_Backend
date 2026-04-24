import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://app.mediqzy.com/api';
export const TOKEN_KEY = 'mediczy_auth_token';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT on every request
apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // SecureStore unavailable (web) — skip
  }
  return config;
});

// Handle 401 globally
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      // Auth store will react via token absence on next render
    }
    return Promise.reject(error);
  }
);

export default apiClient;
