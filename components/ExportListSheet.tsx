import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}

export function ExportListSheet({ open, title, text, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers / no permission — fall back to manual select-all hint.
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-navy-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border-t border-white/10 sm:border max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-white font-medium">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto">
          <pre className="bg-navy-800 border border-white/10 rounded-xl p-3 text-xs text-white/90 whitespace-pre-wrap font-mono">
            {text}
          </pre>
        </div>

        <div className="border-t border-white/10 p-3 safe-bottom">
          <button
            onClick={handleCopy}
            className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
              copied ? 'bg-emerald-500 text-white' : 'bg-gold-500 text-navy-900'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy to clipboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
