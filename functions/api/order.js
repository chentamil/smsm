// POST /api/order -> save an order (replaces api.php action "saveOrder")
export async function onRequestPost(context) {
  const { request, env } = context;
  const tenantId = "default"; // phase 6 will read this from Host header

  try {
    const body = await request.json();
    const { customer, items } = body;

    if (!customer || !customer.name || !customer.email || !items || !Array.isArray(items) || items.length === 0) {
      return json({ error: "Missing customer details or items" }, 400);
    }

    const amount = items.reduce((sum, i) => sum + (Number(i.price) * Number(i.qty)), 0);
    const orderId = String(Date.now());
    const date = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO orders (order_id, tenant_id, customer_json, items_json, amount, status, date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(orderId, tenantId, JSON.stringify(customer), JSON.stringify(items), amount, "UNPAID", date).run();

    // Send confirmation email - best effort, order still succeeds if email fails
    if (env.RESEND_API_KEY) {
      try {
        await sendOrderEmail(env.RESEND_API_KEY, customer, orderId, items, amount);
      } catch (emailErr) {
        console.error("Email send failed:", emailErr.message);
      }
    }

    return json({ success: true, order_id: orderId, amount });

  } catch (err) {
    return json({ error: "Server error", detail: err.message }, 500);
  }
}

async function sendOrderEmail(apiKey, customer, orderId, items, amount) {
  const itemsHtml = items.map(i =>
    `<li>${i.name} (${i.size}) x ${i.qty} - ₹${i.price * i.qty}</li>`
  ).join("");

  const html = `
    <h2>Order Confirmed</h2>
    <p>Hi ${customer.name}, your order <b>#${orderId}</b> has been placed.</p>
    <ul>${itemsHtml}</ul>
    <p><b>Total: ₹${amount}</b></p>
    <p>Track your order anytime at /track/ using this order ID.</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Orders <info@achabazar.com>",
      to: [customer.email],
      subject: `Order Confirmation #${orderId}`,
      html
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error: ${res.status} ${errText}`);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
