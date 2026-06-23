// Cloud sync layer. Dexie is the primary store (local-first); Supabase is the
// async sync target. On sign-in: push local → cloud, then pull cloud → Dexie.
// Every Dexie mutation also fires a fire-and-forget Supabase write.

import { db } from '@/data/localDb';
import { getSupabase } from './supabaseClient';
import type {
  CustomerPurchase,
  Part,
  PartEvent,
  Vendor,
  VendorPricing,
} from '@/types';

const SHOP_ID = (import.meta.env.VITE_DEFAULT_SHOP_ID as string) || '00000000-0000-0000-0000-000000000001';

export interface SyncStatus {
  online: boolean;
  lastError?: string;
  lastSyncAt?: string;
}

const listeners: Array<(s: SyncStatus) => void> = [];
let currentStatus: SyncStatus = { online: false };

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function onSyncStatusChange(cb: (s: SyncStatus) => void): () => void {
  listeners.push(cb);
  cb(currentStatus);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function setStatus(s: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...s };
  listeners.forEach((cb) => cb(currentStatus));
}

// ----- Mapping (Dexie row ↔ Supabase row) ---------------------------------
// Schemas match 1:1; only need to omit undefined keys for cleaner inserts.

function clean<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

// ----- Push (Dexie → Supabase) -------------------------------------------

async function withClient<T>(fn: (sb: NonNullable<ReturnType<typeof getSupabase>>) => Promise<T>): Promise<T | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const result = await fn(sb);
    setStatus({ online: true, lastError: undefined, lastSyncAt: new Date().toISOString() });
    return result;
  } catch (err) {
    const msg = (err as Error).message || 'Sync error';
    setStatus({ online: false, lastError: msg });
    console.error('[sync] error:', msg);
    return null;
  }
}

export async function pushVendor(vendor: Vendor): Promise<void> {
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_vendors').upsert(clean(vendor));
    if (error) throw error;
  });
}

export async function pushPart(part: Part): Promise<void> {
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_parts').upsert(clean(part));
    if (error) throw error;
  });
}

export async function pushParts(parts: Part[]): Promise<void> {
  if (parts.length === 0) return;
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_parts').upsert(parts.map(clean));
    if (error) throw error;
  });
}

export async function pushEvent(event: PartEvent): Promise<void> {
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_part_events').insert(clean(event));
    if (error) throw error;
  });
}

export async function pushEvents(events: PartEvent[]): Promise<void> {
  if (events.length === 0) return;
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_part_events').insert(events.map(clean));
    if (error) throw error;
  });
}

export async function pushVendorPricing(pricing: VendorPricing): Promise<void> {
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_vendor_pricing').upsert(clean(pricing));
    if (error) throw error;
  });
}

export async function pushCustomerPurchase(purchase: CustomerPurchase): Promise<void> {
  await withClient(async (sb) => {
    const { error } = await sb.from('plotter_customer_purchases').insert(clean(purchase));
    if (error) throw error;
  });
}

// ----- Pull (Supabase → Dexie) -------------------------------------------

interface PullCounts {
  vendors: number;
  parts: number;
  events: number;
  pricing: number;
  purchases: number;
}

export async function hydrateFromCloud(shopId: string = SHOP_ID): Promise<PullCounts | null> {
  return withClient(async (sb) => {
    const [vendorsRes, partsRes, eventsRes, pricingRes, purchasesRes] = await Promise.all([
      sb.from('plotter_vendors').select('*').eq('shop_id', shopId),
      sb.from('plotter_parts').select('*').eq('shop_id', shopId),
      sb.from('plotter_part_events').select('*').eq('shop_id', shopId),
      sb.from('plotter_vendor_pricing').select('*'),
      sb.from('plotter_customer_purchases').select('*'),
    ]);

    for (const r of [vendorsRes, partsRes, eventsRes, pricingRes, purchasesRes]) {
      if (r.error) throw r.error;
    }

    const vendors = (vendorsRes.data ?? []) as Vendor[];
    const parts = (partsRes.data ?? []) as Part[];
    const events = (eventsRes.data ?? []) as PartEvent[];
    const pricing = (pricingRes.data ?? []) as VendorPricing[];
    const purchases = (purchasesRes.data ?? []) as CustomerPurchase[];

    await db.transaction(
      'rw',
      db.vendors,
      db.parts,
      db.events,
      db.vendor_pricing,
      db.customer_purchases,
      async () => {
        await db.vendors.clear();
        await db.parts.clear();
        await db.events.clear();
        await db.vendor_pricing.clear();
        await db.customer_purchases.clear();
        if (vendors.length > 0) await db.vendors.bulkPut(vendors);
        if (parts.length > 0) await db.parts.bulkPut(parts);
        if (events.length > 0) await db.events.bulkPut(events);
        if (pricing.length > 0) await db.vendor_pricing.bulkPut(pricing);
        if (purchases.length > 0) await db.customer_purchases.bulkPut(purchases);
      },
    );

    return {
      vendors: vendors.length,
      parts: parts.length,
      events: events.length,
      pricing: pricing.length,
      purchases: purchases.length,
    };
  });
}

// First sign-in flow: push local rows to cloud (in case there are any),
// then pull cloud back down as truth. UUID PKs prevent duplicates on upsert.
export async function pushLocalThenHydrate(shopId: string = SHOP_ID): Promise<PullCounts | null> {
  return withClient(async (sb) => {
    const [localVendors, localParts, localEvents, localPricing, localPurchases] = await Promise.all([
      db.vendors.toArray(),
      db.parts.toArray(),
      db.events.toArray(),
      db.vendor_pricing.toArray(),
      db.customer_purchases.toArray(),
    ]);

    // Push in dependency order (vendors → parts → events/pricing/purchases)
    if (localVendors.length > 0) {
      const { error } = await sb.from('plotter_vendors').upsert(localVendors.map(clean));
      if (error) throw error;
    }
    if (localParts.length > 0) {
      const { error } = await sb.from('plotter_parts').upsert(localParts.map(clean));
      if (error) throw error;
    }
    if (localEvents.length > 0) {
      const { error } = await sb.from('plotter_part_events').upsert(localEvents.map(clean));
      if (error) throw error;
    }
    if (localPricing.length > 0) {
      const { error } = await sb.from('plotter_vendor_pricing').upsert(localPricing.map(clean));
      if (error) throw error;
    }
    if (localPurchases.length > 0) {
      const { error } = await sb.from('plotter_customer_purchases').upsert(localPurchases.map(clean));
      if (error) throw error;
    }

    return null;
  }).then(() => hydrateFromCloud(shopId));
}
