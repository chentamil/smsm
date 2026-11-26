// /api/admin/attributes
// GET    -> list attributes with their values: [{id, name, values:[{id,value}]}]
// POST   -> create attribute { name }
// PUT    -> rename attribute { id, name }
// DELETE -> delete attribute(s) { id } or { ids: [...] } - cascades values
const tenantId = "default";

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results: attrs } = await env.DB.prepare(
      "SELECT id, name FROM attributes WHERE tenant_id = ? ORDER BY name"
    ).bind(tenantId).all();

    const { results: values } = await env.DB.prepare(
      "SELECT id, attribute_id, value FROM attribute_values ORDER BY value"
    ).all();

    const valuesByAttr = {};
    values.forEach(v => {
      if (!valuesByAttr[v.attribute_id]) valuesByAttr[v.attribute_id] = [];
      valuesByAttr[v.attribute_id].push({ id: v.id, value: v.value });
    });

    const result = attrs.map(a => ({ id: a.id, name: a.name, values: valuesByAttr[a.id] || [] }));
    return json(result);
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
      "INSERT INTO attributes (tenant_id, name) VALUES (?, ?)"
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
      "UPDATE attributes SET name = ? WHERE id = ? AND tenant_id = ?"
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
      statements.push(env.DB.prepare("DELETE FROM attributes WHERE id = ? AND tenant_id = ?").bind(id, tenantId));
      statements.push(env.DB.prepare("DELETE FROM attribute_values WHERE attribute_id = ?").bind(id));
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
