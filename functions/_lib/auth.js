// Shared auth helpers - signed, expiring session tokens (HMAC-SHA256)
// Not deployed as a route since the folder starts with "_"

export async function signSession(secret, data, ttlMs = 24 * 60 * 60 * 1000) {
  const payload = JSON.stringify({ ...data, exp: Date.now() + ttlMs });
  const sig = await hmac(secret, payload);
  return btoa(payload) + "." + sig;
}

export async function verifySession(secret, token) {
  if (!token || !token.includes(".")) return null;

  const [payloadB64, sig] = token.split(".");
  let payload;
  try {
    payload = atob(payloadB64);
  } catch {
    return null;
  }

  const expected = await hmac(secret, payload);
  if (sig !== expected) return null;

  const data = JSON.parse(payload);
  if (Date.now() > data.exp) return null;

  return data;
}

async function hmac(secret, str) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Basic in-memory rate limit - resets when the Worker isolate recycles,
// so it's a best-effort speed bump, not a hard guarantee. Fine for a solo
// admin panel; revisit with Durable Objects/KV if this becomes a real target.
const attempts = new Map();

export function isRateLimited(ip, maxAttempts = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const timestamps = (attempts.get(ip) || []).filter(t => now - t < windowMs);
  timestamps.push(now);
  attempts.set(ip, timestamps);
  return timestamps.length > maxAttempts;
}
