// POST /api/admin/send-invoice   { order_id }
const tenantId = "default";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY not configured on server" }, 500);
  }

  try {
    const body = await request.json();
    if (!body.order_id) return json({ error: "order_id required" }, 400);

    const order = await env.DB.prepare(
      "SELECT order_id, customer_json, items_json, amount, subtotal, gst_amount, status, date FROM orders WHERE order_id = ? AND tenant_id = ?"
    ).bind(body.order_id, tenantId).first();

    if (!order) return json({ error: "Order not found" }, 404);

    const customer = JSON.parse(order.customer_json);
    const items = JSON.parse(order.items_json);

    const itemsHtml = items.map(i =>
      `<li>${i.name}${i.size ? " (" + i.size + ")" : ""} x ${i.qty} - ₹${i.price * i.qty}</li>`
    ).join("");

    const gstLine = order.gst_amount > 0 ? `<p>GST: ₹${order.gst_amount}</p>` : "";

    const html = `
      <h2>Invoice - Order #${order.order_id}</h2>
      <p>Hi ${customer.name},</p>
      <p>Here is your invoice summary:</p>
      <ul>${itemsHtml}</ul>
      <p>Subtotal: ₹${order.subtotal}</p>
      ${gstLine}
      <p><b>Total: ₹${order.amount}</b></p>
      <p>Status: ${order.status}</p>
      <p>Order date: ${new Date(order.date).toLocaleString()}</p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Invoices <info@achabazar.com>",
        to: [customer.email],
        subject: `Invoice for Order #${order.order_id}`,
        html
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: "Resend API error: " + errText }, 502);
    }

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
