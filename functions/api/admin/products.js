// /api/admin/products
// GET    -> list products with variants: [{id, values:{Color:"Red",Size:"M"}, price, stock}]
// POST   -> create { name, photos, categoryIds, gstPercent, variants: [{values, price, stock}] }
// PUT    -> update { id, name, photos, categoryIds, gstPercent, variants }
// DELETE -> delete product(s)  { id } or { ids: [...] }
const tenantId = "default";

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, photo, photos_json, gst_percent FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const { results: links } = await env.DB.prepare(
      `SELECT pc.product_id, pc.category_id, c.name AS category_name
       FROM product_categories pc JOIN categories c ON c.id = pc.category_id`
    ).all();
    const catsByProduct = {};
    links.forEach(l => {
      if (!catsByProduct[l.product_id]) catsByProduct[l.product_id] = [];
      catsByProduct[l.product_id].push({ id: l.category_id, name: l.category_name });
    });

    const { results: variantRows } = await env.DB.prepare(
      "SELECT id, product_id, values_json, price, stock FROM product_variants"
    ).all();
    const variantsByProduct = {};
    variantRows.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push({
        id: v.id,
        values: JSON.parse(v.values_json),
        price: v.price,
        stock: v.stock
      });
    });

    const products = results.map(p => ({
      id: p.id,
      name: p.name,
      photos: parsePhotos(p.photo, p.photos_json),
      gstPercent: p.gst_percent || 0,
      categories: catsByProduct[p.id] || [],
      variants: variantsByProduct[p.id] || []
    }));

    return json(products);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.name) return json({ error: "name required" }, 400);

    const photos = (body.photos || []).filter(Boolean);
    const primaryPhoto = photos[0] || "";
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
    const variants = normalizeVariants(body.variants);

    if (variants.length === 0) return json({ error: "At least one variant (price/stock) is required" }, 400);

    const result = await env.DB.prepare(
      "INSERT INTO products (tenant_id, name, photo, photos_json, sizes_json, gst_percent) VALUES (?, ?, ?, ?, '{}', ?)"
    ).bind(tenantId, body.name, primaryPhoto, JSON.stringify(photos), body.gstPercent || 0).run();

    const productId = result.meta.last_row_id;

    const statements = [];
    categoryIds.forEach(catId => {
      statements.push(env.DB.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(productId, catId));
    });
    variants.forEach(v => {
      statements.push(env.DB.prepare(
        "INSERT INTO product_variants (product_id, values_json, price, stock) VALUES (?, ?, ?, ?)"
      ).bind(productId, JSON.stringify(v.values), v.price, v.stock));
    });
    if (statements.length > 0) await env.DB.batch(statements);

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.id) return json({ error: "id required" }, 400);

    const photos = (body.photos || []).filter(Boolean);
    const primaryPhoto = photos[0] || "";
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
    const incomingVariants = normalizeVariants(body.variants);

    if (incomingVariants.length === 0) return json({ error: "At least one variant (price/stock) is required" }, 400);

    await env.DB.prepare(
      "UPDATE products SET name = ?, photo = ?, photos_json = ?, gst_percent = ? WHERE id = ? AND tenant_id = ?"
    ).bind(body.name, primaryPhoto, JSON.stringify(photos), body.gstPercent || 0, body.id, tenantId).run();

    // Categories: simple replace
    await env.DB.prepare("DELETE FROM product_categories WHERE product_id = ?").bind(body.id).run();
    const catStatements = categoryIds.map(catId =>
      env.DB.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(body.id, catId)
    );
    if (catStatements.length > 0) await env.DB.batch(catStatements);

    // Variants: diff by combination key, so unchanged combos keep their id
    // (important - order stock adjustments reference variant ids).
    const { results: existingRows } = await env.DB.prepare(
      "SELECT id, values_json FROM product_variants WHERE product_id = ?"
    ).bind(body.id).all();

    const existingByKey = {};
    existingRows.forEach(r => { existingByKey[r.values_json] = r.id; });

    const incomingKeys = new Set();
    const variantStatements = [];

    incomingVariants.forEach(v => {
      const key = JSON.stringify(v.values);
      incomingKeys.add(key);
      if (existingByKey[key] !== undefined) {
        variantStatements.push(
          env.DB.prepare("UPDATE product_variants SET price = ?, stock = ? WHERE id = ?")
            .bind(v.price, v.stock, existingByKey[key])
        );
      } else {
        variantStatements.push(
          env.DB.prepare("INSERT INTO product_variants (product_id, values_json, price, stock) VALUES (?, ?, ?, ?)")
            .bind(body.id, key, v.price, v.stock)
        );
      }
    });

    existingRows.forEach(r => {
      if (!incomingKeys.has(r.values_json)) {
        variantStatements.push(env.DB.prepare("DELETE FROM product_variants WHERE id = ?").bind(r.id));
      }
    });

    if (variantStatements.length > 0) await env.DB.batch(variantStatements);

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
    if (ids.length === 0) return json({ error: "id or ids required" }, 400);

    const statements = [];
    ids.forEach(id => {
      statements.push(env.DB.prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?").bind(id, tenantId));
      statements.push(env.DB.prepare("DELETE FROM product_categories WHERE product_id = ?").bind(id));
      statements.push(env.DB.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(id));
    });
    await env.DB.batch(statements);

    return json({ success: true, deleted: ids.length });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// Normalizes each variant's `values` object to have alphabetically sorted
// keys, so combination-matching (comparing JSON strings) is reliable
// regardless of the order attributes were selected in the UI.
function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map(v => {
    const sortedValues = {};
    Object.keys(v.values || {}).sort().forEach(k => { sortedValues[k] = v.values[k]; });
    return { values: sortedValues, price: Number(v.price) || 0, stock: Number(v.stock) || 0 };
  });
}

function parsePhotos(photo, photosJson) {
  if (photosJson) {
    try {
      const arr = JSON.parse(photosJson);
      if (Array.isArray(arr) && arr.length > 0) return arr.filter(Boolean);
    } catch {}
  }
  return photo ? [photo] : [];
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
