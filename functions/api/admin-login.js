export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();

  if (!env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD not configured on server" }, 500);
  }

  if (body.password !== env.ADMIN_PASSWORD) {
    return json({ error: "Wrong password" }, 401);
  }

  const token = await hash(env.ADMIN_PASSWORD);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
    }
  });
}

async function hash(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
