/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_AGORA_APP_ID: string;
  readonly VITE_AGORA_APP_CERTIFICATE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
