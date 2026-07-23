export async function onRequestPost() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "admin_session=deleted; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    }
  });
}
