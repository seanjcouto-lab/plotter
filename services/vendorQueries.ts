// Read path for vendor-level aggregations.
// All derivations from the event spine; no projection tables.

import { db } from '@/data/localDb';
import { PartState, type Part, type PartEvent, type Vendor } from '@/types';
import { daysBetween } from '@/utils/dateMath';

export interface VendorStats {
  vendor: Vendor;
  openOrderCount: number;       // currently in ORDERED state
  backOrderCount: number;       // currently in BACK_ORDERED state
  leadTimeDays: number | null;  // avg ORDERED → RECEIVED across history
  leadTimeSampleSize: number;
  lastReceivedAt?: string;
  lifetimePartsCount: number;   // all parts this vendor has ever supplied
}

export interface VendorDetail extends VendorStats {
  openOrders: Part[];
  backOrders: Part[];
  recentReceipts: Array<{ part: Part; receivedAt: string; leadDays: number | null }>;
}

async function partsForVendor(vendorId: string): Promise<Part[]> {
  return db.parts.where('vendor_id').equals(vendorId).toArray();
}

async function eventsForVendor(vendorId: string): Promise<PartEvent[]> {
  return db.events.where('vendor_id').equals(vendorId).toArray();
}

// Pair each RECEIVED event with the matching ORDERED event for the same part,
// compute the days between, and take the mean.
function computeLeadTime(events: PartEvent[]): { days: number | null; sample: number; lastReceivedAt?: string } {
  const byPart = new Map<string, { ordered?: string; received?: string }>();
  let lastReceivedAt: string | undefined;

  for (const evt of events) {
    const row = byPart.get(evt.part_id) ?? {};
    if (evt.to_state === PartState.ORDERED && (!row.ordered || evt.occurred_at < row.ordered)) {
      row.ordered = evt.occurred_at;
    }
    if (evt.to_state === PartState.RECEIVED) {
      // Use earliest RECEIVED to pair with earliest ORDERED.
      if (!row.received || evt.occurred_at < row.received) {
        row.received = evt.occurred_at;
      }
      if (!lastReceivedAt || evt.occurred_at > lastReceivedAt) {
        lastReceivedAt = evt.occurred_at;
      }
    }
    byPart.set(evt.part_id, row);
  }

  const pairs: number[] = [];
  for (const { ordered, received } of byPart.values()) {
    if (ordered && received) {
      const d = daysBetween(ordered, received);
      if (d >= 0 && d <= 365) pairs.push(d);
    }
  }

  if (pairs.length === 0) return { days: null, sample: 0, lastReceivedAt };
  const sum = pairs.reduce((a, b) => a + b, 0);
  return { days: Math.round(sum / pairs.length), sample: pairs.length, lastReceivedAt };
}

export async function statsForVendor(vendor: Vendor): Promise<VendorStats> {
  const [parts, events] = await Promise.all([
    partsForVendor(vendor.id),
    eventsForVendor(vendor.id),
  ]);

  const openOrderCount = parts.filter((p) => p.current_state === PartState.ORDERED).length;
  const backOrderCount = parts.filter((p) => p.current_state === PartState.BACK_ORDERED).length;
  const { days, sample, lastReceivedAt } = computeLeadTime(events);

  return {
    vendor,
    openOrderCount,
    backOrderCount,
    leadTimeDays: days,
    leadTimeSampleSize: sample,
    lastReceivedAt,
    lifetimePartsCount: parts.length,
  };
}

export async function statsForAllVendors(): Promise<VendorStats[]> {
  const vendors = await db.vendors.toArray();
  const stats = await Promise.all(vendors.map(statsForVendor));
  // Sort: most open orders first, then most lifetime parts, then alpha
  return stats.sort((a, b) => {
    if (b.openOrderCount !== a.openOrderCount) return b.openOrderCount - a.openOrderCount;
    if (b.lifetimePartsCount !== a.lifetimePartsCount) return b.lifetimePartsCount - a.lifetimePartsCount;
    return a.vendor.vendor_name.localeCompare(b.vendor.vendor_name);
  });
}

export async function detailForVendor(vendorId: string): Promise<VendorDetail | null> {
  const vendor = await db.vendors.get(vendorId);
  if (!vendor) return null;

  const [parts, events] = await Promise.all([
    partsForVendor(vendorId),
    eventsForVendor(vendorId),
  ]);

  const openOrders = parts
    .filter((p) => p.current_state === PartState.ORDERED)
    .sort((a, b) => (a.date_ordered ?? '').localeCompare(b.date_ordered ?? ''));
  const backOrders = parts
    .filter((p) => p.current_state === PartState.BACK_ORDERED)
    .sort((a, b) => (a.date_ordered ?? '').localeCompare(b.date_ordered ?? ''));

  const { days, sample, lastReceivedAt } = computeLeadTime(events);

  // Recent receipts: pair received parts with their ORDERED date to show actual lead time per row
  const orderedByPart = new Map<string, string>();
  for (const evt of events) {
    if (evt.to_state === PartState.ORDERED) {
      const existing = orderedByPart.get(evt.part_id);
      if (!existing || evt.occurred_at < existing) orderedByPart.set(evt.part_id, evt.occurred_at);
    }
  }
  const receivedEvents = events
    .filter((e) => e.to_state === PartState.RECEIVED)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 5);

  const partById = new Map(parts.map((p) => [p.id, p]));
  const recentReceipts = receivedEvents
    .map((evt) => {
      const part = partById.get(evt.part_id);
      if (!part) return null;
      const ordered = orderedByPart.get(evt.part_id);
      const leadDays = ordered ? daysBetween(ordered, evt.occurred_at) : null;
      return { part, receivedAt: evt.occurred_at, leadDays };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    vendor,
    openOrderCount: openOrders.length,
    backOrderCount: backOrders.length,
    leadTimeDays: days,
    leadTimeSampleSize: sample,
    lastReceivedAt,
    lifetimePartsCount: parts.length,
    openOrders,
    backOrders,
    recentReceipts,
  };
}
