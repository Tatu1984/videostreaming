import { NextResponse } from 'next/server'
import { findUserByEmail } from '@/lib/repo'
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/auth/login  { email, password } → sets session cookie.
export async function POST(request: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''

  const user = await findUserByEmail(email)
  // Same generic message whether the email is unknown or the password is wrong,
  // so we don't leak which emails have accounts.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: 'invalid email or password' }, { status: 401 })
  }

  const token = await createSession({ userId: user.id, email: user.email })
  await setSessionCookie(token)
  return NextResponse.json({ user: { id: user.id, email: user.email } })
}
