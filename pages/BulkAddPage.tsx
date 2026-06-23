import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Camera, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { db } from '@/data/localDb';
import { GlCategory, PartState, type Vendor } from '@/types';
import { createPartsBulk, type BulkPartInput } from '@/services/partRepository';
import { isSheetParseSupported, parseSheet } from '@/services/sheetParser';
import { VendorPickerSheet } from '@/components/VendorPickerSheet';

interface Props {
  onBack: () => void;
  onSaved: (count: number) => void;
  startWithPhoto?: boolean;
}

interface DraftRow {
  id: string;
  qty: string;
  part_number: string;
  description: string;
  vendor_id?: string;
  vendor_label?: string;       // raw vendor string from photo parse, unmatched
  wo_number_override?: string;
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

let rowIdCounter = 0;
const newRowId = () => `r-${Date.now()}-${rowIdCounter++}`;

function blankRow(): DraftRow {
  return { id: newRowId(), qty: '1', part_number: '', description: '' };
}

export function BulkAddPage({ onBack, onSaved, startWithPhoto = false }: Props) {
  const [headerWo, setHeaderWo] = useState('');
  const [headerCustomer, setHeaderCustomer] = useState('');
  const [defaultVendor, setDefaultVendor] = useState<Vendor | undefined>();
  const [initialState, setInitialState] = useState<PartState.ORDERED | PartState.RECEIVED>(PartState.ORDERED);
  const [glCategory, setGlCategory] = useState<GlCategory>(GlCategory.ENGINE_PARTS);
  const [rows, setRows] = useState<DraftRow[]>([blankRow(), blankRow(), blankRow()]);

  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [vendorPickerForRow, setVendorPickerForRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const vendors = useLiveQuery(() => db.vendors.toArray(), []) ?? [];
  const photoSupported = isSheetParseSupported();

  useEffect(() => {
    if (!defaultVendor && vendors.length === 1) setDefaultVendor(vendors[0]);
  }, [vendors, defaultVendor]);

  useEffect(() => {
    if (startWithPhoto && photoSupported) {
      // Auto-open file picker on mount when entered via the "Photo of sheet" flow.
      setTimeout(() => fileInputRef.current?.click(), 100);
    }
  }, [startWithPhoto, photoSupported]);

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (id: string) => setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((r) => r.id !== id)));

  const matchVendorByName = (name: string | undefined): Vendor | undefined => {
    if (!name) return undefined;
    const q = name.trim().toLowerCase();
    return vendors.find(
      (v) =>
        v.vendor_name.toLowerCase().includes(q) ||
        q.includes(v.vendor_name.toLowerCase()) ||
        v.vendor_code.toLowerCase() === q,
    );
  };

  const handlePhotoFile = async (file: File) => {
    setParseError(null);
    setParsing(true);
    try {
      const parsed = await parseSheet(file);
      if (parsed.length === 0) {
        setParseError('No rows detected. Try a clearer photo.');
        return;
      }
      // Map parsed rows to draft rows, matching vendor by name where possible.
      const draftRows: DraftRow[] = parsed.map((p) => {
        const match = matchVendorByName(p.vendor);
        return {
          id: newRowId(),
          qty: String(p.qty),
          part_number: p.part_number,
          description: p.description,
          vendor_id: match?.id,
          vendor_label: match ? undefined : p.vendor,
          wo_number_override: p.wo_number,
        };
      });
      setRows(draftRows);
    } catch (err) {
      setParseError((err as Error).message || 'Parse failed');
    } finally {
      setParsing(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoFile(file);
    e.target.value = ''; // reset so same file can be reselected
  };

  const validateAndSave = async () => {
    setErrors([]);
    const meaningfulRows = rows.filter((r) => r.part_number.trim() || r.description.trim());
    if (meaningfulRows.length === 0) {
      setErrors(['Add at least one part']);
      return;
    }

    const rowErrors: string[] = [];
    const inputs: BulkPartInput[] = [];

    meaningfulRows.forEach((r, idx) => {
      const rowLabel = `Row ${idx + 1}`;
      if (!r.part_number.trim()) rowErrors.push(`${rowLabel}: part number missing`);
      if (!r.description.trim()) rowErrors.push(`${rowLabel}: description missing`);
      const vendorId = r.vendor_id || defaultVendor?.id;
      if (!vendorId) rowErrors.push(`${rowLabel}: needs a vendor (set default at top or per-row)`);
      const qty = parseInt(r.qty, 10);
      if (!Number.isFinite(qty) || qty < 1) rowErrors.push(`${rowLabel}: quantity must be ≥ 1`);

      if (rowErrors.length === 0) {
        // qty > 1: create N separate Part records (each is one physical unit in our model).
        const repeat = Math.max(1, qty);
        for (let i = 0; i < repeat; i++) {
          inputs.push({
            part_number: r.part_number,
            description: r.description,
            vendor_id: vendorId!,
            wo_number: r.wo_number_override,
          });
        }
      }
    });

    if (rowErrors.length > 0) {
      setErrors(rowErrors);
      return;
    }

    setSaving(true);
    try {
      const saved = await createPartsBulk(inputs, {
        initial_state: initialState,
        default_vendor_id: defaultVendor?.id,
        default_gl_category: glCategory,
        header_wo_number: headerWo,
        header_customer_name: headerCustomer,
      });
      onSaved(saved.length);
    } catch (err) {
      setErrors([(err as Error).message || 'Save failed']);
    } finally {
      setSaving(false);
    }
  };

  const meaningfulCount = rows.filter((r) => r.part_number.trim() || r.description.trim()).length;

  return (
    <div className="min-h-screen bg-navy-900 text-white safe-top pb-32">
      <header className="px-4 pt-3 pb-3 border-b border-white/5 flex items-center gap-2 sticky top-0 bg-navy-900/95 backdrop-blur z-10">
        <button
          onClick={onBack}
          className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">Add multiple</h1>
        {photoSupported && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-gold-400 px-3 py-1.5 rounded-lg border border-gold-500/30 flex items-center gap-1.5"
            disabled={parsing}
          >
            {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            {parsing ? 'Reading…' : 'Photo'}
          </button>
        )}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        onChange={onFileChange}
        className="hidden"
      />

      {parseError && (
        <div className="mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
          {parseError}
        </div>
      )}

      {parsing && (
        <div className="mx-4 mt-3 rounded-lg bg-gold-500/10 border border-gold-500/30 px-3 py-3 text-sm text-gold-300 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Claude is reading the sheet — this usually takes 5-15 seconds…
        </div>
      )}

      <section className="px-4 pt-4 space-y-3">
        <FieldLabel>Attach all rows to (optional)</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={headerWo}
            onChange={(e) => setHeaderWo(e.target.value)}
            placeholder="WO# (optional)"
            className="input font-mono"
          />
          <input
            value={headerCustomer}
            onChange={(e) => setHeaderCustomer(e.target.value)}
            placeholder="Customer (optional)"
            className="input"
          />
        </div>
        <p className="text-xs text-white/40 -mt-1">
          Per-row WO# fields below override this header.
        </p>

        <FieldLabel>Default vendor</FieldLabel>
        <button
          type="button"
          onClick={() => {
            setVendorPickerForRow(null);
            setVendorPickerOpen(true);
          }}
          className="input text-left flex items-center justify-between"
        >
          <span className={defaultVendor ? 'text-white' : 'text-white/30'}>
            {defaultVendor ? defaultVendor.vendor_name : 'Pick a default vendor'}
          </span>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </button>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Initial state</FieldLabel>
            <div className="mt-1.5 grid grid-flow-col auto-cols-fr bg-navy-800 border border-white/10 rounded-lg p-1 gap-1">
              {([
                { value: PartState.ORDERED, label: 'Ordered' },
                { value: PartState.RECEIVED, label: 'Received' },
              ] as const).map((opt) => {
                const active = initialState === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setInitialState(opt.value)}
                    className={`py-2 rounded-md text-xs font-medium ${
                      active ? 'bg-gold-500 text-navy-900' : 'text-white/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <FieldLabel>Category</FieldLabel>
            <select
              value={glCategory}
              onChange={(e) => setGlCategory(e.target.value as GlCategory)}
              className="input mt-1.5"
            >
              {GL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="px-4 mt-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[11px] uppercase tracking-wide text-white/40">
            Rows ({meaningfulCount} active)
          </h2>
        </div>
        <ul className="space-y-2">
          {rows.map((row, idx) => (
            <RowCard
              key={row.id}
              row={row}
              idx={idx}
              vendorName={
                row.vendor_id
                  ? vendors.find((v) => v.id === row.vendor_id)?.vendor_name
                  : undefined
              }
              showHeaderWoNote={!!headerWo}
              onUpdate={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
              onPickVendor={() => {
                setVendorPickerForRow(row.id);
                setVendorPickerOpen(true);
              }}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={addRow}
          className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-white/20 text-sm text-white/60 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add row
        </button>
      </section>

      {errors.length > 0 && (
        <div className="mx-4 mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-navy-900/95 backdrop-blur border-t border-white/10 px-4 pt-3 pb-5 safe-bottom">
        <button
          onClick={validateAndSave}
          disabled={saving || parsing}
          className="w-full py-3.5 rounded-xl bg-gold-500 text-navy-900 font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {saving ? 'Saving…' : `Save ${meaningfulCount} part${meaningfulCount === 1 ? '' : 's'}`}
        </button>
      </div>

      <VendorPickerSheet
        open={vendorPickerOpen}
        onClose={() => {
          setVendorPickerOpen(false);
          setVendorPickerForRow(null);
        }}
        onPick={(v) => {
          if (vendorPickerForRow) {
            updateRow(vendorPickerForRow, { vendor_id: v.id, vendor_label: undefined });
          } else {
            setDefaultVendor(v);
          }
        }}
        selectedId={vendorPickerForRow ? rows.find((r) => r.id === vendorPickerForRow)?.vendor_id : defaultVendor?.id}
      />
    </div>
  );
}

function RowCard({
  row,
  idx,
  vendorName,
  showHeaderWoNote,
  onUpdate,
  onRemove,
  onPickVendor,
}: {
  row: DraftRow;
  idx: number;
  vendorName?: string;
  showHeaderWoNote: boolean;
  onUpdate: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onPickVendor: () => void;
}) {
  // Auto-select content when an input gains focus — tap once and start typing replaces the value.
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

  return (
    <li className="bg-navy-800 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/40 font-mono w-6 flex-none">{String(idx + 1).padStart(2, '0')}</span>
        <input
          type="text"
          value={row.qty}
          onChange={(e) => onUpdate({ qty: e.target.value })}
          onFocus={selectAll}
          inputMode="numeric"
          pattern="[0-9]*"
          className="input w-16 text-center text-base font-medium"
          aria-label="Quantity"
        />
        <input
          value={row.part_number}
          onChange={(e) => onUpdate({ part_number: e.target.value })}
          onFocus={selectAll}
          placeholder="Part #"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="input flex-1 font-mono"
        />
        <button
          onClick={onRemove}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:text-red-300 hover:bg-red-500/10 flex-none"
          aria-label="Remove row"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <input
        value={row.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        onFocus={selectAll}
        placeholder="Description"
        className="input"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onPickVendor}
          className="input text-left flex items-center justify-between text-xs"
        >
          <span className={vendorName ? 'text-white' : row.vendor_label ? 'text-amber-300' : 'text-white/30'}>
            {vendorName ?? (row.vendor_label ? `"${row.vendor_label}" — pick` : 'Use default vendor')}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-white/40" />
        </button>
        <input
          value={row.wo_number_override ?? ''}
          onChange={(e) => onUpdate({ wo_number_override: e.target.value })}
          onFocus={selectAll}
          placeholder={showHeaderWoNote ? 'Override WO#' : 'WO# (optional)'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="input font-mono text-xs"
        />
      </div>
    </li>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] uppercase tracking-wide text-white/40">{children}</label>;
}
