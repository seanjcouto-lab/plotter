import type { Part, Vendor } from '@/types';

interface PartContext {
  wo_number?: string;
  customer_name?: string;
}

// Format the EOD send list as plain text Sean can paste into an email or vendor portal.
export function formatEodSendList(
  vendor: Vendor,
  parts: Part[],
  partContextById: Map<string, PartContext>,
): string {
  const date = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (parts.length === 0) {
    return `${vendor.vendor_name} — Plotter EOD list · ${date}\n\nNo open orders.\n`;
  }

  const lines: string[] = [];
  lines.push(`${vendor.vendor_name} — Plotter EOD list · ${date}`);
  lines.push('');
  parts.forEach((p, idx) => {
    const ctx = partContextById.get(p.id) ?? {};
    const tail = ctx.wo_number
      ? `[${ctx.wo_number}${ctx.customer_name ? ` · ${ctx.customer_name}` : ''}]`
      : '[stock]';
    lines.push(`${idx + 1}. ${p.part_number} — ${p.description} — qty 1 — $${p.dealer_cost.toFixed(2)} ${tail}`);
  });
  lines.push('');
  lines.push(`Total lines: ${parts.length}`);
  const totalCost = parts.reduce((sum, p) => sum + p.dealer_cost, 0);
  lines.push(`Estimated dealer cost: $${totalCost.toFixed(2)}`);
  return lines.join('\n');
}

// Format the per-WO parts list for billing handoff. Customer-facing format —
// MSRP rather than dealer cost, grouped by billed vs ready-to-bill.
export interface WoBillingInput {
  wo_number: string;
  customer_name?: string;
  ready_to_bill: Part[];
  billed: Part[];
  used: Part[];
  total_sold_value: number;
}

export function formatWorkOrderBilling(input: WoBillingInput): string {
  const date = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const lines: string[] = [];
  lines.push(`${input.wo_number}${input.customer_name ? ` — ${input.customer_name}` : ''}`);
  lines.push(`Parts list · ${date}`);
  lines.push('');

  let total = 0;
  let lineNo = 1;

  if (input.billed.length > 0) {
    lines.push(`SOLD (${input.billed.length})`);
    input.billed.forEach((p) => {
      lines.push(`${lineNo}. ${p.part_number} — ${p.description} — qty 1 — $${p.msrp.toFixed(2)}`);
      total += p.msrp;
      lineNo += 1;
    });
    lines.push('');
  }

  if (input.ready_to_bill.length > 0) {
    lines.push(`STAGED — READY TO BILL (${input.ready_to_bill.length})`);
    input.ready_to_bill.forEach((p) => {
      lines.push(`${lineNo}. ${p.part_number} — ${p.description} — qty 1 — $${p.msrp.toFixed(2)}`);
      total += p.msrp;
      lineNo += 1;
    });
    lines.push('');
  }

  if (input.used.length > 0) {
    lines.push(`USED — shop supply, not billed to customer (${input.used.length})`);
    input.used.forEach((p) => {
      lines.push(`${lineNo}. ${p.part_number} — ${p.description} — qty 1 — (cost $${p.dealer_cost.toFixed(2)})`);
      lineNo += 1;
    });
    lines.push('');
  }

  lines.push(`Customer total: $${total.toFixed(2)}`);
  if (input.total_sold_value > 0 && Math.abs(total - input.total_sold_value) > 0.01) {
    lines.push(`(Already invoiced: $${input.total_sold_value.toFixed(2)})`);
  }
  return lines.join('\n');
}
