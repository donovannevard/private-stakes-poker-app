/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend port, for machines where 3000 is already taken by another project. */
  readonly VITE_BACKEND_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
