import 'axios';
/// <reference types="react" />
/// <reference types="react-dom" />

declare global {
namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
// App-specific globals attached at runtime (service-worker / health-sync scheduler).
interface Window {
  clients?: unknown;
  healthSyncScheduler?: unknown;
  skipWaiting?: () => void;
}
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuth?: boolean;
  }

  export interface InternalAxiosRequestConfig {
    skipAuth?: boolean;
  }
}
