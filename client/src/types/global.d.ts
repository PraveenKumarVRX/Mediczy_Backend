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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clients?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  healthSyncScheduler?: any;
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
