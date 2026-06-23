import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PartState, type Part } from '@/types';
import { type StateTransition } from '@/utils/stateMachine';

interface Props {
  open: boolean;
  part: Part | null;
  transition: StateTransition | null;
  // Pre-filled values from the part's thread (latest event)
  prefillWoNumber?: string;
  prefillCustomer?: string;
  onClose: () => void;
  onConfirm: (data: {
    wo_number?: string;
    customer_name?: string;
    sale_price?: number;
    notes?: string;
  }) => Promise<void>;
}

export function StateAdvanceSheet({
  open,
  part,
  transition,
  prefillWoNumber,
  prefillCustomer,
  onClose,
  onConfirm,
}: Props) {
  const [woNumber, setWoNumber] = useState('');
  const [customer, setCustomer] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && part && transition) {
      setWoNumber(prefillWoNumber || '');
      setCustomer(prefillCustomer || '');
      setSalePrice(transition.requiresSalePrice ? part.msrp.toFixed(2) : '');
      setNotes('');
      setError(null);
    }
  }, [open, part, transition, prefillWoNumber, prefillCustomer]);

  if (!open || !part || !transition) return null;

  const handleConfirm = async () => {
    if (transition.requiresWoNumber && !woNumber.trim()) {
      setError('Work order # is required to stage');
      return;
    }
    if (transition.requiresCustomer && !customer.trim()) {
      setError('Customer name is required');
      return;
    }
    if (transition.requiresNotes && !notes.trim()) {
      setError('A short note is required');
      return;
    }
    let price: number | undefined;
    if (transition.requiresSalePrice) {
      price = parseFloat(salePrice);
      if (!Number.isFinite(price) || price < 0) {
        setError('Sale price must be a number');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm({
        wo_number: woNumber || undefined,
        customer_name: customer || undefined,
        sale_price: price,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const destructive = transition.destructive;

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-navy-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border-t border-white/10 sm:border max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/40">
              {part.current_state} → {transition.to}
            </div>
            <h2 className="text-white font-medium mt-0.5">{transition.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 overflow-y-auto">
          <div className="text-sm text-white/80">
            <span className="font-mono text-gold-400">{part.part_number}</span> · {part.description}
          </div>

          {transition.requiresWoNumber && (
            <Field label="Work order #" required>
              <input
                value={woNumber}
                onChange={(e) => setWoNumber(e.target.value)}
                placeholder="e.g. WO-12851"
                autoComplete="off"
                className="input font-mono"
                autoFocus
              />
            </Field>
          )}

          {transition.requiresCustomer && (
            <Field label="Customer" required>
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="e.g. Bob Burditsman"
                className="input"
                autoFocus={!transition.requiresWoNumber}
              />
            </Field>
          )}

          {transition.requiresSalePrice && (
            <Field label="Sale price" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="input pl-7"
                />
              </div>
              <p className="mt-1 text-xs text-white/40">
                Pre-filled with MSRP (${part.msrp.toFixed(2)}). Override for discounts or contract pricing.
              </p>
            </Field>
          )}

          <Field label={transition.requiresNotes ? 'Note (required)' : 'Note (optional)'} required={transition.requiresNotes}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={notePlaceholder(transition.to)}
              className="input resize-none"
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-3 flex gap-2 safe-bottom">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-white/70 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 ${
              destructive ? 'bg-red-500 text-white' : 'bg-gold-500 text-navy-900'
            }`}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function notePlaceholder(to: PartState): string {
  switch (to) {
    case PartState.BACK_ORDERED:
      return 'ETA, vendor notes…';
    case PartState.RETURNED:
      return 'Reason for return…';
    case PartState.NLA:
      return 'Why discontinued, last-known equivalent…';
    case PartState.SOLD:
      return 'Anything memorable about the sale…';
    default:
      return 'Notes about this transition…';
  }
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-white/40 mb-1.5">
        {label} {required && <span className="text-gold-500">*</span>}
      </label>
      {children}
    </div>
  );
}
