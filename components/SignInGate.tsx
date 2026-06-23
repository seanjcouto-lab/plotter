import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { signInWithPassword } from '@/services/supabaseClient';

interface Props {
  onSignedIn: () => void;
  onSkip: () => void;
}

export function SignInGate({ onSignedIn, onSkip }: Props) {
  const [email, setEmail] = useState('seanjcouto@gmail.com');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithPassword(email, password);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col items-center justify-center safe-top safe-bottom px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Plotter</h1>
          <p className="mt-2 text-sm text-white/50">Sign in to sync with your Jaxtr Supabase</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-white/40 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-white/40 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="input"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gold-500 text-navy-900 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2.5 text-xs text-white/40 hover:text-white/60"
          >
            Skip — work local-only (data won't sync)
          </button>
        </form>
      </div>
    </div>
  );
}
