// /api/admin/settings
// GET -> current seller/store info + feature flags
// PUT -> upsert seller/store info  { name, address, gstin, mobile, email, gstEnabled, inventoryEnabled }
// Note: GST rate is now set per-product (see products), not globally here -
// gstEnabled is just the master on/off switch for whether GST applies at all.
const tenantId = "default";

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare(
      "SELECT name, address, gstin, mobile, email, gst_enabled, inventory_enabled FROM sellers WHERE tenant_id = ?"
    ).bind(tenantId).first();

    if (!row) return json({});

    return json({
      name: row.name,
      address: row.address,
      gstin: row.gstin,
      mobile: row.mobile,
      email: row.email,
      gstEnabled: !!row.gst_enabled,
      inventoryEnabled: !!row.inventory_enabled
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const body = await request.json();

    await env.DB.prepare(
      `INSERT INTO sellers (tenant_id, name, address, gstin, mobile, email, gst_enabled, inventory_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         name = excluded.name,
         address = excluded.address,
         gstin = excluded.gstin,
         mobile = excluded.mobile,
         email = excluded.email,
         gst_enabled = excluded.gst_enabled,
         inventory_enabled = excluded.inventory_enabled`
    ).bind(
      tenantId,
      body.name || "",
      body.address || "",
      body.gstin || "",
      body.mobile || "",
      body.email || "",
      body.gstEnabled ? 1 : 0,
      body.inventoryEnabled ? 1 : 0
    ).run();

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
