import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { statsForAllVendors } from '@/services/vendorQueries';
import { relativeShort } from '@/utils/dateMath';
import type { VendorStats } from '@/services/vendorQueries';

interface Props {
  onBack: () => void;
  onOpenVendor: (vendorId: string) => void;
}

export function VendorListPage({ onBack, onOpenVendor }: Props) {
  const stats: VendorStats[] | undefined = useLiveQuery(() => statsForAllVendors(), []);
  const loading = stats === undefined;
  const list = stats ?? [];

  const totalOpenOrders = list.reduce((sum, s) => sum + s.openOrderCount, 0);
  const totalBackOrders = list.reduce((sum, s) => sum + s.backOrderCount, 0);

  return (
    <div className="min-h-screen bg-navy-900 text-white safe-top pb-10">
      <header className="px-4 pt-3 pb-3 border-b border-white/5 flex items-center gap-2 sticky top-0 bg-navy-900/95 backdrop-blur z-10">
        <button
          onClick={onBack}
          className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">Vendors</h1>
        <span className="text-xs text-white/40">{list.length}</span>
      </header>

      <section className="px-4 pt-4 grid grid-cols-2 gap-2">
        <SummaryTile label="Open orders" value={totalOpenOrders.toString()} accent={totalOpenOrders > 0} />
        <SummaryTile label="On backorder" value={totalBackOrders.toString()} accent={false} amber={totalBackOrders > 0} />
      </section>

      <section className="px-4 mt-4">
        {loading ? (
          <div className="py-12 text-center text-white/40 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-white/40 text-sm">No vendors yet.</div>
        ) : (
          <ul className="space-y-2">
            {list.map((s) => (
              <VendorRow key={s.vendor.id} stats={s} onOpen={() => onOpenVendor(s.vendor.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function VendorRow({ stats, onOpen }: { stats: VendorStats; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full text-left bg-navy-800 border border-white/5 rounded-xl p-3 hover:bg-navy-700 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white truncate">{stats.vendor.vendor_name}</div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">{stats.vendor.vendor_code}</div>
            <div className="flex gap-3 mt-2 text-[11px]">
              <Chip label="Open" value={stats.openOrderCount} highlight={stats.openOrderCount > 0} />
              {stats.backOrderCount > 0 && <Chip label="BO" value={stats.backOrderCount} amber />}
              {stats.leadTimeDays !== null && (
                <Chip label="Lead" value={`${stats.leadTimeDays}d`} subtle />
              )}
            </div>
            {stats.lastReceivedAt && (
              <div className="text-[10px] text-white/40 mt-1.5">
                Last receipt {relativeShort(stats.lastReceivedAt)}
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-white/30 mt-1 flex-none" />
        </div>
      </button>
    </li>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  amber,
}: {
  label: string;
  value: string;
  accent?: boolean;
  amber?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        accent
          ? 'bg-gold-500/10 border-gold-500/30'
          : amber
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-navy-800 border-white/10'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? 'text-gold-400' : amber ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  highlight,
  amber,
  subtle,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  amber?: boolean;
  subtle?: boolean;
}) {
  const color = highlight
    ? 'text-gold-400'
    : amber
      ? 'text-amber-300'
      : subtle
        ? 'text-white/50'
        : 'text-white/70';
  return (
    <span className={`${color}`}>
      <span className="text-white/40">{label} </span>
      {value}
    </span>
  );
}
