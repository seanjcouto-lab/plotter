import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, X } from 'lucide-react';
import { db } from '@/data/localDb';
import { createVendor } from '@/services/partRepository';
import type { Vendor } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (vendor: Vendor) => void;
  selectedId?: string;
}

export function VendorPickerSheet({ open, onClose, onPick, selectedId }: Props) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [saving, setSaving] = useState(false);

  const vendors = useLiveQuery(() => db.vendors.toArray(), []) ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...vendors]
      .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name))
      .filter((v) =>
        q.length === 0
          ? true
          : v.vendor_name.toLowerCase().includes(q) ||
            v.vendor_code.toLowerCase().includes(q),
      );
  }, [vendors, query]);

  if (!open) return null;

  const resetCreate = () => {
    setCreating(false);
    setNewName('');
    setNewCode('');
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newCode.trim()) return;
    setSaving(true);
    try {
      const v = await createVendor({ vendor_name: newName, vendor_code: newCode });
      onPick(v);
      resetCreate();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-navy-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border-t border-white/10 sm:border max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-white font-medium">Pick vendor</h2>
          <button
            onClick={() => {
              resetCreate();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {!creating ? (
          <>
            <div className="px-4 pt-3 pb-2">
              <input
                type="search"
                placeholder="Search vendors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-gold-500/60"
              />
            </div>

            <ul className="flex-1 overflow-y-auto px-2 pb-2">
              {filtered.map((v) => {
                const selected = v.id === selectedId;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => {
                        onPick(v);
                        onClose();
                      }}
                      className="w-full text-left px-3 py-3 rounded-lg flex items-center justify-between hover:bg-navy-800"
                    >
                      <div>
                        <div className="text-sm text-white">{v.vendor_name}</div>
                        <div className="text-xs text-white/40">{v.vendor_code}</div>
                      </div>
                      {selected && <Check className="w-5 h-5 text-gold-500" />}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-white/40">
                  No vendors match
                </li>
              )}
            </ul>

            <div className="border-t border-white/10 p-3 safe-bottom">
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gold-500/40 text-gold-400 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> New vendor
              </button>
            </div>
          </>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <FieldLabel>Vendor name</FieldLabel>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Donovan Marine"
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-gold-500/60"
            />
            <FieldLabel>Short code (4 letters max)</FieldLabel>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="e.g. DONV"
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-gold-500/60 font-mono"
            />
            <div className="flex gap-2 pt-2 safe-bottom">
              <button
                onClick={resetCreate}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim() || !newCode.trim()}
                className="flex-1 py-2.5 rounded-lg bg-gold-500 text-navy-900 text-sm font-medium disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Add vendor'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] uppercase tracking-wide text-white/40">{children}</label>;
}
