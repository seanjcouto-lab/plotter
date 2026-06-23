import { Camera, FilePlus2, Plus, X } from 'lucide-react';
import { isSheetParseSupported } from '@/services/sheetParser';

interface Props {
  open: boolean;
  onClose: () => void;
  onSingle: () => void;
  onBulk: () => void;
  onPhoto: () => void;
}

export function AddActionSheet({ open, onClose, onSingle, onBulk, onPhoto }: Props) {
  if (!open) return null;
  const photoSupported = isSheetParseSupported();

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-navy-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border-t border-white/10 sm:border safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-white font-medium">Add to Plotter</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="p-3 space-y-2">
          <ActionButton
            icon={<Plus className="w-5 h-5" />}
            label="Single part"
            subtitle="Full form for one part with all fields"
            onClick={() => {
              onClose();
              onSingle();
            }}
          />
          <ActionButton
            icon={<FilePlus2 className="w-5 h-5" />}
            label="Multiple parts"
            subtitle="Fast row entry — like writing on a sheet"
            onClick={() => {
              onClose();
              onBulk();
            }}
          />
          {photoSupported && (
            <ActionButton
              icon={<Camera className="w-5 h-5" />}
              label="Photo of sheet"
              subtitle="Photograph a parts sheet — Claude parses the rows"
              onClick={() => {
                onClose();
                onPhoto();
              }}
              accent
            />
          )}
          {!photoSupported && (
            <div className="px-4 py-3 rounded-xl bg-navy-800 border border-white/5 text-xs text-white/40">
              <Camera className="w-3.5 h-3.5 inline-block mr-1.5" />
              Photo-of-sheet needs an Anthropic API key in <code className="font-mono">.env.local</code>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  subtitle,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border flex items-center gap-3 transition-colors ${
        accent
          ? 'bg-navy-800 border-gold-500/30 hover:bg-navy-700'
          : 'bg-navy-800 border-white/10 hover:bg-navy-700'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-none ${
          accent ? 'bg-gold-500/20 text-gold-400' : 'bg-white/5 text-white/70'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-white/50 mt-0.5">{subtitle}</div>
      </div>
    </button>
  );
}
