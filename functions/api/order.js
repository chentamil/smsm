import { isRateLimited } from "../_lib/auth.js";

// POST /api/order -> save an order (replaces api.php action "saveOrder")
export async function onRequestPost(context) {
  const { request, env } = context;
  const tenantId = "default"; // phase 6 will read this from Host header

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (isRateLimited(ip, 10, 10 * 60 * 1000)) {
    return json({ error: "Too many order attempts. Please wait a few minutes and try again." }, 429);
  }

  try {
    const body = await request.json();
    const { customer, items, turnstileToken } = body;

    // --- Turnstile verification ---
    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ error: "TURNSTILE_SECRET_KEY not configured on server" }, 500);
    }
    if (!turnstileToken) {
      return json({ error: "Captcha verification missing" }, 400);
    }

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken, remoteip: ip })
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return json({ error: "Captcha verification failed" }, 400);
    }

    // --- Input validation ---
    const errors = validateOrder(customer, items);
    if (errors.length > 0) {
      return json({ error: errors.join("; ") }, 400);
    }

    const amount = items.reduce((sum, i) => sum + (Number(i.price) * Number(i.qty)), 0);
    const orderId = String(Date.now());
    const date = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO orders (order_id, tenant_id, customer_json, items_json, amount, status, date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(orderId, tenantId, JSON.stringify(customer), JSON.stringify(items), amount, "UNPAID", date).run();

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

function validateOrder(customer, items) {
  const errors = [];

  if (!customer || typeof customer !== "object") {
    errors.push("Customer details missing");
    return errors;
  }

  const name = (customer.name || "").trim();
  const email = (customer.email || "").trim();
  const address = (customer.address || "").trim();
  const city = (customer.city || "").trim();
  const state = (customer.state || "").trim();

  if (name.length < 2 || name.length > 100) errors.push("Name must be 2-100 characters");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email address");
  if (address.length < 5 || address.length > 300) errors.push("Address must be 5-300 characters");
  if (city.length < 2 || city.length > 100) errors.push("City must be 2-100 characters");
  if (state.length < 2 || state.length > 100) errors.push("State must be 2-100 characters");

  if (!Array.isArray(items) || items.length === 0) {
    errors.push("Cart is empty");
  } else if (items.length > 50) {
    errors.push("Too many items in one order");
  } else {
    for (const i of items) {
      if (!i.name || typeof i.price !== "number" || i.price <= 0 || typeof i.qty !== "number" || i.qty <= 0 || i.qty > 100) {
        errors.push("Invalid item data");
        break;
      }
    }
  }

  return errors;
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
      from: "Orders <onboarding@resend.dev>",
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
