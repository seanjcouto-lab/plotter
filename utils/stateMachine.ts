import { PartState } from '@/types';

export interface StateTransition {
  to: PartState;
  label: string;
  primary?: boolean;
  destructive?: boolean;
  // What extra data the operator must provide for this transition.
  requiresWoNumber?: boolean;
  requiresCustomer?: boolean;
  requiresSalePrice?: boolean;
  requiresNotes?: boolean;
}

// Valid transitions from each state.
// Locked per the master parts-operation vision + the handoff lifecycle.
export function validNextStates(current: PartState): StateTransition[] {
  switch (current) {
    case PartState.ORDERED:
      return [
        { to: PartState.RECEIVED, label: 'Mark received', primary: true },
        { to: PartState.BACK_ORDERED, label: 'Vendor confirmed backorder', requiresNotes: true },
        { to: PartState.RETURNED, label: 'Cancel order', destructive: true },
        { to: PartState.NLA, label: 'Discontinued (NLA)', destructive: true },
      ];
    case PartState.BACK_ORDERED:
      return [
        { to: PartState.RECEIVED, label: 'Mark received', primary: true },
        { to: PartState.RETURNED, label: 'Cancel order', destructive: true },
        { to: PartState.NLA, label: 'Discontinued (NLA)', destructive: true },
      ];
    case PartState.RECEIVED:
      return [
        { to: PartState.STAGED, label: 'Stage for job', primary: true, requiresWoNumber: true },
        { to: PartState.SOLD, label: 'Sell (walk-in counter)', requiresCustomer: true, requiresSalePrice: true },
        { to: PartState.USED, label: 'Use as shop supply' },
        { to: PartState.RETURNED, label: 'Return to vendor', destructive: true },
      ];
    case PartState.STAGED:
      return [
        { to: PartState.SOLD, label: 'Sell to customer', primary: true, requiresCustomer: true, requiresSalePrice: true },
        { to: PartState.USED, label: 'Mark as used' },
        { to: PartState.RECEIVED, label: 'Un-stage (back to shelf)' },
        { to: PartState.RETURNED, label: 'Return to vendor', destructive: true },
      ];
    case PartState.SOLD:
      return [
        { to: PartState.RETURNED, label: 'Customer return', destructive: true, requiresNotes: true },
      ];
    case PartState.USED:
    case PartState.RETURNED:
    case PartState.NLA:
      return [];
  }
}

export function transitionLabel(from: PartState | undefined, to: PartState): string {
  if (!from) return `→ ${to}`;
  return `${from} → ${to}`;
}
