/**
 * Lightweight JWT implementation using Node.js crypto (no external deps).
 * Produces standard HS256 JWTs that survive server restarts / deploys.
 */

import crypto from "crypto";

// Secret: use env var in production, fallback for dev
const JWT_SECRET = process.env.JWT_SECRET || "elturco-dispatch-jwt-secret-2026";

const ALGORITHM = "HS256";

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

function sign(payload: string, header: string): string {
  const input = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(input)
    .digest();
  return base64url(signature);
}

export interface JwtPayload {
  pmUserId: number;
  email: string;
  exp: number; // Unix timestamp (seconds)
  iat: number; // Issued at
}

/**
 * Create a signed JWT token.
 */
export function createToken(pmUserId: number, email: string, expiresInHours: number = 72): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    pmUserId,
    email,
    iat: now,
    exp: now + expiresInHours * 3600,
  };

  const header = base64url(JSON.stringify({ alg: ALGORITHM, typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign(body, header);

  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode a JWT token.
 * Returns the payload if valid, null if invalid/expired.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;

    // Verify signature
    const expectedSig = sign(body, header);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    // Decode payload
    const payload: JwtPayload = JSON.parse(base64urlDecode(body));

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
