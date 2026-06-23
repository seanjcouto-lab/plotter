import { useMemo, useState } from 'react';
import { ArrowLeft, Download, Phone, Mail, ExternalLink, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { detailForVendor } from '@/services/vendorQueries';
import { formatEodSendList } from '@/utils/exportFormat';
import { formatDateTime, relativeShort } from '@/utils/dateMath';
import { db } from '@/data/localDb';
import { StateBadge } from '@/components/StateBadge';
import { ExportListSheet } from '@/components/ExportListSheet';
import type { Part, PartEvent } from '@/types';

interface Props {
  vendorId: string;
  onBack: () => void;
  onOpenPart: (partId: string) => void;
}

export function VendorDetailPage({ vendorId, onBack, onOpenPart }: Props) {
  const detail = useLiveQuery(() => detailForVendor(vendorId), [vendorId]);
  const loading = detail === undefined;

  // Pull WO# + customer for each open order from its latest event (the thread).
  const orderContext = useLiveQuery(async () => {
    if (!detail) return new Map<string, { wo_number?: string; customer_name?: string }>();
    const ctx = new Map<string, { wo_number?: string; customer_name?: string }>();
    await Promise.all(
      detail.openOrders.concat(detail.backOrders).map(async (p: Part) => {
        const events = (await db.events.where('part_id').equals(p.id).toArray()) as PartEvent[];
        const latest = events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
        if (latest) ctx.set(p.id, { wo_number: latest.wo_number, customer_name: latest.customer_name });
      }),
    );
    return ctx;
  }, [detail]) ?? new Map<string, { wo_number?: string; customer_name?: string }>();

  const [exportOpen, setExportOpen] = useState(false);

  const eodText = useMemo(() => {
    if (!detail) return '';
    return formatEodSendList(detail.vendor, detail.openOrders, orderContext);
  }, [detail, orderContext]);

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
        <div className="text-white/60 text-sm">Vendor not found</div>
      </div>
    );
  }
  if (!detail) {
    return null;
  }

  const { vendor, openOrders, backOrders, recentReceipts, leadTimeDays, leadTimeSampleSize, lifetimePartsCount, lastReceivedAt } = detail;
  const totalOpenCost = openOrders.reduce((sum, p) => sum + p.dealer_cost, 0);

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
          <div className="text-sm font-semibold truncate">{vendor.vendor_name}</div>
          <div className="text-[10px] font-mono text-white/40">{vendor.vendor_code}</div>
        </div>
      </header>

      <section className="px-4 pt-4">
        <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3 space-y-2">
          {vendor.contact_name && <div className="text-sm text-white/80">{vendor.contact_name}</div>}
          {vendor.phone && (
            <a href={`tel:${vendor.phone}`} className="flex items-center gap-2 text-sm text-white/70 hover:text-gold-400">
              <Phone className="w-3.5 h-3.5" /> {vendor.phone}
            </a>
          )}
          {vendor.email && (
            <a href={`mailto:${vendor.email}`} className="flex items-center gap-2 text-sm text-white/70 hover:text-gold-400">
              <Mail className="w-3.5 h-3.5" /> {vendor.email}
            </a>
          )}
          {vendor.portal_url && (
            <a
              href={vendor.portal_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-gold-400 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Vendor portal
            </a>
          )}
        </div>
      </section>

      <section className="px-4 mt-4 grid grid-cols-3 gap-2">
        <Metric label="Avg lead" value={leadTimeDays !== null ? `${leadTimeDays}d` : '—'} sub={leadTimeSampleSize > 0 ? `${leadTimeSampleSize} receipts` : 'no data'} />
        <Metric label="Lifetime" value={`${lifetimePartsCount}`} sub="parts" />
        <Metric label="Last receipt" value={lastReceivedAt ? relativeShort(lastReceivedAt) : '—'} sub="" />
      </section>

      <section className="px-4 mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-wide text-white/40">
            EOD send list ({openOrders.length})
          </h2>
          {openOrders.length > 0 && (
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1.5 text-xs text-gold-400 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
        </div>
        {openOrders.length === 0 ? (
          <div className="mt-2 bg-navy-800 border border-white/10 rounded-xl px-4 py-6 text-center text-sm text-white/40">
            Nothing currently on order with this vendor.
          </div>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {openOrders.map((p) => (
                <OrderRow
                  key={p.id}
                  part={p}
                  context={orderContext.get(p.id)}
                  onOpen={() => onOpenPart(p.id)}
                />
              ))}
            </ul>
            <div className="mt-3 text-right text-xs text-white/50">
              Est. cost <span className="text-gold-400">${totalOpenCost.toFixed(2)}</span>
            </div>
          </>
        )}
      </section>

      {backOrders.length > 0 && (
        <section className="px-4 mt-6">
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            On backorder ({backOrders.length})
          </h2>
          <ul className="space-y-2">
            {backOrders.map((p) => (
              <OrderRow
                key={p.id}
                part={p}
                context={orderContext.get(p.id)}
                onOpen={() => onOpenPart(p.id)}
                amber
              />
            ))}
          </ul>
        </section>
      )}

      <section className="px-4 mt-6">
        <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Recent receipts</h2>
        {recentReceipts.length === 0 ? (
          <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/40">
            No receipts logged yet for this vendor.
          </div>
        ) : (
          <ul className="space-y-2">
            {recentReceipts.map((r) => (
              <li key={r.part.id}>
                <button
                  onClick={() => onOpenPart(r.part.id)}
                  className="w-full text-left bg-navy-800 border border-white/10 rounded-xl p-3 hover:bg-navy-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-gold-400 truncate">{r.part.part_number}</div>
                    <div className="text-xs text-white/70 truncate">{r.part.description}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">{formatDateTime(r.receivedAt)}</div>
                  </div>
                  <div className="flex-none text-right">
                    {r.leadDays !== null && (
                      <div className="text-xs text-emerald-300">{r.leadDays}d lead</div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExportListSheet
        open={exportOpen}
        title={`EOD list — ${vendor.vendor_name}`}
        text={eodText}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

function OrderRow({
  part,
  context,
  onOpen,
  amber,
}: {
  part: Part;
  context?: { wo_number?: string; customer_name?: string };
  onOpen: () => void;
  amber?: boolean;
}) {
  const ago = relativeShort(part.date_ordered);
  return (
    <li>
      <button
        onClick={onOpen}
        className={`w-full text-left rounded-xl p-3 border transition-colors flex items-center justify-between gap-2 ${
          amber
            ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
            : 'bg-navy-800 border-white/10 hover:bg-navy-700'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gold-400 truncate">{part.part_number}</span>
            <StateBadge state={part.current_state} compact />
          </div>
          <div className="text-xs text-white/80 truncate mt-0.5">{part.description}</div>
          <div className="text-[11px] text-white/50 mt-1 flex items-center gap-2">
            {context?.wo_number ? (
              <>
                <span className="font-mono text-gold-400/80">{context.wo_number}</span>
                {context.customer_name && <span>· {context.customer_name}</span>}
              </>
            ) : (
              <span className="text-white/40">stock</span>
            )}
            {ago && <span className="text-white/30">· ordered {ago}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-none">
          <div className="text-xs text-white/70">${part.dealer_cost.toFixed(2)}</div>
          <ChevronRight className="w-3.5 h-3.5 text-white/30" />
        </div>
      </button>
    </li>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-navy-800 border border-white/10 rounded-xl px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="text-base font-medium text-white mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}
