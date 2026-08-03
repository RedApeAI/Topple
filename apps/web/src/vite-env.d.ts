/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_BACKEND_URL?: string;
  readonly VITE_DEV_ALLOWED_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
