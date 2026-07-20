// GET /api/products  -> list all products (replaces api.php action "getProducts")
export async function onRequestGet(context) {
  const { env } = context;
  const tenantId = "default"; // hardcoded for now, phase 6 will read this from Host header

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, photo, sizes_json FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const products = results.map(p => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
      sizes: JSON.parse(p.sizes_json)
    }));

    return new Response(JSON.stringify(products), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Could not load products", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
