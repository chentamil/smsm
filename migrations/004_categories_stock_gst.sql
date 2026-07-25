-- Managed categories (Magento-style) - a product can belong to many categories
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL
);

CREATE TABLE product_categories (
  product_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, category_id)
);

-- Stock + per-product GST (no SGST/CGST split - shown simply as "GST")
ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN gst_percent REAL DEFAULT 0;

-- Order-side tracking: subtotal/GST breakdown, and whether stock has already
-- been deducted for this order (so status changes don't double-deduct or
-- double-restore).
ALTER TABLE orders ADD COLUMN subtotal REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN gst_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN stock_deducted INTEGER DEFAULT 0;

-- Note: the old free-text products.category column from the previous
-- migration is left in place but unused from here on - safe to ignore.
