-- Magento-style attribute system: an attribute (e.g. "Color") has values
-- (e.g. Red, Green). A product picks which attributes it uses (0, 1, or 2+)
-- and which values of each apply to it; every combination becomes a
-- "variant" with its own price and stock.
--
-- A product with zero attributes still gets exactly one variant (an empty
-- combination) - that's the "simple product, just a price" case.

CREATE TABLE attributes (
  id INTEGER PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL
);

CREATE TABLE attribute_values (
  id INTEGER PRIMARY KEY,
  attribute_id INTEGER NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  values_json TEXT NOT NULL DEFAULT '{}',  -- e.g. {"Color":"Red","Size":"M"} or {} for simple products
  price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0
);

-- Note: GST% stays at the product level (not per-variant) - tax rate doesn't
-- typically vary by color/size in practice. The old products.sizes_json and
-- products.stock columns are left in place but unused from here on.
