import { verifySession } from "../_lib/auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;

  if (!env.SESSION_SECRET) {
    return new Response("SESSION_SECRET not configured on server", { status: 500 });
  }

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/admin_session=([^;]+)/);

  const session = match ? await verifySession(env.SESSION_SECRET, match[1]) : null;

  if (!session) {
    return Response.redirect(new URL("/admin-login/", request.url), 302);
  }

  return next();
}
