import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, Plus, Search, Truck } from 'lucide-react';
import { db } from '@/data/localDb';
import {
  PART_STATE_ORDER,
  PartState,
  type Part,
  type PartStateFilter,
  type Vendor,
} from '@/types';
import { StateBadge } from '@/components/StateBadge';
import { AddActionSheet } from '@/components/AddActionSheet';

interface Props {
  onOpenAddSingle: () => void;
  onOpenAddBulk: () => void;
  onOpenAddPhoto: () => void;
  onOpenPartDetail: (partId: string) => void;
  onOpenVendors: () => void;
  onOpenWorkOrders: () => void;
}

const FILTERS: { value: PartStateFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...PART_STATE_ORDER.map((s) => ({ value: s, label: stateLabel(s) })),
];

function stateLabel(s: PartState): string {
  if (s === PartState.BACK_ORDERED) return 'Backordered';
  if (s === PartState.NLA) return 'NLA';
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export function DashboardPage({
  onOpenAddSingle,
  onOpenAddBulk,
  onOpenAddPhoto,
  onOpenPartDetail,
  onOpenVendors,
  onOpenWorkOrders,
}: Props) {
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [filter, setFilter] = useState<PartStateFilter>('ALL');
  const [query, setQuery] = useState('');

  const parts = useLiveQuery(() => db.parts.toArray(), []) ?? [];
  const vendors = useLiveQuery(() => db.vendors.toArray(), []) ?? [];
  const vendorById = useMemo(() => {
    const m = new Map<string, Vendor>();
    vendors.forEach((v) => m.set(v.id, v));
    return m;
  }, [vendors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parts
      .filter((p) => (filter === 'ALL' ? true : p.current_state === filter))
      .filter((p) =>
        q.length === 0
          ? true
          : p.part_number.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }, [parts, filter, query]);

  const stateCounts = useMemo(() => {
    const counts = new Map<PartStateFilter, number>();
    counts.set('ALL', parts.length);
    PART_STATE_ORDER.forEach((s) => counts.set(s, 0));
    parts.forEach((p) => counts.set(p.current_state, (counts.get(p.current_state) || 0) + 1));
    return counts;
  }, [parts]);

  return (
    <div className="flex flex-col min-h-screen bg-navy-900 text-white safe-top">
      <header className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Plotter</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">{parts.length} parts</span>
            <button
              onClick={onOpenWorkOrders}
              aria-label="Work orders"
              className="ml-1 w-9 h-9 rounded-full bg-navy-800 border border-white/10 flex items-center justify-center hover:bg-navy-700"
            >
              <ClipboardList className="w-4 h-4 text-gold-400" />
            </button>
            <button
              onClick={onOpenVendors}
              aria-label="Vendors"
              className="w-9 h-9 rounded-full bg-navy-800 border border-white/10 flex items-center justify-center hover:bg-navy-700"
            >
              <Truck className="w-4 h-4 text-gold-400" />
            </button>
          </div>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="search"
            inputMode="search"
            placeholder="Search part # or description"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-navy-800 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-gold-500/60"
          />
        </div>

        <div className="mt-3 -mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {FILTERS.map((f) => {
              const active = filter === f.value;
              const count = stateCounts.get(f.value) ?? 0;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-gold-500 text-navy-900'
                      : 'bg-navy-800 text-white/70 border border-white/10'
                  }`}
                >
                  {f.label} <span className={active ? 'text-navy-900/70' : 'text-white/40'}>· {count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-3 pb-24">
        {filtered.length === 0 ? (
          <EmptyState filter={filter} query={query} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <PartRow
                key={p.id}
                part={p}
                vendorName={vendorById.get(p.vendor_id)?.vendor_name ?? 'Unknown vendor'}
                onOpen={() => onOpenPartDetail(p.id)}
              />
            ))}
          </ul>
        )}
      </main>

      <button
        onClick={() => setAddSheetOpen(true)}
        aria-label="Add part"
        className="fixed bottom-6 right-5 w-14 h-14 rounded-full bg-gold-500 text-navy-900 shadow-lg shadow-gold-500/30 flex items-center justify-center active:scale-95 transition-transform safe-bottom"
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} />
      </button>

      <AddActionSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onSingle={onOpenAddSingle}
        onBulk={onOpenAddBulk}
        onPhoto={onOpenAddPhoto}
      />
    </div>
  );
}

function PartRow({
  part,
  vendorName,
  onOpen,
}: {
  part: Part;
  vendorName: string;
  onOpen: () => void;
}) {
  const days = daysSince(part.updated_at);
  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full text-left bg-navy-800 hover:bg-navy-700 border border-white/5 rounded-xl p-3 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gold-400">{part.part_number}</span>
              <StateBadge state={part.current_state} compact />
            </div>
            <p className="mt-1 text-sm text-white/90 truncate">{part.description}</p>
            <p className="mt-1 text-xs text-white/50 truncate">{vendorName}</p>
          </div>
          <div className="flex-none text-right">
            <div className="text-xs text-white/60">${part.msrp.toFixed(2)}</div>
            {days !== null && (
              <div className="text-[10px] text-white/40 mt-0.5">
                {days === 0 ? 'today' : `${days}d ago`}
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyState({ filter, query }: { filter: PartStateFilter; query: string }) {
  const hasFilter = filter !== 'ALL' || query.length > 0;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-navy-800 border border-white/10 flex items-center justify-center mb-4">
        <Search className="w-7 h-7 text-white/30" />
      </div>
      <h2 className="text-base font-medium text-white/80">
        {hasFilter ? 'No matches' : 'No parts yet'}
      </h2>
      <p className="mt-1 text-sm text-white/40 max-w-xs">
        {hasFilter
          ? 'Try a different filter or search.'
          : 'Tap the + button to log your first part.'}
      </p>
    </div>
  );
}
