/**
 * SCM table bootstrap — foundation + Phase 2-5 enterprise workflows.
 * Called from server/routes/scm.route.js on startup.
 */

export async function ensureScmFoundationTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS scm_items (
      id SERIAL PRIMARY KEY,
      item_code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(240) NOT NULL,
      category VARCHAR(120),
      uom VARCHAR(40) NOT NULL DEFAULT 'EA',
      hsn_code VARCHAR(20),
      gst_rate NUMERIC(5,2) DEFAULT 0,
      reorder_level NUMERIC(12,2) DEFAULT 0,
      criticality VARCHAR(20) DEFAULT 'B',
      is_controlled BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_warehouses (
      id SERIAL PRIMARY KEY,
      code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      store_type VARCHAR(40) NOT NULL DEFAULT 'central',
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_locations (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE CASCADE,
      code VARCHAR(40) NOT NULL,
      zone VARCHAR(80),
      par_level NUMERIC(12,2) DEFAULT 0,
      max_level NUMERIC(12,2) DEFAULT 0,
      UNIQUE (warehouse_id, code)
    );

    CREATE TABLE IF NOT EXISTS scm_inventory_ledger (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES scm_locations(id) ON DELETE SET NULL,
      txn_type VARCHAR(40) NOT NULL,
      quantity_delta NUMERIC(12,2) NOT NULL,
      unit_cost NUMERIC(12,2),
      reference_type VARCHAR(40),
      reference_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_indents (
      id SERIAL PRIMARY KEY,
      indent_number VARCHAR(80) UNIQUE NOT NULL,
      department VARCHAR(120) NOT NULL,
      requested_by VARCHAR(160),
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      priority VARCHAR(40) NOT NULL DEFAULT 'routine',
      required_by DATE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_indent_lines (
      id SERIAL PRIMARY KEY,
      indent_id INTEGER REFERENCES scm_indents(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      quantity NUMERIC(12,2) NOT NULL,
      issued_quantity NUMERIC(12,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scm_purchase_orders (
      id SERIAL PRIMARY KEY,
      po_number VARCHAR(80) UNIQUE NOT NULL,
      vendor_id INTEGER,
      department VARCHAR(120),
      requested_by VARCHAR(160),
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      required_by DATE,
      blanket_order_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_po_lines (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES scm_purchase_orders(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      description VARCHAR(240) NOT NULL,
      quantity NUMERIC(12,2) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      received_quantity NUMERIC(12,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scm_grns (
      id SERIAL PRIMARY KEY,
      grn_number VARCHAR(80) UNIQUE NOT NULL,
      order_id INTEGER REFERENCES scm_purchase_orders(id) ON DELETE SET NULL,
      received_by VARCHAR(160),
      received_at TIMESTAMP NOT NULL DEFAULT NOW(),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS scm_grn_lines (
      id SERIAL PRIMARY KEY,
      grn_id INTEGER REFERENCES scm_grns(id) ON DELETE CASCADE,
      po_line_id INTEGER REFERENCES scm_po_lines(id) ON DELETE SET NULL,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      quantity NUMERIC(12,2) NOT NULL,
      batch_number VARCHAR(80),
      expiry_date DATE
    );

    CREATE TABLE IF NOT EXISTS scm_vendors (
      id SERIAL PRIMARY KEY,
      vendor_code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(120),
      gstin VARCHAR(20),
      contact_name VARCHAR(160),
      phone VARCHAR(40),
      risk_score NUMERIC(5,2) DEFAULT 50,
      status VARCHAR(40) NOT NULL DEFAULT 'approved',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

export async function ensureScmPhase25Tables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS scm_cost_centers (
      id SERIAL PRIMARY KEY,
      code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      department VARCHAR(120),
      gl_code VARCHAR(40),
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_ap_invoices (
      id SERIAL PRIMARY KEY,
      invoice_number VARCHAR(80) UNIQUE NOT NULL,
      vendor_id INTEGER REFERENCES scm_vendors(id) ON DELETE SET NULL,
      po_id INTEGER REFERENCES scm_purchase_orders(id) ON DELETE SET NULL,
      grn_id INTEGER REFERENCES scm_grns(id) ON DELETE SET NULL,
      invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
      amount NUMERIC(12,2) NOT NULL,
      tax_amount NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      match_status VARCHAR(40) NOT NULL DEFAULT 'unmatched',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_ap_payments (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER REFERENCES scm_ap_invoices(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      payment_method VARCHAR(40),
      payment_ref VARCHAR(80),
      paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
      status VARCHAR(40) NOT NULL DEFAULT 'completed'
    );

    CREATE TABLE IF NOT EXISTS scm_preference_cards (
      id SERIAL PRIMARY KEY,
      procedure_code VARCHAR(80) NOT NULL,
      procedure_name VARCHAR(200) NOT NULL,
      surgeon_name VARCHAR(160),
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_preference_card_items (
      id SERIAL PRIMARY KEY,
      card_id INTEGER REFERENCES scm_preference_cards(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      default_quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
      is_implant BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS scm_case_carts (
      id SERIAL PRIMARY KEY,
      cart_number VARCHAR(80) UNIQUE NOT NULL,
      preference_card_id INTEGER REFERENCES scm_preference_cards(id) ON DELETE SET NULL,
      procedure_code VARCHAR(80),
      ot_room VARCHAR(80),
      scheduled_at TIMESTAMP,
      status VARCHAR(40) NOT NULL DEFAULT 'preparing',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_case_cart_items (
      id SERIAL PRIMARY KEY,
      cart_id INTEGER REFERENCES scm_case_carts(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      planned_quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
      picked_quantity NUMERIC(12,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scm_charge_captures (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER,
      encounter_id INTEGER,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12,2),
      cost_center_id INTEGER REFERENCES scm_cost_centers(id) ON DELETE SET NULL,
      source_type VARCHAR(40),
      source_id INTEGER,
      billed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_formulary (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE CASCADE,
      tier VARCHAR(40) NOT NULL DEFAULT 'formulary',
      restriction_notes TEXT,
      effective_from DATE DEFAULT CURRENT_DATE,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      UNIQUE (item_id)
    );

    CREATE TABLE IF NOT EXISTS scm_asn (
      id SERIAL PRIMARY KEY,
      asn_number VARCHAR(80) UNIQUE NOT NULL,
      po_id INTEGER REFERENCES scm_purchase_orders(id) ON DELETE SET NULL,
      vendor_id INTEGER REFERENCES scm_vendors(id) ON DELETE SET NULL,
      expected_at TIMESTAMP,
      status VARCHAR(40) NOT NULL DEFAULT 'in_transit',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_asn_lines (
      id SERIAL PRIMARY KEY,
      asn_id INTEGER REFERENCES scm_asn(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      quantity NUMERIC(12,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scm_vendor_catalogue (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER REFERENCES scm_vendors(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE CASCADE,
      vendor_sku VARCHAR(80),
      contract_price NUMERIC(12,2),
      lead_time_days INTEGER DEFAULT 7,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      UNIQUE (vendor_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS scm_blanket_orders (
      id SERIAL PRIMARY KEY,
      blanket_number VARCHAR(80) UNIQUE NOT NULL,
      vendor_id INTEGER REFERENCES scm_vendors(id) ON DELETE SET NULL,
      max_amount NUMERIC(12,2) NOT NULL,
      consumed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      valid_from DATE,
      valid_to DATE,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scm_cycle_counts (
      id SERIAL PRIMARY KEY,
      count_number VARCHAR(80) UNIQUE NOT NULL,
      warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE SET NULL,
      scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
      counted_by VARCHAR(160),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scm_cycle_count_lines (
      id SERIAL PRIMARY KEY,
      count_id INTEGER REFERENCES scm_cycle_counts(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES scm_locations(id) ON DELETE SET NULL,
      system_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      counted_qty NUMERIC(12,2),
      variance NUMERIC(12,2)
    );

    CREATE TABLE IF NOT EXISTS scm_cold_chain_logs (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE SET NULL,
      batch_number VARCHAR(80),
      temperature_c NUMERIC(5,2) NOT NULL,
      recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
      recorded_by VARCHAR(160),
      alert_triggered BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS scm_controlled_substance_logs (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES scm_items(id) ON DELETE SET NULL,
      txn_type VARCHAR(40) NOT NULL,
      quantity NUMERIC(12,2) NOT NULL,
      balance_after NUMERIC(12,2),
      witness_name VARCHAR(160),
      patient_id INTEGER,
      reference_type VARCHAR(40),
      reference_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

export async function ensureAllScmTables(db) {
  await ensureScmFoundationTables(db);
  await ensureScmPhase25Tables(db);
}
