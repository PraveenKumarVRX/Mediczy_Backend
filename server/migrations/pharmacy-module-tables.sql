-- Pharmacy Module Tables

-- Pharmacy Medicines
CREATE TABLE IF NOT EXISTS pharmacy_medicines (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  reorder_level INTEGER DEFAULT 20,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Stock
CREATE TABLE IF NOT EXISTS pharmacy_stock (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  expiry_date DATE,
  batch_number VARCHAR(100),
  supplier VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medicine_id) REFERENCES pharmacy_medicines(id)
);

-- Pharmacy Transactions (Point of Sales)
CREATE TABLE IF NOT EXISTS pharmacy_transactions (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  customer_id INTEGER,
  total_amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Transaction Items
CREATE TABLE IF NOT EXISTS pharmacy_transaction_items (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES pharmacy_transactions(id),
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL
);

-- Pharmacy Prescriptions
CREATE TABLE IF NOT EXISTS pharmacy_prescriptions (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  patient_id INTEGER,
  doctor_id INTEGER,
  notes TEXT,
  expiry_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Prescription Medicines
CREATE TABLE IF NOT EXISTS pharmacy_prescription_medicines (
  id SERIAL PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES pharmacy_prescriptions(id),
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL,
  dosage VARCHAR(255),
  frequency VARCHAR(100),
  days INTEGER
);

-- Pharmacy Customers
CREATE TABLE IF NOT EXISTS pharmacy_customers (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  loyalty_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Batches
CREATE TABLE IF NOT EXISTS pharmacy_batches (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  batch_number VARCHAR(100) NOT NULL UNIQUE,
  quantity INTEGER NOT NULL,
  expiry_date DATE,
  cost_price DECIMAL(10,2),
  supplier VARCHAR(255),
  manufacturing_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Purchase Orders
CREATE TABLE IF NOT EXISTS pharmacy_purchase_orders (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  supplier VARCHAR(255),
  total_amount DECIMAL(12,2) NOT NULL,
  expected_delivery_date DATE,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Purchase Order Items
CREATE TABLE IF NOT EXISTS pharmacy_purchase_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pharmacy_purchase_orders(id),
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL
);

-- Pharmacy Stock Alerts
CREATE TABLE IF NOT EXISTS pharmacy_stock_alerts (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL,
  supplier VARCHAR(255),
  priority VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Invoices
CREATE TABLE IF NOT EXISTS pharmacy_invoices (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL,
  transaction_id INTEGER REFERENCES pharmacy_transactions(id),
  customer_id INTEGER,
  total_amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  payment_method VARCHAR(50),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'issued',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacy Invoice Items
CREATE TABLE IF NOT EXISTS pharmacy_invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES pharmacy_invoices(id),
  medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_pharmacy_id ON pharmacy_stock(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_medicine_id ON pharmacy_stock(medicine_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_transactions_pharmacy_id ON pharmacy_transactions(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_transactions_customer_id ON pharmacy_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_prescriptions_pharmacy_id ON pharmacy_prescriptions(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoices_pharmacy_id ON pharmacy_invoices(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoices_customer_id ON pharmacy_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_purchase_orders_pharmacy_id ON pharmacy_purchase_orders(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_alerts_pharmacy_id ON pharmacy_stock_alerts(pharmacy_id);
