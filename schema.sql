CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  photo TEXT,
  sizes_json TEXT NOT NULL
);

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNPAID',
  date TEXT NOT NULL
);

CREATE TABLE sellers (
  tenant_id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT,
  address TEXT,
  gstin TEXT,
  mobile TEXT,
  email TEXT
);
