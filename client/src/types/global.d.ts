import 'axios';
/// <reference types="react" />
/// <reference types="react-dom" />

declare global {
namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
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
