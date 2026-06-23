import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronRight, ScanLine } from 'lucide-react';
import { db } from '@/data/localDb';
import { GlCategory, PartState, type Vendor } from '@/types';
import { createPart } from '@/services/partRepository';
import { isBarcodeScanSupported } from '@/services/barcodeScanner';
import { BarcodeScannerSheet } from '@/components/BarcodeScannerSheet';
import { VendorPickerSheet } from '@/components/VendorPickerSheet';

interface Props {
  onBack: () => void;
  onSaved: (partId: string) => void;
}

const GL_OPTIONS: { value: GlCategory; label: string }[] = [
  { value: GlCategory.ENGINE_PARTS, label: 'Engine' },
  { value: GlCategory.BOAT_PARTS, label: 'Boat' },
  { value: GlCategory.TRAILER_PARTS, label: 'Trailer' },
  { value: GlCategory.ELECTRICAL, label: 'Electrical' },
  { value: GlCategory.HARDWARE, label: 'Hardware' },
  { value: GlCategory.CONSUMABLES, label: 'Consumables' },
  { value: GlCategory.SHOP_SUPPLY, label: 'Shop supply' },
  { value: GlCategory.ACCESSORY, label: 'Accessory' },
  { value: GlCategory.OTHER, label: 'Other' },
];

export function AddPartPage({ onBack, onSaved }: Props) {
  const [partNumber, setPartNumber] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState<Vendor | undefined>();
  const [dealerCost, setDealerCost] = useState('');
  const [msrp, setMsrp] = useState('');
  const [minStockQty, setMinStockQty] = useState('1');
  const [glCategory, setGlCategory] = useState<GlCategory>(GlCategory.ENGINE_PARTS);
  const [initialState, setInitialState] = useState<PartState.ORDERED | PartState.RECEIVED>(PartState.ORDERED);
  const [woNumber, setWoNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const vendors = useLiveQuery(() => db.vendors.toArray(), []) ?? [];

  // Auto-pick the only vendor if there's exactly one — saves a tap.
  useEffect(() => {
    if (!vendor && vendors.length === 1) setVendor(vendors[0]);
  }, [vendors, vendor]);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!partNumber.trim()) errs.push('Part number is required');
    if (!description.trim()) errs.push('Description is required');
    if (!vendor) errs.push('Vendor is required');
    const dc = parseFloat(dealerCost);
    if (!Number.isFinite(dc) || dc < 0) errs.push('Dealer cost must be a number');
    const m = parseFloat(msrp);
    if (!Number.isFinite(m) || m < 0) errs.push('MSRP must be a number');
    const min = parseInt(minStockQty, 10);
    if (!Number.isFinite(min) || min < 0) errs.push('Min stock must be a whole number');
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0 || !vendor) return;

    setSaving(true);
    try {
      const part = await createPart({
        part_number: partNumber,
        description,
        vendor_id: vendor.id,
        dealer_cost: parseFloat(dealerCost),
        msrp: parseFloat(msrp),
        min_stock_qty: parseInt(minStockQty, 10),
        gl_category: glCategory,
        initial_state: initialState,
        wo_number: woNumber || undefined,
        customer_name: customerName || undefined,
        notes: notes || undefined,
      });
      onSaved(part.id);
    } catch (err) {
      setErrors([(err as Error).message || 'Save failed']);
    } finally {
      setSaving(false);
    }
  };

  const hasWo = woNumber.trim().length > 0;
  const scanSupported = isBarcodeScanSupported();

  return (
    <div className="min-h-screen bg-navy-900 text-white safe-top pb-32">
      <header className="px-4 pt-3 pb-3 border-b border-white/5 flex items-center gap-2">
        <button
          onClick={onBack}
          className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Add part</h1>
      </header>

      <div className="px-4 pt-4">
        <button
          onClick={() => setScannerOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gold-500 text-navy-900 font-medium shadow-lg shadow-gold-500/20 active:scale-[0.98] transition-transform"
        >
          <ScanLine className="w-5 h-5" />
          Scan barcode
        </button>
        {!scanSupported && (
          <p className="mt-2 text-xs text-white/40 text-center">
            Live scanning works on iPhone Safari and Android Chrome. On this browser, enter the part number below.
          </p>
        )}
      </div>

      <div className="px-4 mt-5 mb-3 flex items-center gap-2">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[11px] uppercase tracking-wide text-white/40">Or enter manually</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <form
        className="px-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <Field label="Part number" required>
          <input
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            placeholder="e.g. 6BG-13407-00"
            autoComplete="off"
            autoCapitalize="characters"
            className="input font-mono"
          />
        </Field>

        <Field label="Description" required>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Fuel filter — Yamaha F150"
            className="input"
          />
        </Field>

        <Field label="Vendor" required>
          <button
            type="button"
            onClick={() => setVendorPickerOpen(true)}
            className="input text-left flex items-center justify-between"
          >
            <span className={vendor ? 'text-white' : 'text-white/30'}>
              {vendor ? vendor.vendor_name : 'Pick a vendor'}
            </span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </button>
        </Field>

        <Field label="Initial state">
          <Segmented
            value={initialState}
            options={[
              { value: PartState.ORDERED, label: 'Ordered' },
              { value: PartState.RECEIVED, label: 'Received' },
            ]}
            onChange={(v) => setInitialState(v)}
          />
          <p className="mt-1.5 text-xs text-white/40">
            Ordered = PO placed, waiting on vendor. Received = in your hands now.
          </p>
        </Field>

        <Field label="Work order # (optional — leave blank for stock)">
          <input
            value={woNumber}
            onChange={(e) => setWoNumber(e.target.value)}
            placeholder="e.g. WO-12851"
            autoComplete="off"
            className="input font-mono"
          />
          <p className="mt-1.5 text-xs text-white/40">
            Filling this threads the part to that job from order through sale.
          </p>
        </Field>

        {hasWo && (
          <Field label="Customer name">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Bob Burditsman"
              className="input"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Dealer cost" required>
            <CurrencyInput value={dealerCost} onChange={setDealerCost} />
          </Field>
          <Field label="MSRP" required>
            <CurrencyInput value={msrp} onChange={setMsrp} />
          </Field>
        </div>

        <Field label="Min stock qty">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minStockQty}
            onChange={(e) => setMinStockQty(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Category">
          <div className="grid grid-cols-3 gap-2">
            {GL_OPTIONS.map((opt) => {
              const active = glCategory === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setGlCategory(opt.value)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-gold-500 text-navy-900'
                      : 'bg-navy-800 border border-white/10 text-white/70'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input resize-none"
            placeholder="Backorder ETA, packaging condition, anything you'd want to remember later…"
          />
        </Field>

        {errors.length > 0 && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
            <ul className="list-disc list-inside space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </form>

      <div className="fixed bottom-0 left-0 right-0 bg-navy-900/95 backdrop-blur border-t border-white/10 px-4 pt-3 pb-5 safe-bottom">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-gold-500 text-navy-900 font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {saving ? 'Saving…' : 'Save part'}
        </button>
      </div>

      <BarcodeScannerSheet
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          setPartNumber(value);
          setScannerOpen(false);
        }}
      />

      <VendorPickerSheet
        open={vendorPickerOpen}
        onClose={() => setVendorPickerOpen(false)}
        onPick={(v) => setVendor(v)}
        selectedId={vendor?.id}
      />
    </div>
  );
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

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pl-7"
        placeholder="0.00"
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="grid grid-flow-col auto-cols-fr bg-navy-800 border border-white/10 rounded-lg p-1 gap-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`py-2 rounded-md text-sm font-medium transition-colors ${
              active ? 'bg-gold-500 text-navy-900' : 'text-white/70'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
