import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Download } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { detailForWorkOrder } from '@/services/workOrderQueries';
import { formatWorkOrderBilling } from '@/utils/exportFormat';
import { relativeShort } from '@/utils/dateMath';
import { StateBadge } from '@/components/StateBadge';
import { ExportListSheet } from '@/components/ExportListSheet';
import type { Part } from '@/types';

interface Props {
  woNumber: string;
  onBack: () => void;
  onOpenPart: (partId: string) => void;
}

export function WorkOrderDetailPage({ woNumber, onBack, onOpenPart }: Props) {
  const detail = useLiveQuery(() => detailForWorkOrder(woNumber), [woNumber]);
  const loading = detail === undefined;
  const [exportOpen, setExportOpen] = useState(false);

  const billingText = useMemo(() => {
    if (!detail) return '';
    return formatWorkOrderBilling({
      wo_number: detail.wo_number,
      customer_name: detail.customer_name,
      ready_to_bill: detail.ready_to_bill,
      billed: detail.billed,
      used: detail.used,
      total_sold_value: detail.total_sold_value,
    });
  }, [detail]);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 text-white flex items-center justify-center">
        <div className="text-white/60 text-sm">Loading…</div>
      </div>
    );
  }
  if (detail === null) {
    return (
      <div className="min-h-screen bg-navy-900 text-white flex items-center justify-center">
        <div className="text-white/60 text-sm">Work order not found</div>
      </div>
    );
  }
  if (!detail) return null;

  const margin = detail.total_sold_value - detail.total_dealer_cost;
  const billableTotal =
    detail.billed.reduce((s, p) => s + p.msrp, 0) +
    detail.ready_to_bill.reduce((s, p) => s + p.msrp, 0);

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
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm text-gold-400 truncate">{detail.wo_number}</div>
          {detail.customer_name && (
            <div className="text-[11px] text-white/60 truncate">{detail.customer_name}</div>
          )}
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
            detail.status === 'open'
              ? 'bg-gold-500/20 text-gold-400'
              : 'bg-white/5 text-white/40'
          }`}
        >
          {detail.status}
        </span>
      </header>

      <section className="px-4 pt-4 grid grid-cols-2 gap-2">
        <Metric label="Customer total" value={`$${billableTotal.toFixed(2)}`} accent />
        <Metric label="Margin" value={detail.total_sold_value > 0 ? `$${margin.toFixed(2)}` : '—'} />
        <Metric label="Parts" value={detail.parts_count.toString()} />
        <Metric
          label="Started"
          value={detail.first_event_at ? relativeShort(detail.first_event_at) : '—'}
        />
      </section>

      <section className="px-4 mt-4">
        <button
          onClick={() => setExportOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gold-500 text-navy-900 font-medium active:scale-[0.98] transition-transform"
        >
          <Download className="w-4 h-4" />
          Export billing list
        </button>
      </section>

      <Group
        title="Ready to bill"
        subtitle="Staged for this job, not yet invoiced"
        parts={detail.ready_to_bill}
        accent="gold"
        onOpenPart={onOpenPart}
        showPrice="msrp"
      />

      <Group
        title="Sold"
        subtitle="Already invoiced to customer"
        parts={detail.billed}
        accent="emerald"
        onOpenPart={onOpenPart}
        showPrice="msrp"
      />

      <Group
        title="Used (shop supply)"
        subtitle="Consumed on the job, not billed to customer"
        parts={detail.used}
        accent="purple"
        onOpenPart={onOpenPart}
        showPrice="cost"
      />

      <Group
        title="In flight"
        subtitle="Ordered, backordered, or received — not yet committed"
        parts={detail.in_flight}
        onOpenPart={onOpenPart}
        showPrice="cost"
      />

      {detail.returned.length > 0 && (
        <Group
          title="Returned"
          subtitle="Sent back to vendor or returned by customer"
          parts={detail.returned}
          accent="amber"
          onOpenPart={onOpenPart}
          showPrice="cost"
        />
      )}

      <ExportListSheet
        open={exportOpen}
        title={`${detail.wo_number} billing list`}
        text={billingText}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

function Group({
  title,
  subtitle,
  parts,
  accent,
  onOpenPart,
  showPrice,
}: {
  title: string;
  subtitle: string;
  parts: Part[];
  accent?: 'gold' | 'emerald' | 'amber' | 'purple';
  onOpenPart: (id: string) => void;
  showPrice: 'msrp' | 'cost';
}) {
  if (parts.length === 0) return null;
  const sectionTotal = parts.reduce((s, p) => s + (showPrice === 'msrp' ? p.msrp : p.dealer_cost), 0);

  return (
    <section className="px-4 mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[11px] uppercase tracking-wide text-white/40">
          {title} ({parts.length})
        </h2>
        <span className="text-xs text-white/50">
          {showPrice === 'msrp' ? '' : 'cost '}${sectionTotal.toFixed(2)}
        </span>
      </div>
      <p className="text-[11px] text-white/40 mb-2 -mt-1">{subtitle}</p>
      <ul className="space-y-2">
        {parts.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onOpenPart(p.id)}
              className={`w-full text-left rounded-xl p-3 border bg-navy-800 hover:bg-navy-700 transition-colors flex items-center justify-between gap-2 ${
                accent === 'gold'
                  ? 'border-gold-500/30'
                  : accent === 'emerald'
                    ? 'border-emerald-500/20'
                    : accent === 'amber'
                      ? 'border-amber-500/20'
                      : accent === 'purple'
                        ? 'border-purple-500/20'
                        : 'border-white/10'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gold-400 truncate">{p.part_number}</span>
                  <StateBadge state={p.current_state} compact />
                </div>
                <div className="text-xs text-white/80 truncate mt-0.5">{p.description}</div>
              </div>
              <div className="flex-none text-right">
                <div className={`text-sm ${showPrice === 'msrp' ? 'text-gold-400' : 'text-white/70'}`}>
                  ${(showPrice === 'msrp' ? p.msrp : p.dealer_cost).toFixed(2)}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-white/30 inline mt-0.5" />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        accent ? 'bg-gold-500/10 border-gold-500/30' : 'bg-navy-800 border-white/10'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={`text-base font-medium mt-0.5 ${accent ? 'text-gold-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}
