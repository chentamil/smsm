// /api/admin/settings
// GET -> current seller/store info + feature flags
// PUT -> upsert seller/store info  { name, address, gstin, mobile, email, gstEnabled, gstPercent, inventoryEnabled }
const tenantId = "default"; // phase 6 will read this from Host region

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare(
      "SELECT name, address, gstin, mobile, email, gst_enabled, gst_percent, inventory_enabled FROM sellers WHERE tenant_id = ?"
    ).bind(tenantId).first();

    if (!row) return json({});

    return json({
      name: row.name,
      address: row.address,
      gstin: row.gstin,
      mobile: row.mobile,
      email: row.email,
      gstEnabled: !!row.gst_enabled,
      gstPercent: row.gst_percent || 0,
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
      `INSERT INTO sellers (tenant_id, name, address, gstin, mobile, email, gst_enabled, gst_percent, inventory_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         name = excluded.name,
         address = excluded.address,
         gstin = excluded.gstin,
         mobile = excluded.mobile,
         email = excluded.email,
         gst_enabled = excluded.gst_enabled,
         gst_percent = excluded.gst_percent,
         inventory_enabled = excluded.inventory_enabled`
    ).bind(
      tenantId,
      body.name || "",
      body.address || "",
      body.gstin || "",
      body.mobile || "",
      body.email || "",
      body.gstEnabled ? 1 : 0,
      body.gstPercent || 0,
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
