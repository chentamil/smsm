// /api/admin/products
// GET    -> list all products
// POST   -> create a product   { name, photo, sizes: {S:100,M:120} }
// PUT    -> update a product   { id, name, photo, sizes }
// DELETE -> delete a product   { id }
const tenantId = "default"; // phase 6 will read this from Host header

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT id, name, photo, sizes_json FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const products = results.map(p => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
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

    await env.DB.prepare(
      "INSERT INTO products (tenant_id, name, photo, sizes_json) VALUES (?, ?, ?, ?)"
    ).bind(tenantId, body.name, body.photo || "", JSON.stringify(body.sizes)).run();

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

    await env.DB.prepare(
      "UPDATE products SET name = ?, photo = ?, sizes_json = ? WHERE id = ? AND tenant_id = ?"
    ).bind(body.name, body.photo || "", JSON.stringify(body.sizes), body.id, tenantId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.id) return json({ error: "id required" }, 400);

    await env.DB.prepare(
      "DELETE FROM products WHERE id = ? AND tenant_id = ?"
    ).bind(body.id, tenantId).run();

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
