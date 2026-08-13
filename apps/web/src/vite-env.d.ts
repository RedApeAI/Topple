/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_BACKEND_URL?: string;
  readonly VITE_DEV_AUTH_BYPASS?: string;
  readonly VITE_DEV_ALLOWED_HOSTS?: string;
  readonly VITE_ORCHESTRATOR_URL?: string;
  readonly VITE_ORCHESTRATOR_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
