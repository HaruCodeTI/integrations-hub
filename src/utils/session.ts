import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_SECONDS = 8 * 3600;

export function generateSessionToken(password: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(String(timestamp)).toString("base64url");
  const mac = createHmac("sha256", password).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifySessionToken(
  token: string,
  password: string
): { valid: boolean; expired: boolean } {
  const invalid = { valid: false, expired: false };
  const expired = { valid: false, expired: true };

  const parts = token?.split(".");
  if (!parts || parts.length !== 2) return invalid;

  const [payload, mac] = parts;
  if (!payload || !mac) return invalid;

  const expectedMac = createHmac("sha256", password).update(payload).digest("hex");
  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");

  if (macBuf.length !== expectedBuf.length) return invalid;
  if (!timingSafeEqual(macBuf, expectedBuf)) return invalid;

  const timestamp = parseInt(Buffer.from(payload, "base64url").toString(), 10);
  if (isNaN(timestamp)) return invalid;

  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (ageSeconds > SESSION_TTL_SECONDS) return expired;

  return { valid: true, expired: false };
}
