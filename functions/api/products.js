// GET /api/products  -> list all products with their variants (replaces api.php action "getProducts")
export async function onRequestGet(context) {
  const { env } = context;
  const tenantId = "default";

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, photo, photos_json, gst_percent FROM products WHERE tenant_id = ?"
    ).bind(tenantId).all();

    const { results: links } = await env.DB.prepare(
      `SELECT pc.product_id, c.name AS category_name
       FROM product_categories pc JOIN categories c ON c.id = pc.category_id`
    ).all();
    const catsByProduct = {};
    links.forEach(l => {
      if (!catsByProduct[l.product_id]) catsByProduct[l.product_id] = [];
      catsByProduct[l.product_id].push(l.category_name);
    });

    const { results: variantRows } = await env.DB.prepare(
      "SELECT id, product_id, values_json, price, stock FROM product_variants"
    ).all();
    const variantsByProduct = {};
    variantRows.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push({
        id: v.id,
        values: JSON.parse(v.values_json),
        price: v.price,
        stock: v.stock
      });
    });

    const products = results.map(p => {
      const variants = variantsByProduct[p.id] || [];

      // Derive which attributes this product actually uses and the distinct
      // values available for each, straight from its variants.
      const attributeMap = {};
      variants.forEach(v => {
        Object.entries(v.values).forEach(([attrName, val]) => {
          if (!attributeMap[attrName]) attributeMap[attrName] = new Set();
          attributeMap[attrName].add(val);
        });
      });
      const attributes = Object.entries(attributeMap).map(([name, valueSet]) => ({
        name,
        values: [...valueSet]
      }));

      return {
        id: p.id,
        name: p.name,
        photos: parsePhotos(p.photo, p.photos_json),
        gstPercent: p.gst_percent || 0,
        categories: catsByProduct[p.id] || [],
        attributes,
        variants
      };
    });

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
