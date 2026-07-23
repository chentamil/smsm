// GET /api/track?order_id=xxxx -> look up one order (replaces api.php action "trackOrder")
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id");

  if (!orderId) {
    return json({ error: "order_id required" }, 400);
  }

  try {
    const order = await env.DB.prepare(
      "SELECT order_id, customer_json, items_json, amount, status, date FROM orders WHERE order_id = ?"
    ).bind(orderId).first();

    if (!order) {
      return json(null);
    }

    return json({
      order_id: order.order_id,
      customer: JSON.parse(order.customer_json),
      items: JSON.parse(order.items_json),
      amount: order.amount,
      status: order.status,
      date: order.date
    });

  } catch (err) {
    return json({ error: "Server error", detail: err.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
