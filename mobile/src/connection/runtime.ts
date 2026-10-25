import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { ConnectionManager, Product } from './core';

const profile = Constants.expoConfig?.extra?.tenantApp;
export const product: Product = profile?.product || 'patient';
if (!['patient', 'phlebo', 'crm', 'smart-force'].includes(product)) throw new Error('Invalid app product configuration.');
export const appName: string = Constants.expoConfig?.name || 'Mediczy';
export const connectionManager = new ConnectionManager(product, profile?.appId || 'mediczy.patient', AsyncStorage, {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: key => SecureStore.deleteItemAsync(key),
}, (url, init) => expoFetch(url, {
  method: init.method, headers: init.headers,
  body: typeof init.body === 'string' ? init.body : undefined,
  signal: init.signal ?? undefined, redirect: 'error', credentials: 'omit',
}));
