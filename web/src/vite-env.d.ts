/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXPLORER_BASE?: string
  readonly VITE_EXPLORER_ADDRESS_BASE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
