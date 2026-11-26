// /api/admin/attribute-values
// POST   -> add a value      { attributeId, value }
// DELETE -> remove a value   { id }
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.attributeId || !body.value || !body.value.trim()) {
      return json({ error: "attributeId and value required" }, 400);
    }

    await env.DB.prepare(
      "INSERT INTO attribute_values (attribute_id, value) VALUES (?, ?)"
    ).bind(body.attributeId, body.value.trim()).run();

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

    await env.DB.prepare("DELETE FROM attribute_values WHERE id = ?").bind(body.id).run();

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
