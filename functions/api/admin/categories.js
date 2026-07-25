// /api/admin/categories
// GET    -> list all categories
// POST   -> create a category   { name }
// PUT    -> rename a category   { id, name }
// DELETE -> delete category(s)  { id } or { ids: [...] } - also unlinks products
const tenantId = "default";

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name FROM categories WHERE tenant_id = ? ORDER BY name"
    ).bind(tenantId).all();
    return json(results);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.name || !body.name.trim()) return json({ error: "name required" }, 400);

    await env.DB.prepare(
      "INSERT INTO categories (tenant_id, name) VALUES (?, ?)"
    ).bind(tenantId, body.name.trim()).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.id || !body.name || !body.name.trim()) return json({ error: "id and name required" }, 400);

    await env.DB.prepare(
      "UPDATE categories SET name = ? WHERE id = ? AND tenant_id = ?"
    ).bind(body.name.trim(), body.id, tenantId).run();

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
      statements.push(env.DB.prepare("DELETE FROM categories WHERE id = ? AND tenant_id = ?").bind(id, tenantId));
      statements.push(env.DB.prepare("DELETE FROM product_categories WHERE category_id = ?").bind(id));
    });
    await env.DB.batch(statements);

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
