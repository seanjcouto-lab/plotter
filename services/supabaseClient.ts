import { createClient, type SupabaseClient, type Session, type AuthChangeEvent } from '@supabase/supabase-js';

// Supabase client for Sean's Jaxtr instance.
// Session persists in localStorage so sign-in survives across reloads.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (_client) return _client;
  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'plotter-auth',
    },
  });
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Sign-in succeeded but no session returned');
  return data.session;
}

export async function signOut(): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut();
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const client = getSupabase();
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
