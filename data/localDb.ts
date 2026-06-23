import Dexie, { type Table } from 'dexie';
import type {
  Part,
  PartEvent,
  Vendor,
  VendorPricing,
  CustomerPurchase,
} from '@/types';

class PlotterDb extends Dexie {
  parts!: Table<Part, string>;
  events!: Table<PartEvent, string>;
  vendors!: Table<Vendor, string>;
  vendor_pricing!: Table<VendorPricing, string>;
  customer_purchases!: Table<CustomerPurchase, string>;

  constructor() {
    super('plotter');

    this.version(1).stores({
      // Compound indexes match the queries we expect: by shop+state, by shop+vendor, by wo#.
      parts: 'id, shop_id, vendor_id, current_state, part_number, [shop_id+current_state], [shop_id+vendor_id]',
      events: 'id, shop_id, part_id, vendor_id, wo_number, to_state, occurred_at, [shop_id+occurred_at], [wo_number+to_state]',
      vendors: 'id, shop_id, vendor_name, vendor_code, [shop_id+vendor_name]',
      vendor_pricing: 'id, part_id, vendor_id, [part_id+vendor_id]',
      customer_purchases: 'id, part_id, customer_id, customer_name, wo_number, date_purchased',
    });
  }
}

export const db = new PlotterDb();
