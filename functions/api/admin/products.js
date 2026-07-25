// /api/admin/products
// GET    -> list all products, each with categoryIds: [1,2], categoryNames: ["Groceries",...]
// POST   -> create { name, photos, sizes, categoryIds: [1,2], stock, gstPercent }
// PUT    -> update { id, name, photos, sizes, categoryIds, stock, gstPercent }
// DELETE -> delete product(s)  { id } or { ids: [...] }
const tenantId = "default";

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, photo, photos_json, sizes_json, stock, gst_percent FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const { results: links } = await env.DB.prepare(
      `SELECT pc.product_id, pc.category_id, c.name AS category_name
       FROM product_categories pc
       JOIN categories c ON c.id = pc.category_id`
    ).all();

    const catsByProduct = {};
    links.forEach(l => {
      if (!catsByProduct[l.product_id]) catsByProduct[l.product_id] = [];
      catsByProduct[l.product_id].push({ id: l.category_id, name: l.category_name });
    });

    const products = results.map(p => ({
      id: p.id,
      name: p.name,
      photos: parsePhotos(p.photo, p.photos_json),
      sizes: JSON.parse(p.sizes_json),
      stock: p.stock || 0,
      gstPercent: p.gst_percent || 0,
      categories: catsByProduct[p.id] || []
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
    if (!body.name || !body.sizes) return json({ error: "name and sizes required" }, 400);

    const photos = (body.photos || []).filter(Boolean);
    const primaryPhoto = photos[0] || "";
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];

    const result = await env.DB.prepare(
      "INSERT INTO products (tenant_id, name, photo, photos_json, sizes_json, stock, gst_percent) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(tenantId, body.name, primaryPhoto, JSON.stringify(photos), JSON.stringify(body.sizes), body.stock || 0, body.gstPercent || 0).run();

    const productId = result.meta.last_row_id;
    if (categoryIds.length > 0) {
      const statements = categoryIds.map(catId =>
        env.DB.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(productId, catId)
      );
      await env.DB.batch(statements);
    }

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

    await env.DB.prepare(
      "UPDATE products SET name = ?, photo = ?, photos_json = ?, sizes_json = ?, stock = ?, gst_percent = ? WHERE id = ? AND tenant_id = ?"
    ).bind(body.name, primaryPhoto, JSON.stringify(photos), JSON.stringify(body.sizes), body.stock || 0, body.gstPercent || 0, body.id, tenantId).run();

    await env.DB.prepare("DELETE FROM product_categories WHERE product_id = ?").bind(body.id).run();
    if (categoryIds.length > 0) {
      const statements = categoryIds.map(catId =>
        env.DB.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(body.id, catId)
      );
      await env.DB.batch(statements);
    }

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
    });
    await env.DB.batch(statements);

    return json({ success: true, deleted: ids.length });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
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
