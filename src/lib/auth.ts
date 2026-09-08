// Self-contained email+password auth. No third-party service.
//   - Passwords hashed with scrypt (Node built-in) + per-user random salt.
//   - Session is a signed JWT (jose) in an HTTP-only, SameSite=Lax cookie.
//   - Ingest tokens (per camera) are random and stored only as a SHA-256 hash.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE = 'lf_session'
const SESSION_DAYS = 30

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET is not set (need a random string, >= 16 chars)')
  }
  return new TextEncoder().encode(s)
}

// ── password hashing (scrypt) ───────────────────────────────────────────────

/** Hash a password → "scrypt$<saltHex>$<hashHex>". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** Verify a password against a stored "scrypt$salt$hash" (constant-time). */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// ── per-camera ingest tokens ────────────────────────────────────────────────

/** A fresh opaque ingest token the operator pastes into the Edge Agent. */
export function newIngestToken(): string {
  return 'ing_' + randomBytes(24).toString('base64url')
}

/** Store only the hash of an ingest token; compare hashes on upload. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
export function verifyToken(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A short random stream key used in the public ingest/playback URL path. */
export function newIngestKey(): string {
  return randomBytes(12).toString('base64url')
}

// ── sessions (JWT cookie) ───────────────────────────────────────────────────

export interface Session {
  userId: string
  email: string
}

export async function createSession(s: Session): Promise<string> {
  return new SignJWT({ email: s.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret())
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies()
  const tok = jar.get(COOKIE)?.value
  if (!tok) return null
  try {
    const { payload } = await jwtVerify(tok, secret())
    if (!payload.sub) return null
    return { userId: payload.sub, email: String(payload.email || '') }
  } catch {
    return null
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
