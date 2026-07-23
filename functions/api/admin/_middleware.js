import { verifySession } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;

  if (!env.SESSION_SECRET) {
    return json({ error: "SESSION_SECRET not configured on server" }, 500);
  }

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/admin_session=([^;]+)/);

  const session = match ? await verifySession(env.SESSION_SECRET, match[1]) : null;

  if (!session) {
    return json({ error: "Not authenticated" }, 401);
  }

  return next();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
