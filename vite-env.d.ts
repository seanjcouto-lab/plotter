/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DEFAULT_SHOP_ID?: string;
  readonly VITE_SEAN_AUTH_USER_ID?: string;
}

declare module 'heic2any';

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
