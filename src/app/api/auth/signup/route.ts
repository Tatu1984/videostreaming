import { NextResponse } from 'next/server'
import { createUser, findUserByEmail } from '@/lib/repo'
import { createSession, setSessionCookie } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/auth/signup  { email, password } → creates account + logs in.
export async function POST(request: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'valid email required' }, { status: 400 })
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 })
  }

  // DB + session work is wrapped so a misconfig (missing AUTH_SECRET / DATABASE_URL,
  // or a Neon connection error) returns a clear message + logs the cause, instead
  // of a bare 500 with an empty body.
  try {
    if (await findUserByEmail(email)) {
      return NextResponse.json({ error: 'an account with this email already exists' }, { status: 409 })
    }
    const user = await createUser(email, password)
    const token = await createSession({ userId: user.id, email: user.email })
    await setSessionCookie(token)
    return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error('[signup] failed:', msg, err)
    return NextResponse.json({ error: `signup failed: ${msg}` }, { status: 500 })
  }
}
