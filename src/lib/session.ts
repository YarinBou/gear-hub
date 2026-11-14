import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/generated/prisma/enums";

// Edge/Node-safe JWT helpers (used by both src/proxy.ts and server code).

export const SESSION_COOKIE = "gh_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h — one shift

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
};

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (min 32 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getKey());
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getKey(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}
