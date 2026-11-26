// /api/admin/orders
// GET    -> list all orders
// PATCH  -> update order status  { order_id, status } - deducts/restores stock
//           when inventory tracking is enabled (deduct on first move into
//           CONFIRMED/SHIPPED/DELIVERED, restore on CANCELLED)
// DELETE -> delete order(s)  { order_id } or { ids: [...] }
const tenantId = "default";
const DEDUCTED_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT order_id, customer_json, items_json, amount, subtotal, gst_amount, status, date FROM orders WHERE tenant_id = ? ORDER BY date DESC"
    ).bind(tenantId).all();

    const orders = results.map(o => ({
      order_id: o.order_id,
      customer: JSON.parse(o.customer_json),
      items: JSON.parse(o.items_json),
      amount: o.amount,
      subtotal: o.subtotal,
      gstAmount: o.gst_amount,
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

    const order = await env.DB.prepare(
      "SELECT status, items_json, stock_deducted FROM orders WHERE order_id = ? AND tenant_id = ?"
    ).bind(body.order_id, tenantId).first();

    if (!order) return json({ error: "Order not found" }, 404);

    const sellerRow = await env.DB.prepare(
      "SELECT inventory_enabled FROM sellers WHERE tenant_id = ?"
    ).bind(tenantId).first();
    const inventoryEnabled = !!(sellerRow && sellerRow.inventory_enabled);

    const wasDeducted = !!order.stock_deducted;
    const willBeDeducted = DEDUCTED_STATUSES.includes(body.status);

    const statements = [];

    if (inventoryEnabled) {
      const items = JSON.parse(order.items_json);

      if (!wasDeducted && willBeDeducted) {
        // Moving into a "stock committed" status for the first time - deduct.
        items.forEach(i => {
          if (i.variantId) {
            statements.push(
              env.DB.prepare("UPDATE product_variants SET stock = stock - ? WHERE id = ?")
                .bind(i.qty, i.variantId)
            );
          }
        });
        statements.push(
          env.DB.prepare("UPDATE orders SET status = ?, stock_deducted = 1 WHERE order_id = ? AND tenant_id = ?")
            .bind(body.status, body.order_id, tenantId)
        );
      } else if (wasDeducted && !willBeDeducted) {
        // Leaving a "stock committed" status (e.g. cancelled after confirming) - restore.
        items.forEach(i => {
          if (i.variantId) {
            statements.push(
              env.DB.prepare("UPDATE product_variants SET stock = stock + ? WHERE id = ?")
                .bind(i.qty, i.variantId)
            );
          }
        });
        statements.push(
          env.DB.prepare("UPDATE orders SET status = ?, stock_deducted = 0 WHERE order_id = ? AND tenant_id = ?")
            .bind(body.status, body.order_id, tenantId)
        );
      } else {
        // No stock transition needed (e.g. Confirmed -> Shipped, both already deducted)
        statements.push(
          env.DB.prepare("UPDATE orders SET status = ? WHERE order_id = ? AND tenant_id = ?")
            .bind(body.status, body.order_id, tenantId)
        );
      }
    } else {
      statements.push(
        env.DB.prepare("UPDATE orders SET status = ? WHERE order_id = ? AND tenant_id = ?")
          .bind(body.status, body.order_id, tenantId)
      );
    }

    await env.DB.batch(statements);

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
