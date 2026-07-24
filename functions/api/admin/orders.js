// /api/admin/orders
// GET   -> list all orders
// PATCH -> update order status  { order_id, status }
const tenantId = "default"; // phase 6 will read this from Host header

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT order_id, customer_json, items_json, amount, status, date FROM orders WHERE tenant_id = ? ORDER BY date DESC"
    ).bind(tenantId).all();

    const orders = results.map(o => ({
      order_id: o.order_id,
      customer: JSON.parse(o.customer_json),
      items: JSON.parse(o.items_json),
      amount: o.amount,
      status: o.status,
      date: o.date
    }));

    return json(orders);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body.order_id || !body.status) return json({ error: "order_id and status required" }, 400);

    await env.DB.prepare(
      "UPDATE orders SET status = ? WHERE order_id = ? AND tenant_id = ?"
    ).bind(body.status, body.order_id, tenantId).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids : (body.order_id ? [body.order_id] : []);

    if (ids.length === 0) return json({ error: "order_id or ids required" }, 400);

    const statements = ids.map(id =>
      env.DB.prepare("DELETE FROM orders WHERE order_id = ? AND tenant_id = ?").bind(id, tenantId)
    );
    await env.DB.batch(statements);

    return json({ success: true, deleted: ids.length });
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
