// Read path for per-WO# aggregations.
// A part's "current WO" is the wo_number on its most recent event (the thread carries forward).
// All derivations from the event spine.

import { db } from '@/data/localDb';
import { PartState, TERMINAL_STATES, type Part, type PartEvent } from '@/types';

export interface WorkOrderSummary {
  wo_number: string;
  customer_name?: string;
  parts_count: number;
  in_flight_count: number;  // ORDERED + BACK_ORDERED + RECEIVED + STAGED
  billed_count: number;     // SOLD
  used_count: number;       // USED (shop supply)
  returned_count: number;
  total_dealer_cost: number;
  total_sold_value: number;
  first_event_at: string;
  last_event_at: string;
  status: 'open' | 'complete';
}

export interface WorkOrderDetail extends WorkOrderSummary {
  parts: Part[];
  ready_to_bill: Part[];   // STAGED parts (committed, not yet invoiced)
  billed: Part[];          // SOLD parts
  used: Part[];            // USED parts (shop supply)
  in_flight: Part[];       // ORDERED, BACK_ORDERED, RECEIVED
  returned: Part[];
  events_by_part: Map<string, PartEvent[]>;
}

// Pair each part with its latest event to derive current WO + customer.
async function partsWithLatestEvent(): Promise<
  Array<{ part: Part; latest: PartEvent | undefined }>
> {
  const [parts, events] = await Promise.all([db.parts.toArray(), db.events.toArray()]);
  const byPart = new Map<string, PartEvent[]>();
  for (const evt of events) {
    const arr = byPart.get(evt.part_id) ?? [];
    arr.push(evt);
    byPart.set(evt.part_id, arr);
  }
  return parts.map((part) => {
    const arr = byPart.get(part.id) ?? [];
    arr.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return { part, latest: arr[0] };
  });
}

function isInFlight(state: PartState): boolean {
  return (
    state === PartState.ORDERED ||
    state === PartState.BACK_ORDERED ||
    state === PartState.RECEIVED ||
    state === PartState.STAGED
  );
}

export async function listWorkOrders(): Promise<WorkOrderSummary[]> {
  const rows = await partsWithLatestEvent();
  const allEvents = await db.events.toArray();

  // Group parts by their CURRENT wo_number (from latest event).
  const groups = new Map<string, Part[]>();
  const customerByWo = new Map<string, string>();
  for (const { part, latest } of rows) {
    const wo = latest?.wo_number;
    if (!wo) continue;
    if (!groups.has(wo)) groups.set(wo, []);
    groups.get(wo)!.push(part);
    if (latest?.customer_name && !customerByWo.has(wo)) {
      customerByWo.set(wo, latest.customer_name);
    }
  }

  // Event times per WO, scanning ALL events that ever carried this wo_number
  // (more accurate than current-only — captures un-stage history).
  const firstByWo = new Map<string, string>();
  const lastByWo = new Map<string, string>();
  for (const evt of allEvents) {
    if (!evt.wo_number) continue;
    const first = firstByWo.get(evt.wo_number);
    if (!first || evt.occurred_at < first) firstByWo.set(evt.wo_number, evt.occurred_at);
    const last = lastByWo.get(evt.wo_number);
    if (!last || evt.occurred_at > last) lastByWo.set(evt.wo_number, evt.occurred_at);
  }

  const summaries: WorkOrderSummary[] = [];
  for (const [wo, parts] of groups) {
    const counts = {
      in_flight: 0,
      billed: 0,
      used: 0,
      returned: 0,
      cost: 0,
      sold: 0,
    };
    for (const p of parts) {
      counts.cost += p.dealer_cost;
      if (isInFlight(p.current_state)) counts.in_flight += 1;
      else if (p.current_state === PartState.SOLD) {
        counts.billed += 1;
        counts.sold += p.msrp;
      } else if (p.current_state === PartState.USED) counts.used += 1;
      else if (p.current_state === PartState.RETURNED) counts.returned += 1;
    }

    const allTerminal = parts.every((p) => TERMINAL_STATES.has(p.current_state));
    summaries.push({
      wo_number: wo,
      customer_name: customerByWo.get(wo),
      parts_count: parts.length,
      in_flight_count: counts.in_flight,
      billed_count: counts.billed,
      used_count: counts.used,
      returned_count: counts.returned,
      total_dealer_cost: counts.cost,
      total_sold_value: counts.sold,
      first_event_at: firstByWo.get(wo) ?? '',
      last_event_at: lastByWo.get(wo) ?? '',
      status: allTerminal ? 'complete' : 'open',
    });
  }

  // Sort: open first (most-recently-touched first), then complete (most-recent first)
  summaries.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.last_event_at.localeCompare(a.last_event_at);
  });

  return summaries;
}

export async function detailForWorkOrder(woNumber: string): Promise<WorkOrderDetail | null> {
  const rows = await partsWithLatestEvent();
  const ownParts = rows.filter((r) => r.latest?.wo_number === woNumber);
  if (ownParts.length === 0) return null;

  const parts = ownParts.map((r) => r.part);
  const customerName = ownParts.find((r) => r.latest?.customer_name)?.latest?.customer_name;

  const ready_to_bill: Part[] = [];
  const billed: Part[] = [];
  const used: Part[] = [];
  const in_flight: Part[] = [];
  const returned: Part[] = [];
  let totalCost = 0;
  let totalSold = 0;

  for (const p of parts) {
    totalCost += p.dealer_cost;
    if (p.current_state === PartState.STAGED) ready_to_bill.push(p);
    else if (p.current_state === PartState.SOLD) {
      billed.push(p);
      totalSold += p.msrp;
    } else if (p.current_state === PartState.USED) used.push(p);
    else if (p.current_state === PartState.RETURNED) returned.push(p);
    else if (isInFlight(p.current_state)) in_flight.push(p);
  }

  // Sort each group by most recent activity
  const partIds = parts.map((p) => p.id);
  const events = await db.events.where('part_id').anyOf(partIds).toArray();
  const eventsByPart = new Map<string, PartEvent[]>();
  for (const evt of events) {
    const arr = eventsByPart.get(evt.part_id) ?? [];
    arr.push(evt);
    eventsByPart.set(evt.part_id, arr);
  }
  for (const arr of eventsByPart.values()) arr.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const lastEventAt = (p: Part) => eventsByPart.get(p.id)?.[0]?.occurred_at ?? '';
  const byRecency = (a: Part, b: Part) => lastEventAt(b).localeCompare(lastEventAt(a));
  ready_to_bill.sort(byRecency);
  billed.sort(byRecency);
  used.sort(byRecency);
  in_flight.sort(byRecency);
  returned.sort(byRecency);

  const allTerminal = parts.every((p) => TERMINAL_STATES.has(p.current_state));
  const allEventTimes = events.map((e) => e.occurred_at);
  const firstEventAt = allEventTimes.length > 0 ? allEventTimes.reduce((a, b) => (a < b ? a : b)) : '';
  const lastEventAtAll = allEventTimes.length > 0 ? allEventTimes.reduce((a, b) => (a > b ? a : b)) : '';

  return {
    wo_number: woNumber,
    customer_name: customerName,
    parts_count: parts.length,
    in_flight_count: in_flight.length,
    billed_count: billed.length,
    used_count: used.length,
    returned_count: returned.length,
    total_dealer_cost: totalCost,
    total_sold_value: totalSold,
    first_event_at: firstEventAt,
    last_event_at: lastEventAtAll,
    status: allTerminal ? 'complete' : 'open',
    parts,
    ready_to_bill,
    billed,
    used,
    in_flight,
    returned,
    events_by_part: eventsByPart,
  };
}
