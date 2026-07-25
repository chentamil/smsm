// GET /api/products  -> list all products (replaces api.php action "getProducts")
export async function onRequestGet(context) {
  const { env } = context;
  const tenantId = "default";

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, photo, photos_json, sizes_json, gst_percent FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const { results: links } = await env.DB.prepare(
      `SELECT pc.product_id, c.name AS category_name
       FROM product_categories pc
       JOIN categories c ON c.id = pc.category_id`
    ).all();

    const catsByProduct = {};
    links.forEach(l => {
      if (!catsByProduct[l.product_id]) catsByProduct[l.product_id] = [];
      catsByProduct[l.product_id].push(l.category_name);
    });

    const products = results.map(p => ({
      id: p.id,
      name: p.name,
      photos: parsePhotos(p.photo, p.photos_json),
      sizes: JSON.parse(p.sizes_json),
      gstPercent: p.gst_percent || 0,
      categories: catsByProduct[p.id] || []
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

function parsePhotos(photo, photosJson) {
  if (photosJson) {
    try {
      const arr = JSON.parse(photosJson);
      if (Array.isArray(arr) && arr.length > 0) return arr.filter(Boolean);
    } catch {}
  }
  return photo ? [photo] : [];
}
