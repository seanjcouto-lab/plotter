// Write path for parts + their event spine.
// Every Part-creating call writes the Part row AND its initial PartEvent
// atomically in a Dexie transaction. Events are truth.

import { db } from '@/data/localDb';
import {
  ActorRole,
  GlCategory,
  PartState,
  TERMINAL_STATES,
  type CustomerPurchase,
  type Part,
  type PartEvent,
  type Vendor,
} from '@/types';
import { newId, nowIso } from '@/utils/id';
import {
  pushCustomerPurchase,
  pushEvent,
  pushEvents,
  pushPart,
  pushParts,
  pushVendor,
} from './syncService';

// Fire-and-forget sync helper — never blocks the Dexie write path.
function bg(promise: Promise<unknown>): void {
  promise.catch((err) => console.warn('[partRepository] sync push failed:', err));
}

const SHOP_ID = (import.meta.env.VITE_DEFAULT_SHOP_ID as string) || '00000000-0000-0000-0000-000000000001';
const ACTOR_ID = (import.meta.env.VITE_SEAN_AUTH_USER_ID as string) || 'ed553ec9-30c1-4572-b8c7-4c214c52498b';

export interface CreatePartInput {
  part_number: string;
  description: string;
  vendor_id: string;
  dealer_cost: number;
  msrp: number;
  min_stock_qty: number;
  gl_category: GlCategory;
  initial_state: PartState.ORDERED | PartState.RECEIVED;
  wo_number?: string;
  customer_name?: string;
  notes?: string;
  actor_role?: ActorRole;
}

export interface BulkPartInput {
  part_number: string;
  description: string;
  vendor_id: string;
  dealer_cost?: number;
  msrp?: number;
  min_stock_qty?: number;
  gl_category?: GlCategory;
  wo_number?: string;
  customer_name?: string;
  notes?: string;
}

export interface BulkCreateOptions {
  initial_state: PartState.ORDERED | PartState.RECEIVED;
  default_vendor_id?: string;
  default_gl_category?: GlCategory;
  default_min_stock_qty?: number;
  header_wo_number?: string;
  header_customer_name?: string;
  actor_role?: ActorRole;
}

// Create N parts + their initial events in a single Dexie transaction.
// Per-row fields override header/default fields.
export async function createPartsBulk(
  rows: BulkPartInput[],
  options: BulkCreateOptions,
): Promise<Part[]> {
  const now = nowIso();
  const isReceived = options.initial_state === PartState.RECEIVED;
  const parts: Part[] = [];
  const events: PartEvent[] = [];

  for (const row of rows) {
    const partId = newId();
    const vendorId = row.vendor_id || options.default_vendor_id;
    if (!vendorId) throw new Error(`Row "${row.part_number}" has no vendor`);

    const woNumber = row.wo_number?.trim() || options.header_wo_number?.trim() || undefined;
    const customerName = row.customer_name?.trim() || options.header_customer_name?.trim() || undefined;
    const dealerCost = row.dealer_cost ?? 0;

    const part: Part = {
      id: partId,
      shop_id: SHOP_ID,
      part_number: row.part_number.trim(),
      description: row.description.trim(),
      vendor_id: vendorId,
      dealer_cost: dealerCost,
      msrp: row.msrp ?? 0,
      min_stock_qty: row.min_stock_qty ?? options.default_min_stock_qty ?? 1,
      gl_category: row.gl_category ?? options.default_gl_category ?? GlCategory.OTHER,
      current_state: options.initial_state,
      quantity_on_hand: isReceived ? 1 : 0,
      quantity_on_order: isReceived ? 0 : 1,
      date_ordered: now,
      date_received: isReceived ? now : undefined,
      photo_urls: [],
      notes: row.notes?.trim() || undefined,
      created_at: now,
      updated_at: now,
    };

    const orderEvent: PartEvent = {
      id: newId(),
      shop_id: SHOP_ID,
      part_id: partId,
      vendor_id: vendorId,
      from_state: undefined,
      to_state: PartState.ORDERED,
      quantity: 1,
      wo_number: woNumber,
      customer_name: customerName,
      unit_cost: dealerCost,
      actor_id: ACTOR_ID,
      actor_role: options.actor_role ?? ActorRole.PARTS_MANAGER,
      occurred_at: now,
      photo_urls: [],
    };

    parts.push(part);
    events.push(orderEvent);

    if (isReceived) {
      events.push({
        ...orderEvent,
        id: newId(),
        from_state: PartState.ORDERED,
        to_state: PartState.RECEIVED,
      });
    }
  }

  await db.transaction('rw', db.parts, db.events, async () => {
    await db.parts.bulkPut(parts);
    await db.events.bulkPut(events);
  });

  bg(pushParts(parts));
  bg(pushEvents(events));

  return parts;
}

export async function createPart(input: CreatePartInput): Promise<Part> {
  const now = nowIso();
  const partId = newId();

  const isReceived = input.initial_state === PartState.RECEIVED;

  const part: Part = {
    id: partId,
    shop_id: SHOP_ID,
    part_number: input.part_number.trim(),
    description: input.description.trim(),
    vendor_id: input.vendor_id,
    dealer_cost: input.dealer_cost,
    msrp: input.msrp,
    min_stock_qty: input.min_stock_qty,
    gl_category: input.gl_category,
    current_state: input.initial_state,
    quantity_on_hand: isReceived ? 1 : 0,
    quantity_on_order: isReceived ? 0 : 1,
    date_ordered: now,
    date_received: isReceived ? now : undefined,
    photo_urls: [],
    notes: input.notes?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  // The thread: wo_number rides every event from ORDER time onward.
  const orderEvent: PartEvent = {
    id: newId(),
    shop_id: SHOP_ID,
    part_id: partId,
    vendor_id: input.vendor_id,
    from_state: undefined,
    to_state: PartState.ORDERED,
    quantity: 1,
    wo_number: input.wo_number?.trim() || undefined,
    customer_name: input.customer_name?.trim() || undefined,
    unit_cost: input.dealer_cost,
    actor_id: ACTOR_ID,
    actor_role: input.actor_role ?? ActorRole.PARTS_MANAGER,
    occurred_at: now,
    photo_urls: [],
  };

  const events: PartEvent[] = [orderEvent];

  if (isReceived) {
    events.push({
      id: newId(),
      shop_id: SHOP_ID,
      part_id: partId,
      vendor_id: input.vendor_id,
      from_state: PartState.ORDERED,
      to_state: PartState.RECEIVED,
      quantity: 1,
      wo_number: input.wo_number?.trim() || undefined,
      customer_name: input.customer_name?.trim() || undefined,
      unit_cost: input.dealer_cost,
      actor_id: ACTOR_ID,
      actor_role: input.actor_role ?? ActorRole.PARTS_MANAGER,
      occurred_at: now,
      photo_urls: [],
    });
  }

  await db.transaction('rw', db.parts, db.events, async () => {
    await db.parts.put(part);
    await db.events.bulkPut(events);
  });

  bg(pushPart(part));
  bg(pushEvents(events));

  return part;
}

export interface CreateVendorInput {
  vendor_name: string;
  vendor_code: string;
  contact_name?: string;
  phone?: string;
  email?: string;
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const now = nowIso();
  const vendor: Vendor = {
    id: newId(),
    shop_id: SHOP_ID,
    vendor_name: input.vendor_name.trim(),
    vendor_code: input.vendor_code.trim().toUpperCase(),
    contact_name: input.contact_name?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };
  await db.vendors.put(vendor);
  bg(pushVendor(vendor));
  return vendor;
}

export interface AdvanceStateInput {
  part_id: string;
  to_state: PartState;
  wo_number?: string;
  customer_name?: string;
  customer_id?: string;
  sale_price?: number;
  notes?: string;
  actor_role?: ActorRole;
}

// Project Part fields (current_state, quantities, lifecycle dates) from the
// canonical event spine, then atomically advance state + write the event
// + (when SOLD) write a CustomerPurchase row.
export async function advanceState(input: AdvanceStateInput): Promise<Part> {
  const now = nowIso();

  return db.transaction('rw', db.parts, db.events, db.customer_purchases, async () => {
    const part = await db.parts.get(input.part_id);
    if (!part) throw new Error(`Part ${input.part_id} not found`);

    // Inherit the thread: if the operator didn't pass a WO/customer, carry over
    // whatever rode the most recent event.
    const latestEvent = await db.events
      .where('part_id')
      .equals(part.id)
      .toArray()
      .then((arr) => arr.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]);

    const carriedWo = input.wo_number?.trim() || latestEvent?.wo_number;
    const carriedCustomer = input.customer_name?.trim() || latestEvent?.customer_name;
    const carriedCustomerId = input.customer_id || latestEvent?.customer_id;

    const event: PartEvent = {
      id: newId(),
      shop_id: part.shop_id,
      part_id: part.id,
      vendor_id: part.vendor_id,
      from_state: part.current_state,
      to_state: input.to_state,
      quantity: 1,
      wo_number: carriedWo || undefined,
      customer_id: carriedCustomerId,
      customer_name: carriedCustomer || undefined,
      unit_cost: input.to_state === PartState.RECEIVED ? part.dealer_cost : undefined,
      unit_price: input.sale_price,
      actor_id: ACTOR_ID,
      actor_role: input.actor_role ?? ActorRole.PARTS_MANAGER,
      occurred_at: now,
      photo_urls: [],
      notes: input.notes?.trim() || undefined,
    };

    const updated: Part = {
      ...part,
      current_state: input.to_state,
      quantity_on_order:
        input.to_state === PartState.ORDERED || input.to_state === PartState.BACK_ORDERED ? 1 : 0,
      quantity_on_hand:
        input.to_state === PartState.RECEIVED || input.to_state === PartState.STAGED ? 1 : 0,
      date_received: input.to_state === PartState.RECEIVED && !part.date_received ? now : part.date_received,
      date_sold: input.to_state === PartState.SOLD ? now : part.date_sold,
      date_used: input.to_state === PartState.USED ? now : part.date_used,
      date_returned: input.to_state === PartState.RETURNED ? now : part.date_returned,
      updated_at: now,
    };

    await db.events.put(event);
    await db.parts.put(updated);

    let purchase: CustomerPurchase | undefined;
    if (input.to_state === PartState.SOLD && input.sale_price !== undefined) {
      purchase = {
        id: newId(),
        part_id: part.id,
        customer_id: carriedCustomerId,
        customer_name: carriedCustomer || 'Walk-in',
        wo_number: carriedWo,
        quantity: 1,
        price_sold: input.sale_price,
        date_purchased: now,
      };
      await db.customer_purchases.put(purchase);
    }

    bg(pushEvent(event));
    bg(pushPart(updated));
    if (purchase) bg(pushCustomerPurchase(purchase));

    return updated;
  });
}

export interface UpdatePartInput {
  part_id: string;
  part_number?: string;
  description?: string;
  dealer_cost?: number;
  msrp?: number;
  min_stock_qty?: number;
  gl_category?: GlCategory;
  notes?: string;
  vendor_id?: string;
}

// Field edits to a Part — does NOT create a state event, but DOES bump updated_at.
// Editing is locked once the part is in a terminal state to preserve history.
export async function updatePart(input: UpdatePartInput): Promise<Part> {
  const part = await db.parts.get(input.part_id);
  if (!part) throw new Error(`Part ${input.part_id} not found`);
  if (TERMINAL_STATES.has(part.current_state)) {
    throw new Error(`Cannot edit a part in terminal state (${part.current_state})`);
  }

  const updated: Part = {
    ...part,
    part_number: input.part_number?.trim() || part.part_number,
    description: input.description ?? part.description,
    dealer_cost: input.dealer_cost ?? part.dealer_cost,
    msrp: input.msrp ?? part.msrp,
    min_stock_qty: input.min_stock_qty ?? part.min_stock_qty,
    gl_category: input.gl_category ?? part.gl_category,
    notes: input.notes ?? part.notes,
    vendor_id: input.vendor_id ?? part.vendor_id,
    updated_at: nowIso(),
  };
  await db.parts.put(updated);
  bg(pushPart(updated));
  return updated;
}
