import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Save, X } from 'lucide-react';
import { db } from '@/data/localDb';
import {
  GlCategory,
  TERMINAL_STATES,
  type PartEvent,
} from '@/types';
import { updatePart, advanceState } from '@/services/partRepository';
import { validNextStates, type StateTransition } from '@/utils/stateMachine';
import { daysBetween, daysSince, formatDateTime, relativeShort } from '@/utils/dateMath';
import { StateBadge } from '@/components/StateBadge';
import { StateAdvanceSheet } from '@/components/StateAdvanceSheet';

interface Props {
  partId: string;
  onBack: () => void;
}

const GL_LABELS: Record<GlCategory, string> = {
  [GlCategory.ENGINE_PARTS]: 'Engine',
  [GlCategory.BOAT_PARTS]: 'Boat',
  [GlCategory.TRAILER_PARTS]: 'Trailer',
  [GlCategory.ELECTRICAL]: 'Electrical',
  [GlCategory.HARDWARE]: 'Hardware',
  [GlCategory.CONSUMABLES]: 'Consumables',
  [GlCategory.SHOP_SUPPLY]: 'Shop supply',
  [GlCategory.ACCESSORY]: 'Accessory',
  [GlCategory.OTHER]: 'Other',
};

export function PartDetailPage({ partId, onBack }: Props) {
  const part = useLiveQuery(() => db.parts.get(partId), [partId]);
  const vendor = useLiveQuery(
    async () => (part ? await db.vendors.get(part.vendor_id) : undefined),
    [part?.vendor_id],
  );
  const events = useLiveQuery(
    () => db.events.where('part_id').equals(partId).toArray(),
    [partId],
  ) ?? [];
  const purchases = useLiveQuery(
    () => db.customer_purchases.where('part_id').equals(partId).toArray(),
    [partId],
  ) ?? [];

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [events],
  );
  const latestEvent = sortedEvents[0];

  const [pendingTransition, setPendingTransition] = useState<StateTransition | null>(null);
  const [editing, setEditing] = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);

  if (!part) {
    return (
      <div className="min-h-screen bg-navy-900 text-white flex items-center justify-center">
        <div className="text-white/60 text-sm">Loading…</div>
      </div>
    );
  }

  const margin = part.msrp - part.dealer_cost;
  const marginPct = part.dealer_cost > 0 ? (margin / part.dealer_cost) * 100 : null;
  const daysInState = latestEvent ? daysSince(latestEvent.occurred_at) : null;
  const daysOrderToReceive =
    part.date_ordered && part.date_received ? daysBetween(part.date_ordered, part.date_received) : null;

  const transitions = validNextStates(part.current_state);
  const terminal = TERMINAL_STATES.has(part.current_state);

  const handleConfirmTransition = async (data: {
    wo_number?: string;
    customer_name?: string;
    sale_price?: number;
    notes?: string;
  }) => {
    if (!pendingTransition) return;
    await advanceState({
      part_id: part.id,
      to_state: pendingTransition.to,
      wo_number: data.wo_number,
      customer_name: data.customer_name,
      sale_price: data.sale_price,
      notes: data.notes,
    });
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white safe-top pb-32">
      <header className="px-4 pt-3 pb-3 border-b border-white/5 flex items-center justify-between gap-2 sticky top-0 bg-navy-900/95 backdrop-blur z-10">
        <button
          onClick={onBack}
          className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 text-center">
          <div className="font-mono text-sm text-gold-400">{part.part_number}</div>
        </div>
        {!terminal && (
          <button
            onClick={() => setEditing((e) => !e)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"
            aria-label={editing ? 'Cancel edit' : 'Edit'}
          >
            {editing ? <X className="w-5 h-5" /> : <Pencil className="w-4 h-4" />}
          </button>
        )}
        {terminal && <div className="w-10" />}
      </header>

      <section className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-snug">{part.description}</h1>
          <StateBadge state={part.current_state} />
        </div>
        {latestEvent?.wo_number && (
          <div className="mt-2 text-sm text-white/70">
            <span className="text-white/40">WO </span>
            <span className="font-mono">{latestEvent.wo_number}</span>
            {latestEvent.customer_name && (
              <>
                <span className="text-white/40"> · </span>
                <span>{latestEvent.customer_name}</span>
              </>
            )}
          </div>
        )}
        {vendor && (
          <div className="mt-1 text-xs text-white/50">
            from {vendor.vendor_name} <span className="text-white/30">· {vendor.vendor_code}</span>
          </div>
        )}
      </section>

      <section className="px-4 mt-5">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Dealer cost" value={fmtMoney(part.dealer_cost)} />
          <Metric label="MSRP" value={fmtMoney(part.msrp)} />
          <Metric
            label="Margin"
            value={
              marginPct === null
                ? '—'
                : `${fmtMoney(margin)} · ${marginPct.toFixed(0)}%`
            }
          />
          <Metric
            label="In current state"
            value={daysInState === null ? '—' : daysInState === 0 ? 'today' : `${daysInState}d`}
          />
          {daysOrderToReceive !== null && (
            <Metric label="Order → receive" value={`${daysOrderToReceive}d`} />
          )}
          <Metric label="Category" value={GL_LABELS[part.gl_category]} />
        </div>
      </section>

      {!terminal && transitions.length > 0 && (
        <section className="px-4 mt-6">
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Advance state</h2>
          <div className="space-y-2">
            {transitions.map((t) => (
              <button
                key={t.to}
                onClick={() => setPendingTransition(t)}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between border transition-colors ${
                  t.primary
                    ? 'bg-gold-500 text-navy-900 border-gold-500 hover:bg-gold-400'
                    : t.destructive
                      ? 'bg-navy-800 border-red-500/30 text-red-300'
                      : 'bg-navy-800 border-white/10 text-white/80'
                }`}
              >
                <div>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className={`text-[11px] mt-0.5 ${t.primary ? 'text-navy-900/70' : 'text-white/40'}`}>
                    {part.current_state} → {t.to}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 ${t.primary ? 'text-navy-900/60' : 'text-white/30'}`} />
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <EditCard
          part={part}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}

      <section className="px-4 mt-6">
        <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Timeline</h2>
        <Timeline events={sortedEvents} />
      </section>

      {part.notes && !editing && (
        <section className="px-4 mt-6">
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Notes</h2>
          <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 whitespace-pre-wrap">
            {part.notes}
          </div>
        </section>
      )}

      {vendor && (
        <section className="px-4 mt-6">
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Vendor</h2>
          <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3">
            <div className="text-sm text-white">{vendor.vendor_name}</div>
            <div className="text-xs text-white/40 mt-0.5">{vendor.vendor_code}</div>
            {vendor.contact_name && <div className="text-xs text-white/60 mt-2">{vendor.contact_name}</div>}
            {vendor.phone && <div className="text-xs text-white/60">{vendor.phone}</div>}
            {vendor.email && <div className="text-xs text-white/60">{vendor.email}</div>}
            {vendor.price_file_last_updated && (
              <div className="text-[10px] text-white/40 mt-2">
                Price file updated {relativeShort(vendor.price_file_last_updated)}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="px-4 mt-6">
        <button
          onClick={() => setPurchasesOpen((o) => !o)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-[11px] uppercase tracking-wide text-white/40">
            Customer purchases ({purchases.length})
          </h2>
          {purchasesOpen ? (
            <ChevronDown className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/40" />
          )}
        </button>
        {purchasesOpen && (
          <div className="mt-2">
            {purchases.length === 0 ? (
              <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/40">
                No purchases yet. NLA parts will still show this history forever once they have sales.
              </div>
            ) : (
              <ul className="space-y-2">
                {purchases
                  .sort((a, b) => b.date_purchased.localeCompare(a.date_purchased))
                  .map((p) => (
                    <li
                      key={p.id}
                      className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3 flex items-start justify-between"
                    >
                      <div>
                        <div className="text-sm text-white">{p.customer_name}</div>
                        {p.wo_number && (
                          <div className="text-[11px] text-white/40 font-mono mt-0.5">{p.wo_number}</div>
                        )}
                        <div className="text-[11px] text-white/40 mt-0.5">{relativeShort(p.date_purchased)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gold-400">{fmtMoney(p.price_sold)}</div>
                        <div className="text-[10px] text-white/40">qty {p.quantity}</div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <StateAdvanceSheet
        open={!!pendingTransition}
        part={part}
        transition={pendingTransition}
        prefillWoNumber={latestEvent?.wo_number}
        prefillCustomer={latestEvent?.customer_name}
        onClose={() => setPendingTransition(null)}
        onConfirm={handleConfirmTransition}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-navy-800 border border-white/10 rounded-xl px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="text-sm font-medium text-white mt-0.5">{value}</div>
    </div>
  );
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function Timeline({ events }: { events: PartEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/40">
        No events recorded yet.
      </div>
    );
  }

  return (
    <ol className="relative space-y-0">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-white/10" aria-hidden />
      {events.map((evt, idx) => (
        <li key={evt.id} className="relative pl-9 pb-4">
          <div
            className={`absolute left-2 top-1 w-2.5 h-2.5 rounded-full ring-2 ring-navy-900 ${
              idx === 0 ? 'bg-gold-500' : 'bg-white/30'
            }`}
            aria-hidden
          />
          <div className="text-sm text-white">
            {evt.from_state ? (
              <>
                <span className="text-white/40">{evt.from_state}</span>
                <span className="text-white/30"> → </span>
                <span className="text-white">{evt.to_state}</span>
              </>
            ) : (
              <span className="text-white">{evt.to_state}</span>
            )}
          </div>
          <div className="text-[11px] text-white/50 mt-0.5">
            {formatDateTime(evt.occurred_at)} · {evt.actor_role.toLowerCase().replace(/_/g, ' ')}
          </div>
          {(evt.unit_cost !== undefined || evt.unit_price !== undefined) && (
            <div className="text-[11px] text-white/50 mt-0.5">
              {evt.unit_price !== undefined && `sold ${fmtMoney(evt.unit_price)}`}
              {evt.unit_cost !== undefined && evt.unit_price === undefined && `cost ${fmtMoney(evt.unit_cost)}`}
            </div>
          )}
          {evt.wo_number && (
            <div className="text-[11px] text-gold-400/80 font-mono mt-0.5">{evt.wo_number}</div>
          )}
          {evt.notes && (
            <div className="text-[11px] text-white/60 mt-1 italic">"{evt.notes}"</div>
          )}
        </li>
      ))}
    </ol>
  );
}

function EditCard({
  part,
  onCancel,
  onSaved,
}: {
  part: { id: string; part_number: string; description: string; dealer_cost: number; msrp: number; min_stock_qty: number; gl_category: GlCategory; notes?: string };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [partNumber, setPartNumber] = useState(part.part_number);
  const [description, setDescription] = useState(part.description);
  const [dealerCost, setDealerCost] = useState(part.dealer_cost.toFixed(2));
  const [msrp, setMsrp] = useState(part.msrp.toFixed(2));
  const [minStock, setMinStock] = useState(part.min_stock_qty.toString());
  const [glCategory, setGlCategory] = useState<GlCategory>(part.gl_category);
  const [notes, setNotes] = useState(part.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectAll = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.select();

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePart({
        part_id: part.id,
        part_number: partNumber,
        description,
        dealer_cost: parseFloat(dealerCost),
        msrp: parseFloat(msrp),
        min_stock_qty: parseInt(minStock, 10),
        gl_category: glCategory,
        notes,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="px-4 mt-6">
      <div className="bg-navy-800 border border-gold-500/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wide text-gold-400">Edit fields</h2>
        </div>
        <Labeled label="Part number">
          <input
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            onFocus={selectAll}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="input font-mono"
          />
        </Labeled>
        <Labeled label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={selectAll}
            className="input"
          />
        </Labeled>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Dealer cost">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={dealerCost}
              onChange={(e) => setDealerCost(e.target.value)}
              onFocus={selectAll}
              className="input"
            />
          </Labeled>
          <Labeled label="MSRP">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={msrp}
              onChange={(e) => setMsrp(e.target.value)}
              onFocus={selectAll}
              className="input"
            />
          </Labeled>
        </div>
        <Labeled label="Min stock">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            onFocus={selectAll}
            className="input"
          />
        </Labeled>
        <Labeled label="Category">
          <select
            value={glCategory}
            onChange={(e) => setGlCategory(e.target.value as GlCategory)}
            className="input"
          >
            {(Object.keys(GL_LABELS) as GlCategory[]).map((g) => (
              <option key={g} value={g}>{GL_LABELS[g]}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input resize-none" />
        </Labeled>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-white/70 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-gold-500 text-navy-900 text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-white/40 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
