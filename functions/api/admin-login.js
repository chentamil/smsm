import { signSession, isRateLimited } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (isRateLimited(ip)) {
    return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  }

  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "ADMIN_PASSWORD or SESSION_SECRET not configured on server" }, 500);
  }

  const body = await request.json();
  if (body.password !== env.ADMIN_PASSWORD) {
    return json({ error: "Wrong password" }, 401);
  }

  const token = await signSession(env.SESSION_SECRET, { u: "admin" });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
    }
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
