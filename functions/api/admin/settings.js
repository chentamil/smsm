// /api/admin/settings
// GET -> current seller/store info
// PUT -> upsert seller/store info  { name, address, gstin, mobile, email }
const tenantId = "default"; // phase 6 will read this from Host header

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare(
      "SELECT name, address, gstin, mobile, email FROM sellers WHERE tenant_id = ?"
    ).bind(tenantId).first();

    return json(row || {});
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const body = await request.json();

    await env.DB.prepare(
      `INSERT INTO sellers (tenant_id, name, address, gstin, mobile, email)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         name = excluded.name,
         address = excluded.address,
         gstin = excluded.gstin,
         mobile = excluded.mobile,
         email = excluded.email`
    ).bind(tenantId, body.name || "", body.address || "", body.gstin || "", body.mobile || "", body.email || "").run();

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
