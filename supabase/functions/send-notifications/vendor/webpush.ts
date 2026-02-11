/**
 * Vendored Web Push implementation for Deno / Supabase Edge Functions.
 * Uses only crypto.subtle (Web Crypto API) — no npm dependencies.
 *
 * Implements:
 *  - VAPID (Voluntary Application Server Identification) via JWT (ES256)
 *  - RFC 8291 payload encryption (aes128gcm content encoding)
 *
 * VAPID keys must be raw URL-safe-base64 encoded P-256 keys:
 *  - Public key: 65-byte uncompressed point (starts 0x04)
 *  - Private key: 32-byte scalar
 */

// ─── helpers ────────────────────────────────────────────────────────

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatUint8(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function uint32BE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

// ─── VAPID JWT ──────────────────────────────────────────────────────

interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

let vapid: VapidDetails | null = null;

export function setVapidDetails(subject: string, publicKey: string, privateKey: string) {
  vapid = { subject, publicKey, privateKey };
}

async function createVapidJwt(audience: string): Promise<{ token: string; publicKeyBytes: Uint8Array }> {
  if (!vapid) throw new Error("VAPID details not set. Call setVapidDetails first.");

  const publicKeyBytes = base64UrlDecode(vapid.publicKey);
  const privateKeyBytes = base64UrlDecode(vapid.privateKey);

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: vapid.subject,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const input = `${headerB64}.${payloadB64}`;

  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      new TextEncoder().encode(input),
    ),
  );

  const token = `${input}.${base64UrlEncode(sig)}`;
  return { token, publicKeyBytes };
}

// ─── HKDF (RFC 8291) ───────────────────────────────────────────────

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  let t = new Uint8Array(0);
  const okm = new Uint8Array(length);
  let offset = 0;
  for (let i = 1; offset < length; i++) {
    const input = concatUint8(t, info, new Uint8Array([i]));
    t = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    okm.set(t.slice(0, Math.min(t.length, length - offset)), offset);
    offset += t.length;
  }
  return okm;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const extractKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", extractKey, ikm));
  return hkdfExpand(prk, info, length);
}

// ─── Encryption (RFC 8291 / aes128gcm) ─────────────────────────────

async function encryptPayload(
  clientPublicKeyBytes: Uint8Array,
  clientAuthSecret: Uint8Array,
  payload: Uint8Array,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKeyBytes: Uint8Array }> {
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const serverPublicJwk = await crypto.subtle.exportKey("jwk", serverKeys.publicKey);

  const serverX = base64UrlDecode(serverPublicJwk.x!);
  const serverY = base64UrlDecode(serverPublicJwk.y!);
  const serverPublicKeyBytes = concatUint8(new Uint8Array([0x04]), serverX, serverY);

  const clientX = base64UrlEncode(clientPublicKeyBytes.slice(1, 33));
  const clientY = base64UrlEncode(clientPublicKeyBytes.slice(33, 65));

  const clientPublicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: clientX, y: clientY },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeys.privateKey,
      256,
    ),
  );

  const encoder = new TextEncoder();

  const authInfo = concatUint8(
    encoder.encode("WebPush: info\0"),
    clientPublicKeyBytes,
    serverPublicKeyBytes,
  );
  const ikm = await hkdf(clientAuthSecret, sharedSecret, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  const paddedPayload = concatUint8(payload, new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPayload,
    ),
  );

  const rs = uint32BE(4096);
  const idlen = new Uint8Array([serverPublicKeyBytes.length]);
  const aes128gcmHeader = concatUint8(salt, rs, idlen, serverPublicKeyBytes);

  const body = concatUint8(aes128gcmHeader, encrypted);

  return { ciphertext: body, salt, serverPublicKeyBytes };
}

// ─── Send Notification ──────────────────────────────────────────────

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function sendNotification(subscription: PushSubscription, payloadStr: string): Promise<Response> {
  if (!vapid) throw new Error("VAPID details not set. Call setVapidDetails first.");

  const endpoint = subscription.endpoint;
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const { token, publicKeyBytes } = await createVapidJwt(audience);
  const vapidPublicB64 = base64UrlEncode(publicKeyBytes);

  const clientPublicKeyBytes = base64UrlDecode(subscription.keys.p256dh);
  const clientAuthSecret = base64UrlDecode(subscription.keys.auth);
  const payloadBytes = new TextEncoder().encode(payloadStr);

  const { ciphertext } = await encryptPayload(clientPublicKeyBytes, clientAuthSecret, payloadBytes);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${token}, k=${vapidPublicB64}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Urgency": "high",
    },
    body: ciphertext,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err: any = new Error(`Push service ${response.status}: ${body}`);
    err.statusCode = response.status;
    throw err;
  }

  return response;
}

export default { setVapidDetails, sendNotification };
