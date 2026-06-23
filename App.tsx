import { useEffect, useState } from 'react';
import { Cloud, CloudOff, LogOut } from 'lucide-react';
import { DashboardPage } from '@/pages/DashboardPage';
import { AddPartPage } from '@/pages/AddPartPage';
import { BulkAddPage } from '@/pages/BulkAddPage';
import { PartDetailPage } from '@/pages/PartDetailPage';
import { VendorListPage } from '@/pages/VendorListPage';
import { VendorDetailPage } from '@/pages/VendorDetailPage';
import { WorkOrderListPage } from '@/pages/WorkOrderListPage';
import { WorkOrderDetailPage } from '@/pages/WorkOrderDetailPage';
import { SignInGate } from '@/components/SignInGate';
import { seedIfEmpty } from '@/data/seedMockData';
import {
  getCurrentSession,
  isSupabaseConfigured,
  onAuthChange,
  signOut,
} from '@/services/supabaseClient';
import { clearLocal, onSyncStatusChange, pushLocalThenHydrate, type SyncStatus } from '@/services/syncService';

type PartDetailOrigin =
  | { kind: 'dashboard' }
  | { kind: 'vendor-detail'; vendorId: string }
  | { kind: 'wo-detail'; woNumber: string };

type Route =
  | { name: 'dashboard' }
  | { name: 'add-part' }
  | { name: 'bulk-add'; startWithPhoto?: boolean }
  | { name: 'part-detail'; partId: string; origin: PartDetailOrigin }
  | { name: 'vendor-list' }
  | { name: 'vendor-detail'; vendorId: string }
  | { name: 'wo-list' }
  | { name: 'wo-detail'; woNumber: string };

type AuthState =
  | { status: 'checking' }
  | { status: 'signed-out' }      // Supabase configured, not signed in — show gate
  | { status: 'skipped' }         // Sean chose local-only this session
  | { status: 'signed-in'; email: string }
  | { status: 'no-supabase' };    // env var missing — local-only by config

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [seeded, setSeeded] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ online: false });

  useEffect(() => onSyncStatusChange(setSyncStatus), []);

  // Determine auth state on mount + subscribe to changes
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuth({ status: 'no-supabase' });
      return;
    }
    let cancelled = false;
    getCurrentSession().then((session) => {
      if (cancelled) return;
      if (session?.user?.email) {
        setAuth({ status: 'signed-in', email: session.user.email });
      } else {
        setAuth({ status: 'signed-out' });
      }
    });
    const unsub = onAuthChange((session) => {
      if (session?.user?.email) {
        setAuth({ status: 'signed-in', email: session.user.email });
      } else {
        setAuth((prev) => (prev.status === 'skipped' ? prev : { status: 'signed-out' }));
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Seed mock data ONLY in local-only modes (no-supabase or skipped).
  // When signed in, hydration from cloud is the source of truth.
  useEffect(() => {
    if (auth.status === 'checking' || auth.status === 'signed-out') return;
    if (auth.status === 'signed-in') {
      pushLocalThenHydrate()
        .catch((err) => console.error('Hydration failed', err))
        .finally(() => setSeeded(true));
      return;
    }
    seedIfEmpty()
      .catch((err) => console.error('Seed failed', err))
      .finally(() => setSeeded(true));
  }, [auth.status]);

  const handleSignOut = async () => {
    await signOut();
    // Clear local Dexie so the next sign-in re-hydrates fresh from cloud.
    // Otherwise stale local rows survive across sessions and confuse anyone
    // who wiped cloud expecting a blank slate.
    await clearLocal().catch((err) => console.warn('Local clear failed', err));
    setSeeded(false);
    setAuth({ status: 'signed-out' });
  };

  // --- Gate: still checking auth ---
  if (auth.status === 'checking') {
    return <FullScreen>Loading Plotter…</FullScreen>;
  }

  // --- Gate: needs sign-in ---
  if (auth.status === 'signed-out') {
    return (
      <SignInGate
        onSignedIn={() => {/* auth listener updates state */}}
        onSkip={() => setAuth({ status: 'skipped' })}
      />
    );
  }

  // --- Gate: seed/hydration in progress ---
  if (!seeded) {
    return <FullScreen>{auth.status === 'signed-in' ? 'Syncing with cloud…' : 'Loading Plotter…'}</FullScreen>;
  }

  // --- Routes ---
  if (route.name === 'add-part') {
    return (
      <AddPartPage
        onBack={() => setRoute({ name: 'dashboard' })}
        onSaved={(partId) => setRoute({ name: 'part-detail', partId, origin: { kind: 'dashboard' } })}
      />
    );
  }

  if (route.name === 'bulk-add') {
    return (
      <BulkAddPage
        startWithPhoto={route.startWithPhoto}
        onBack={() => setRoute({ name: 'dashboard' })}
        onSaved={() => setRoute({ name: 'dashboard' })}
      />
    );
  }

  if (route.name === 'part-detail') {
    const back = () => {
      if (route.origin.kind === 'vendor-detail') {
        setRoute({ name: 'vendor-detail', vendorId: route.origin.vendorId });
      } else if (route.origin.kind === 'wo-detail') {
        setRoute({ name: 'wo-detail', woNumber: route.origin.woNumber });
      } else {
        setRoute({ name: 'dashboard' });
      }
    };
    return <PartDetailPage partId={route.partId} onBack={back} />;
  }

  if (route.name === 'vendor-list') {
    return (
      <VendorListPage
        onBack={() => setRoute({ name: 'dashboard' })}
        onOpenVendor={(vendorId) => setRoute({ name: 'vendor-detail', vendorId })}
      />
    );
  }

  if (route.name === 'vendor-detail') {
    return (
      <VendorDetailPage
        vendorId={route.vendorId}
        onBack={() => setRoute({ name: 'vendor-list' })}
        onOpenPart={(partId) =>
          setRoute({
            name: 'part-detail',
            partId,
            origin: { kind: 'vendor-detail', vendorId: route.vendorId },
          })
        }
      />
    );
  }

  if (route.name === 'wo-list') {
    return (
      <WorkOrderListPage
        onBack={() => setRoute({ name: 'dashboard' })}
        onOpenWorkOrder={(woNumber) => setRoute({ name: 'wo-detail', woNumber })}
      />
    );
  }

  if (route.name === 'wo-detail') {
    return (
      <WorkOrderDetailPage
        woNumber={route.woNumber}
        onBack={() => setRoute({ name: 'wo-list' })}
        onOpenPart={(partId) =>
          setRoute({
            name: 'part-detail',
            partId,
            origin: { kind: 'wo-detail', woNumber: route.woNumber },
          })
        }
      />
    );
  }

  return (
    <>
      <DashboardPage
        onOpenAddSingle={() => setRoute({ name: 'add-part' })}
        onOpenAddBulk={() => setRoute({ name: 'bulk-add' })}
        onOpenAddPhoto={() => setRoute({ name: 'bulk-add', startWithPhoto: true })}
        onOpenPartDetail={(partId) =>
          setRoute({ name: 'part-detail', partId, origin: { kind: 'dashboard' } })
        }
        onOpenVendors={() => setRoute({ name: 'vendor-list' })}
        onOpenWorkOrders={() => setRoute({ name: 'wo-list' })}
      />
      <SyncBadge auth={auth} sync={syncStatus} onSignOut={handleSignOut} />
    </>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy-900 text-white flex items-center justify-center">
      <div className="text-white/60 text-sm">{children}</div>
    </div>
  );
}

function SyncBadge({
  auth,
  sync,
  onSignOut,
}: {
  auth: AuthState;
  sync: SyncStatus;
  onSignOut: () => void;
}) {
  if (auth.status === 'signed-in') {
    return (
      <button
        onClick={onSignOut}
        title={`Signed in as ${auth.email} · ${sync.online ? 'Synced' : sync.lastError ?? 'Sync pending'}`}
        className={`fixed bottom-2 left-2 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded backdrop-blur ${
          sync.online
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
        }`}
      >
        {sync.online ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
        {sync.online ? 'cloud · synced' : 'cloud · offline'}
        <LogOut className="w-3 h-3 ml-1 opacity-50" />
      </button>
    );
  }
  return (
    <div className="fixed bottom-2 left-2 text-[10px] text-white/30 bg-navy-800/80 backdrop-blur px-2 py-1 rounded">
      {auth.status === 'no-supabase' ? 'local-only · supabase not configured' : 'local-only · skipped sign-in'}
    </div>
  );
}
