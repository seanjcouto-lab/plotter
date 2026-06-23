import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listWorkOrders, type WorkOrderSummary } from '@/services/workOrderQueries';
import { relativeShort } from '@/utils/dateMath';

interface Props {
  onBack: () => void;
  onOpenWorkOrder: (woNumber: string) => void;
}

export function WorkOrderListPage({ onBack, onOpenWorkOrder }: Props) {
  const wos = useLiveQuery(() => listWorkOrders(), []);
  const loading = wos === undefined;
  const list = wos ?? [];
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (w) =>
        w.wo_number.toLowerCase().includes(q) ||
        (w.customer_name?.toLowerCase().includes(q) ?? false),
    );
  }, [list, query]);

  const openCount = list.filter((w) => w.status === 'open').length;
  const completeCount = list.length - openCount;

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
        <h1 className="text-lg font-semibold flex-1">Work orders</h1>
        <span className="text-xs text-white/40">{list.length}</span>
      </header>

      <section className="px-4 pt-4 grid grid-cols-2 gap-2">
        <SummaryTile label="Open" value={openCount.toString()} accent={openCount > 0} />
        <SummaryTile label="Complete" value={completeCount.toString()} subtle />
      </section>

      <section className="px-4 mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="search"
            inputMode="search"
            placeholder="Search WO# or customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-navy-800 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-gold-500/60"
          />
        </div>
      </section>

      <section className="px-4 mt-4">
        {loading ? (
          <div className="py-12 text-center text-white/40 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-white/40 text-sm">
            {list.length === 0
              ? 'No work orders yet. Attach a WO# when you add a part to start a thread.'
              : 'No matches.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((w) => (
              <WorkOrderRow key={w.wo_number} wo={w} onOpen={() => onOpenWorkOrder(w.wo_number)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WorkOrderRow({ wo, onOpen }: { wo: WorkOrderSummary; onOpen: () => void }) {
  const isOpen = wo.status === 'open';
  return (
    <li>
      <button
        onClick={onOpen}
        className={`w-full text-left bg-navy-800 border rounded-xl p-3 hover:bg-navy-700 transition-colors ${
          isOpen ? 'border-gold-500/30' : 'border-white/5 opacity-80'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gold-400">{wo.wo_number}</span>
              {!isOpen && (
                <span className="text-[10px] uppercase tracking-wide text-white/40 px-1.5 py-0.5 rounded bg-white/5">
                  complete
                </span>
              )}
            </div>
            {wo.customer_name && (
              <div className="text-xs text-white/80 truncate mt-0.5">{wo.customer_name}</div>
            )}
            <div className="flex gap-3 mt-1.5 text-[11px]">
              <Chip label="parts" value={wo.parts_count} />
              {wo.in_flight_count > 0 && <Chip label="in-flight" value={wo.in_flight_count} highlight />}
              {wo.billed_count > 0 && <Chip label="sold" value={wo.billed_count} />}
              {wo.used_count > 0 && <Chip label="used" value={wo.used_count} subtle />}
              {wo.returned_count > 0 && <Chip label="ret" value={wo.returned_count} amber />}
            </div>
            {wo.last_event_at && (
              <div className="text-[10px] text-white/40 mt-1.5">
                Last touch {relativeShort(wo.last_event_at)}
              </div>
            )}
          </div>
          <div className="flex-none text-right">
            {wo.total_sold_value > 0 && (
              <div className="text-xs text-gold-400">${wo.total_sold_value.toFixed(2)}</div>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-white/30 inline mt-1" />
          </div>
        </div>
      </button>
    </li>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  subtle,
}: {
  label: string;
  value: string;
  accent?: boolean;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        accent ? 'bg-gold-500/10 border-gold-500/30' : 'bg-navy-800 border-white/10'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? 'text-gold-400' : subtle ? 'text-white/70' : 'text-white'}`}>
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
        ? 'text-white/40'
        : 'text-white/70';
  return (
    <span className={color}>
      <span className="text-white/40">{label} </span>
      {value}
    </span>
  );
}
