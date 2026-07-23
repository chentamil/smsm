export async function onRequest(context) {
  const { request, env, next } = context;

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/admin_session=([a-f0-9]+)/);

  if (!env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "ADMIN_PASSWORD not configured on server" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const expected = await hash(env.ADMIN_PASSWORD);

  if (!match || match[1] !== expected) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  return next();
}

async function hash(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
