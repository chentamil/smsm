// /api/admin/products
// GET    -> list all products
// POST   -> create a product   { name, photos: ["url1","url2","url3"], sizes: {S:100,M:120} }
// PUT    -> update a product   { id, name, photos, sizes }
// DELETE -> delete product(s)  { id } for one, or { ids: [1,2,3] } for bulk
const tenantId = "default"; // phase 6 will read this from Host header

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, photo, photos_json, sizes_json FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const products = results.map(p => ({
      id: p.id,
      name: p.name,
      photos: parsePhotos(p.photo, p.photos_json),
      sizes: JSON.parse(p.sizes_json)
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

    await env.DB.prepare(
      "INSERT INTO products (tenant_id, name, photo, photos_json, sizes_json) VALUES (?, ?, ?, ?, ?)"
    ).bind(tenantId, body.name, primaryPhoto, JSON.stringify(photos), JSON.stringify(body.sizes)).run();

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

    await env.DB.prepare(
      "UPDATE products SET name = ?, photo = ?, photos_json = ?, sizes_json = ? WHERE id = ? AND tenant_id = ?"
    ).bind(body.name, primaryPhoto, JSON.stringify(photos), JSON.stringify(body.sizes), body.id, tenantId).run();

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

    const statements = ids.map(id =>
      env.DB.prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?").bind(id, tenantId)
    );
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
    } catch {
      // fall through to legacy photo
    }
  }
  return photo ? [photo] : [];
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
