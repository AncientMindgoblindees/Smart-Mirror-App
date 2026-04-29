/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIRROR_ENV?: 'production' | 'development';
  readonly VITE_MIRROR_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
