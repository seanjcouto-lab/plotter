import { db } from './localDb';
import {
  ActorRole,
  GlCategory,
  PartState,
  type Part,
  type PartEvent,
  type Vendor,
} from '@/types';

const SHOP_ID = (import.meta.env.VITE_DEFAULT_SHOP_ID as string) || '00000000-0000-0000-0000-000000000001';
const ACTOR_ID = (import.meta.env.VITE_SEAN_AUTH_USER_ID as string) || 'ed553ec9-30c1-4572-b8c7-4c214c52498b';

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function uuid(seed: string): string {
  // Deterministic-ish stub UUID for mock data — real records use crypto.randomUUID().
  const h = seed.padEnd(32, '0').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const VENDORS: Vendor[] = [
  {
    id: uuid('vendor-landandsea'),
    shop_id: SHOP_ID,
    vendor_name: 'Land & Sea Distributing',
    vendor_code: 'LS',
    contact_name: 'Mike Carrier',
    phone: '603-555-0102',
    email: 'orders@landandsea.com',
    price_file_last_updated: daysAgo(14),
    created_at: daysAgo(90),
    updated_at: daysAgo(14),
  },
  {
    id: uuid('vendor-yamaha'),
    shop_id: SHOP_ID,
    vendor_name: 'Yamaha Marine',
    vendor_code: 'YAM',
    contact_name: 'Dealer Portal',
    portal_url: 'https://yamaha-marine-dealer.example.com',
    created_at: daysAgo(120),
    updated_at: daysAgo(30),
  },
  {
    id: uuid('vendor-suzuki'),
    shop_id: SHOP_ID,
    vendor_name: 'Suzuki Marine',
    vendor_code: 'SUZ',
    contact_name: 'Donovan Marine Rep',
    phone: '401-555-0211',
    created_at: daysAgo(150),
    updated_at: daysAgo(45),
  },
];

interface MockPartSeed {
  part_number: string;
  description: string;
  vendor_id: string;
  dealer_cost: number;
  msrp: number;
  current_state: PartState;
  wo_number?: string;
  customer_name?: string;
  days_ago_ordered?: number;
  days_ago_received?: number;
  days_ago_sold?: number;
  gl_category?: GlCategory;
  min_stock_qty?: number;
  notes?: string;
}

const PART_SEEDS: MockPartSeed[] = [
  {
    part_number: '6BG-13407-00',
    description: 'Fuel Filter — Yamaha F150',
    vendor_id: VENDORS[1].id,
    dealer_cost: 24.50,
    msrp: 41.99,
    current_state: PartState.STAGED,
    wo_number: 'WO-12847',
    customer_name: 'Bob Burditsman',
    days_ago_ordered: 6,
    days_ago_received: 2,
    gl_category: GlCategory.ENGINE_PARTS,
    min_stock_qty: 2,
  },
  {
    part_number: '90430-08020',
    description: 'Lower Unit Drain Gasket — Yamaha',
    vendor_id: VENDORS[1].id,
    dealer_cost: 0.85,
    msrp: 2.99,
    current_state: PartState.RECEIVED,
    days_ago_ordered: 9,
    days_ago_received: 1,
    gl_category: GlCategory.ENGINE_PARTS,
    min_stock_qty: 20,
  },
  {
    part_number: '17672-93J00',
    description: 'Water Pump Impeller — Suzuki DF50',
    vendor_id: VENDORS[2].id,
    dealer_cost: 18.20,
    msrp: 36.50,
    current_state: PartState.ORDERED,
    wo_number: 'WO-12851',
    customer_name: 'Marsh Marine',
    days_ago_ordered: 2,
    gl_category: GlCategory.ENGINE_PARTS,
    min_stock_qty: 4,
  },
  {
    part_number: 'LS-50-89271',
    description: 'Anode Kit — Aluminum',
    vendor_id: VENDORS[0].id,
    dealer_cost: 12.40,
    msrp: 24.99,
    current_state: PartState.SOLD,
    wo_number: 'WO-12830',
    customer_name: 'Doug Dominick',
    days_ago_ordered: 21,
    days_ago_received: 14,
    days_ago_sold: 9,
    gl_category: GlCategory.HARDWARE,
    min_stock_qty: 6,
  },
  {
    part_number: 'LS-14-7720',
    description: 'Marine Grease — 14oz Tube',
    vendor_id: VENDORS[0].id,
    dealer_cost: 4.80,
    msrp: 9.99,
    current_state: PartState.USED,
    wo_number: 'WO-12819',
    days_ago_ordered: 30,
    days_ago_received: 22,
    days_ago_sold: 7,
    gl_category: GlCategory.SHOP_SUPPLY,
    min_stock_qty: 12,
  },
  {
    part_number: '6E5-45114-00',
    description: 'Prop Shaft Seal — Yamaha 200hp',
    vendor_id: VENDORS[1].id,
    dealer_cost: 11.30,
    msrp: 22.99,
    current_state: PartState.BACK_ORDERED,
    wo_number: 'WO-12849',
    customer_name: 'Ocean King',
    days_ago_ordered: 11,
    gl_category: GlCategory.ENGINE_PARTS,
    min_stock_qty: 3,
    notes: 'Yamaha confirmed backorder — ETA early July',
  },
  {
    part_number: 'LS-50-77175',
    description: 'Steering Cable — 14ft',
    vendor_id: VENDORS[0].id,
    dealer_cost: 78.20,
    msrp: 149.99,
    current_state: PartState.RETURNED,
    wo_number: 'WO-12808',
    customer_name: 'Stateline Boatworks',
    days_ago_ordered: 35,
    days_ago_received: 28,
    days_ago_sold: 18,
    gl_category: GlCategory.HARDWARE,
    min_stock_qty: 1,
    notes: 'Wrong length — returned to Land & Sea for credit',
  },
  {
    part_number: '6BG-W0093-00',
    description: 'Trim Tilt Motor — Yamaha F70',
    vendor_id: VENDORS[1].id,
    dealer_cost: 412.00,
    msrp: 689.00,
    current_state: PartState.ORDERED,
    wo_number: 'WO-12854',
    customer_name: 'Anchor Marine',
    days_ago_ordered: 1,
    gl_category: GlCategory.ENGINE_PARTS,
    min_stock_qty: 0,
  },
  {
    part_number: 'NLA-90-1822',
    description: 'OMC Stringer Bellows — discontinued',
    vendor_id: VENDORS[0].id,
    dealer_cost: 0,
    msrp: 0,
    current_state: PartState.NLA,
    wo_number: 'WO-09112',
    customer_name: 'Stateline Boatworks',
    days_ago_ordered: 380,
    days_ago_received: 372,
    days_ago_sold: 365,
    gl_category: GlCategory.OTHER,
    min_stock_qty: 0,
    notes: 'OMC discontinued line — no aftermarket equivalent. Customer record preserved.',
  },
];

function buildEventsForPart(part: Part, seed: MockPartSeed): PartEvent[] {
  const events: PartEvent[] = [];
  const base = {
    shop_id: part.shop_id,
    part_id: part.id,
    vendor_id: part.vendor_id,
    actor_id: ACTOR_ID,
    actor_role: ActorRole.PARTS_MANAGER,
    photo_urls: [] as string[],
    wo_number: seed.wo_number,
    customer_name: seed.customer_name,
  };

  if (seed.days_ago_ordered !== undefined) {
    events.push({
      ...base,
      id: uuid(`evt-ord-${part.id}`),
      from_state: undefined,
      to_state: PartState.ORDERED,
      quantity: 1,
      unit_cost: seed.dealer_cost,
      occurred_at: daysAgo(seed.days_ago_ordered),
    });
  }
  if (seed.current_state === PartState.BACK_ORDERED) {
    events.push({
      ...base,
      id: uuid(`evt-bo-${part.id}`),
      from_state: PartState.ORDERED,
      to_state: PartState.BACK_ORDERED,
      quantity: 1,
      occurred_at: daysAgo((seed.days_ago_ordered || 1) - 1),
      notes: seed.notes,
    });
  }
  if (seed.days_ago_received !== undefined) {
    events.push({
      ...base,
      id: uuid(`evt-rec-${part.id}`),
      from_state: PartState.ORDERED,
      to_state: PartState.RECEIVED,
      quantity: 1,
      unit_cost: seed.dealer_cost,
      occurred_at: daysAgo(seed.days_ago_received),
    });
  }
  if (
    seed.current_state === PartState.STAGED ||
    seed.current_state === PartState.SOLD ||
    seed.current_state === PartState.USED ||
    seed.current_state === PartState.RETURNED ||
    seed.current_state === PartState.NLA
  ) {
    events.push({
      ...base,
      id: uuid(`evt-stg-${part.id}`),
      from_state: PartState.RECEIVED,
      to_state: PartState.STAGED,
      quantity: 1,
      occurred_at: daysAgo((seed.days_ago_received || 2) - 1),
    });
  }
  if (seed.days_ago_sold !== undefined) {
    const finalState = seed.current_state;
    events.push({
      ...base,
      id: uuid(`evt-${finalState.toLowerCase()}-${part.id}`),
      from_state: PartState.STAGED,
      to_state: finalState,
      quantity: 1,
      unit_price: seed.msrp,
      occurred_at: daysAgo(seed.days_ago_sold),
      notes: seed.notes,
    });
  }

  return events;
}

export async function seedIfEmpty(): Promise<void> {
  const partCount = await db.parts.count();
  if (partCount > 0) return;

  await db.vendors.bulkPut(VENDORS);

  const parts: Part[] = [];
  const events: PartEvent[] = [];

  for (const seed of PART_SEEDS) {
    const part: Part = {
      id: uuid(`part-${seed.part_number}`),
      shop_id: SHOP_ID,
      part_number: seed.part_number,
      description: seed.description,
      vendor_id: seed.vendor_id,
      dealer_cost: seed.dealer_cost,
      msrp: seed.msrp,
      min_stock_qty: seed.min_stock_qty ?? 1,
      gl_category: seed.gl_category ?? GlCategory.OTHER,
      current_state: seed.current_state,
      quantity_on_hand:
        seed.current_state === PartState.RECEIVED ||
        seed.current_state === PartState.STAGED
          ? 1
          : 0,
      quantity_on_order:
        seed.current_state === PartState.ORDERED ||
        seed.current_state === PartState.BACK_ORDERED
          ? 1
          : 0,
      date_ordered: seed.days_ago_ordered !== undefined ? daysAgo(seed.days_ago_ordered) : undefined,
      date_received: seed.days_ago_received !== undefined ? daysAgo(seed.days_ago_received) : undefined,
      date_sold:
        seed.current_state === PartState.SOLD && seed.days_ago_sold !== undefined
          ? daysAgo(seed.days_ago_sold)
          : undefined,
      date_used:
        seed.current_state === PartState.USED && seed.days_ago_sold !== undefined
          ? daysAgo(seed.days_ago_sold)
          : undefined,
      date_returned:
        seed.current_state === PartState.RETURNED && seed.days_ago_sold !== undefined
          ? daysAgo(seed.days_ago_sold)
          : undefined,
      photo_urls: [],
      notes: seed.notes,
      created_at: daysAgo(seed.days_ago_ordered ?? 30),
      updated_at: now(),
    };
    parts.push(part);
    events.push(...buildEventsForPart(part, seed));
  }

  await db.parts.bulkPut(parts);
  await db.events.bulkPut(events);
}
