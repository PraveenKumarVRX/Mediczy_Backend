-- Create missing tables for hospital management system

-- 1. Drop existing lab_orders if it exists with wrong schema
DROP TABLE IF EXISTS lab_orders CASCADE;

-- 2. Create lab_orders table
CREATE TABLE lab_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  patient_id INTEGER REFERENCES users(id),
  doctor_id INTEGER REFERENCES users(id),
  test_type VARCHAR(100) NOT NULL,
  test_category VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'normal',
  sample_collected_at TIMESTAMP,
  results TEXT,
  notes TEXT,
  organization_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create indexes for lab_orders
CREATE INDEX idx_lab_orders_organization ON lab_orders(organization_id);
CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX idx_lab_orders_doctor ON lab_orders(doctor_id);
CREATE INDEX idx_lab_orders_status ON lab_orders(status);
CREATE UNIQUE INDEX idx_lab_orders_number ON lab_orders(order_number);

-- 4. Verify all required tables exist
SELECT 
  tablename,
  CASE 
    WHEN tablename IN ('beds', 'lab_orders', 'pharmacy_inventory', 'prescription_dispensing') THEN '✅ NEW'
    ELSE '   '
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('beds', 'lab_orders', 'pharmacy_inventory', 'prescription_dispensing', 'appointments', 'users')
ORDER BY tablename;
