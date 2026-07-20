export async function onRequestGet(context) {
  return new Response(
    JSON.stringify({ ok: true, msg: "Functions are alive" }),
    { headers: { "Content-Type": "application/json" } }
  );
}
