import { PartState } from '@/types';

const STATE_STYLES: Record<PartState, { bg: string; text: string; label: string }> = {
  [PartState.ORDERED]: { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'Ordered' },
  [PartState.BACK_ORDERED]: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Backordered' },
  [PartState.RECEIVED]: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Received' },
  [PartState.STAGED]: { bg: 'bg-gold-500/20', text: 'text-gold-400', label: 'Staged' },
  [PartState.SOLD]: { bg: 'bg-green-600/30', text: 'text-green-300', label: 'Sold' },
  [PartState.USED]: { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Used' },
  [PartState.RETURNED]: { bg: 'bg-orange-500/20', text: 'text-orange-300', label: 'Returned' },
  [PartState.NLA]: { bg: 'bg-slate-500/20', text: 'text-slate-300', label: 'NLA' },
};

interface Props {
  state: PartState;
  compact?: boolean;
}

export function StateBadge({ state, compact = false }: Props) {
  const style = STATE_STYLES[state];
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {style.label}
    </span>
  );
}
