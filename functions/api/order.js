import { isRateLimited } from "../_lib/auth.js";

// POST /api/order -> save an order (replaces api.php action "saveOrder")
export async function onRequestPost(context) {
  const { request, env } = context;
  const tenantId = "default";

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

    // --- Authoritative price + GST lookup (never trust client-supplied price) ---
    const sellerRow = await env.DB.prepare(
      "SELECT gst_enabled FROM sellers WHERE tenant_id = ?"
    ).bind(tenantId).first();
    const gstEnabled = !!(sellerRow && sellerRow.gst_enabled);

    const resolvedItems = [];
    let subtotal = 0;
    let gstAmount = 0;

    for (const item of items) {
      let unitPrice = Number(item.price) || 0;
      let gstPercent = 0;
      let productId = null;

      if (item.variantId) {
        const variant = await env.DB.prepare(
          "SELECT product_id, price FROM product_variants WHERE id = ?"
        ).bind(item.variantId).first();

        if (variant) {
          unitPrice = variant.price;
          productId = variant.product_id;

          const product = await env.DB.prepare(
            "SELECT gst_percent FROM products WHERE id = ? AND tenant_id = ?"
          ).bind(productId, tenantId).first();
          if (product) gstPercent = product.gst_percent || 0;
        }
      }

      const lineSubtotal = unitPrice * item.qty;
      const lineGst = gstEnabled ? Math.round(lineSubtotal * gstPercent) / 100 : 0;

      subtotal += lineSubtotal;
      gstAmount += lineGst;

      resolvedItems.push({
        variantId: item.variantId || null,
        productId,
        name: item.name,
        size: item.valuesLabel || item.size || "",
        price: unitPrice,
        qty: item.qty,
        gstPercent,
        gstAmount: lineGst
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    gstAmount = Math.round(gstAmount * 100) / 100;
    const amount = Math.round((subtotal + gstAmount) * 100) / 100;

    const orderId = String(Date.now());
    const date = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO orders (order_id, tenant_id, customer_json, items_json, amount, subtotal, gst_amount, status, date, stock_deducted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).bind(orderId, tenantId, JSON.stringify(customer), JSON.stringify(resolvedItems), amount, subtotal, gstAmount, "UNPAID", date).run();

    if (env.RESEND_API_KEY) {
      try {
        await sendOrderEmail(env.RESEND_API_KEY, env.FROM_EMAIL, customer, orderId, resolvedItems, subtotal, gstAmount, amount);
      } catch (emailErr) {
        console.error("Email send failed:", emailErr.message);
      }
    }

    return json({ success: true, order_id: orderId, subtotal, gstAmount, amount });

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
  const phone = (customer.phone || "").trim();
  const address = (customer.address || "").trim();
  const city = (customer.city || "").trim();
  const state = (customer.state || "").trim();

  if (name.length < 2 || name.length > 100) errors.push("Name must be 2-100 characters");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email address");
  if (!/^\d{10,15}$/.test(phone.replace(/\D/g, ""))) errors.push("Invalid phone number");
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

async function sendOrderEmail(apiKey, fromEmail, customer, orderId, items, subtotal, gstAmount, amount) {
  const itemsHtml = items.map(i =>
    `<li>${i.name}${i.size ? " (" + i.size + ")" : ""} x ${i.qty} - ₹${i.price * i.qty}</li>`
  ).join("");

  const gstLine = gstAmount > 0 ? `<p>GST: ₹${gstAmount}</p>` : "";

  const html = `
    <h2>Order Confirmed</h2>
    <p>Hi ${customer.name}, your order <b>#${orderId}</b> has been placed.</p>
    <ul>${itemsHtml}</ul>
    <p>Subtotal: ₹${subtotal}</p>
    ${gstLine}
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
      from: fromEmail || "Orders <onboarding@resend.dev>",
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
