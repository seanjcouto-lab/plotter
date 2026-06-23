// Plotter — domain types
// Mirrors the Jaxtr inventory_events event-sourced spine.
// Events are truth; quantity_on_hand is a projection.

export type Uuid = string;
export type IsoTimestamp = string;

export enum PartState {
  ORDERED = 'ORDERED',
  BACK_ORDERED = 'BACK_ORDERED',
  RECEIVED = 'RECEIVED',
  STAGED = 'STAGED',
  SOLD = 'SOLD',
  USED = 'USED',
  RETURNED = 'RETURNED',
  NLA = 'NLA',
}

export const PART_STATE_ORDER: PartState[] = [
  PartState.ORDERED,
  PartState.BACK_ORDERED,
  PartState.RECEIVED,
  PartState.STAGED,
  PartState.SOLD,
  PartState.USED,
  PartState.RETURNED,
  PartState.NLA,
];

export type PartStateFilter = PartState | 'ALL';

// Terminal states never reopen. NLA preserves history forever.
export const TERMINAL_STATES: ReadonlySet<PartState> = new Set([
  PartState.SOLD,
  PartState.USED,
  PartState.RETURNED,
  PartState.NLA,
]);

export enum ActorRole {
  PARTS_MANAGER = 'PARTS_MANAGER',
  SERVICE_MANAGER = 'SERVICE_MANAGER',
  TECHNICIAN = 'TECHNICIAN',
  OPERATIONS_MANAGER = 'OPERATIONS_MANAGER',
  OWNER = 'OWNER',
  SYSTEM = 'SYSTEM',
}

// GL categories — drive COGS/QuickBooks export later. Free at design time.
export enum GlCategory {
  ENGINE_PARTS = 'ENGINE_PARTS',
  BOAT_PARTS = 'BOAT_PARTS',
  TRAILER_PARTS = 'TRAILER_PARTS',
  ELECTRICAL = 'ELECTRICAL',
  HARDWARE = 'HARDWARE',
  CONSUMABLES = 'CONSUMABLES',
  SHOP_SUPPLY = 'SHOP_SUPPLY',
  ACCESSORY = 'ACCESSORY',
  OTHER = 'OTHER',
}

export interface Vendor {
  id: Uuid;
  shop_id: Uuid;
  vendor_name: string;
  vendor_code: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  portal_url?: string;
  price_file_last_updated?: IsoTimestamp;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

// Per-vendor pricing for the same part. Enables side-by-side comparison at order time.
export interface VendorPricing {
  id: Uuid;
  part_id: Uuid;
  vendor_id: Uuid;
  vendor_part_number: string;
  dealer_cost: number;
  msrp: number;
  last_updated: IsoTimestamp;
}

export interface Part {
  id: Uuid;
  shop_id: Uuid;
  part_number: string;
  description: string;
  // Primary vendor — required at creation. Other vendors join via vendor_pricing.
  vendor_id: Uuid;
  dealer_cost: number;
  msrp: number;
  min_stock_qty: number;
  gl_category: GlCategory;

  // Projections — derived from events, never raw-mutated.
  current_state: PartState;
  quantity_on_hand: number;
  quantity_on_order: number;

  // Lifecycle date pins (derived from events but cached for query speed)
  date_ordered?: IsoTimestamp;
  date_received?: IsoTimestamp;
  date_sold?: IsoTimestamp;
  date_used?: IsoTimestamp;
  date_returned?: IsoTimestamp;

  // Photos attached to the part record itself (separate from per-event photos).
  photo_urls: string[];

  notes?: string;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

// Event spine — every transition is a discrete event.
// The wo_number rides every event from ORDER through SOLD. The thread.
export interface PartEvent {
  id: Uuid;
  shop_id: Uuid;
  part_id: Uuid;
  vendor_id?: Uuid;

  from_state?: PartState;
  to_state: PartState;
  quantity: number;

  // The WO# thread — present from ORDER time for job-linked parts; null for stock.
  wo_number?: string;
  customer_id?: Uuid;
  customer_name?: string;

  // Money at this event (cost when ordering/receiving, price when selling)
  unit_cost?: number;
  unit_price?: number;

  // Who did this, what role, when
  actor_id: Uuid;
  actor_role: ActorRole;
  occurred_at: IsoTimestamp;

  // Per-event photos: photograph the box, the slip, the damage, etc.
  photo_urls: string[];

  notes?: string;
}

// Per-customer purchase history for a part. Never deletes. NLA parts still show this.
export interface CustomerPurchase {
  id: Uuid;
  part_id: Uuid;
  customer_id?: Uuid;
  customer_name: string;
  wo_number?: string;
  quantity: number;
  price_sold: number;
  date_purchased: IsoTimestamp;
}
