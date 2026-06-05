-- Pharmacy compliance, audit, returns, and dispensing controls.

CREATE TABLE IF NOT EXISTS pharmacy_audit_logs (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  actor_id INTEGER,
  actor_type VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_logs_pharmacy_id
  ON pharmacy_audit_logs(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_logs_resource
  ON pharmacy_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_logs_created_at
  ON pharmacy_audit_logs(created_at);

CREATE TABLE IF NOT EXISTS pharmacy_returns (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  transaction_id INTEGER REFERENCES pharmacy_transactions(id),
  reason TEXT,
  total_amount DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed',
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pharmacy_return_items (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES pharmacy_returns(id),
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_returns_pharmacy_id
  ON pharmacy_returns(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_returns_transaction_id
  ON pharmacy_returns(transaction_id);

ALTER TABLE pharmacy_medicines
  ADD COLUMN IF NOT EXISTS schedule VARCHAR(50);
ALTER TABLE pharmacy_medicines
  ADD COLUMN IF NOT EXISTS is_controlled BOOLEAN DEFAULT false;

ALTER TABLE pharmacy_prescriptions
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'pending';
ALTER TABLE pharmacy_prescriptions
  ADD COLUMN IF NOT EXISTS pharmacist_notes TEXT;
ALTER TABLE pharmacy_prescriptions
  ADD COLUMN IF NOT EXISTS verified_by INTEGER;
ALTER TABLE pharmacy_prescriptions
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE pharmacy_prescriptions
  ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMP;
ALTER TABLE pharmacy_prescriptions
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

ALTER TABLE pharmacy_purchase_orders
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;
ALTER TABLE pharmacy_purchase_orders
  ADD COLUMN IF NOT EXISTS received_by INTEGER;
