-- Plotter — phone-first parts tracker
-- 5 additive tables under the plotter_ prefix. No existing Jaxtr tables altered.
-- Mirrors the inventory_events / vendors / inventory_parts conventions already in this DB.
-- RLS: authenticated full access (matches existing Jaxtr convention; tighten to per-shop later).

-- ============================================================================
-- 1. plotter_vendors
-- ============================================================================
CREATE TABLE public.plotter_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  vendor_code text NOT NULL,
  contact_name text,
  phone text,
  email text,
  portal_url text,
  price_file_last_updated timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plotter_vendors_shop_idx ON public.plotter_vendors(shop_id);
CREATE INDEX plotter_vendors_shop_name_idx ON public.plotter_vendors(shop_id, vendor_name);

ALTER TABLE public.plotter_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY plotter_vendors_all_authenticated ON public.plotter_vendors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. plotter_parts
-- One row per PHYSICAL part unit (not per SKU). Multiple rows can share the
-- same part_number — that's how we count quantity by state. Projection fields
-- (current_state, quantity_*, date_*) are denormalized from the event spine
-- for query speed; event spine is the source of truth.
-- ============================================================================
CREATE TABLE public.plotter_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.plotter_vendors(id),

  part_number text NOT NULL,
  description text NOT NULL,
  dealer_cost numeric NOT NULL DEFAULT 0,
  msrp numeric NOT NULL DEFAULT 0,
  min_stock_qty integer NOT NULL DEFAULT 1,
  gl_category text NOT NULL DEFAULT 'OTHER'
    CHECK (gl_category IN (
      'ENGINE_PARTS', 'BOAT_PARTS', 'TRAILER_PARTS', 'ELECTRICAL',
      'HARDWARE', 'CONSUMABLES', 'SHOP_SUPPLY', 'ACCESSORY', 'OTHER'
    )),

  current_state text NOT NULL DEFAULT 'ORDERED'
    CHECK (current_state IN (
      'ORDERED', 'BACK_ORDERED', 'RECEIVED', 'STAGED',
      'SOLD', 'USED', 'RETURNED', 'NLA'
    )),
  quantity_on_hand integer NOT NULL DEFAULT 0,
  quantity_on_order integer NOT NULL DEFAULT 0,

  date_ordered timestamptz,
  date_received timestamptz,
  date_sold timestamptz,
  date_used timestamptz,
  date_returned timestamptz,

  photo_urls text[] NOT NULL DEFAULT ARRAY[]::text[],

  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plotter_parts_shop_idx ON public.plotter_parts(shop_id);
CREATE INDEX plotter_parts_shop_part_number_idx ON public.plotter_parts(shop_id, part_number);
CREATE INDEX plotter_parts_shop_state_idx ON public.plotter_parts(shop_id, current_state);
CREATE INDEX plotter_parts_shop_vendor_idx ON public.plotter_parts(shop_id, vendor_id);
CREATE INDEX plotter_parts_updated_at_idx ON public.plotter_parts(updated_at DESC);

ALTER TABLE public.plotter_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY plotter_parts_all_authenticated ON public.plotter_parts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. plotter_vendor_pricing
-- Multi-vendor pricing per part. Enables side-by-side comparison at order time.
-- ============================================================================
CREATE TABLE public.plotter_vendor_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.plotter_parts(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.plotter_vendors(id) ON DELETE CASCADE,
  vendor_part_number text NOT NULL,
  dealer_cost numeric NOT NULL DEFAULT 0,
  msrp numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id, vendor_id)
);

CREATE INDEX plotter_vendor_pricing_part_idx ON public.plotter_vendor_pricing(part_id);
CREATE INDEX plotter_vendor_pricing_vendor_idx ON public.plotter_vendor_pricing(vendor_id);

ALTER TABLE public.plotter_vendor_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY plotter_vendor_pricing_all_authenticated ON public.plotter_vendor_pricing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. plotter_part_events
-- Append-only event spine. Every state transition is one event.
-- wo_number rides every event from ORDER time forward (the thread).
-- ============================================================================
CREATE TABLE public.plotter_part_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.plotter_parts(id),
  vendor_id uuid REFERENCES public.plotter_vendors(id),

  from_state text
    CHECK (from_state IS NULL OR from_state IN (
      'ORDERED', 'BACK_ORDERED', 'RECEIVED', 'STAGED',
      'SOLD', 'USED', 'RETURNED', 'NLA'
    )),
  to_state text NOT NULL
    CHECK (to_state IN (
      'ORDERED', 'BACK_ORDERED', 'RECEIVED', 'STAGED',
      'SOLD', 'USED', 'RETURNED', 'NLA'
    )),
  quantity integer NOT NULL DEFAULT 1,

  -- The thread: WO# + customer carry on every event
  wo_number text,
  customer_id uuid,
  customer_name text,

  -- Money at this event (cost for incoming, price for outgoing)
  unit_cost numeric,
  unit_price numeric,

  -- Who did this, when
  actor_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'PARTS_MANAGER'
    CHECK (actor_role IN (
      'PARTS_MANAGER', 'SERVICE_MANAGER', 'TECHNICIAN',
      'OPERATIONS_MANAGER', 'OWNER', 'SYSTEM'
    )),
  occurred_at timestamptz NOT NULL DEFAULT now(),

  photo_urls text[] NOT NULL DEFAULT ARRAY[]::text[],

  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plotter_part_events_shop_idx ON public.plotter_part_events(shop_id);
CREATE INDEX plotter_part_events_part_idx ON public.plotter_part_events(part_id);
CREATE INDEX plotter_part_events_part_occurred_idx
  ON public.plotter_part_events(part_id, occurred_at DESC);
CREATE INDEX plotter_part_events_shop_occurred_idx
  ON public.plotter_part_events(shop_id, occurred_at DESC);
CREATE INDEX plotter_part_events_wo_idx
  ON public.plotter_part_events(wo_number) WHERE wo_number IS NOT NULL;
CREATE INDEX plotter_part_events_vendor_idx
  ON public.plotter_part_events(vendor_id) WHERE vendor_id IS NOT NULL;

ALTER TABLE public.plotter_part_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY plotter_part_events_all_authenticated ON public.plotter_part_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. plotter_customer_purchases
-- Per-part purchase history. Never deletes. NLA parts keep their history forever.
-- ============================================================================
CREATE TABLE public.plotter_customer_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.plotter_parts(id),
  customer_id uuid,
  customer_name text NOT NULL,
  wo_number text,
  quantity integer NOT NULL DEFAULT 1,
  price_sold numeric NOT NULL DEFAULT 0,
  date_purchased timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plotter_customer_purchases_part_idx
  ON public.plotter_customer_purchases(part_id);
CREATE INDEX plotter_customer_purchases_customer_idx
  ON public.plotter_customer_purchases(customer_name);
CREATE INDEX plotter_customer_purchases_wo_idx
  ON public.plotter_customer_purchases(wo_number) WHERE wo_number IS NOT NULL;
CREATE INDEX plotter_customer_purchases_date_idx
  ON public.plotter_customer_purchases(date_purchased DESC);

ALTER TABLE public.plotter_customer_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY plotter_customer_purchases_all_authenticated
  ON public.plotter_customer_purchases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
