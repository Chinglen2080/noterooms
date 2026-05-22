/**
 * POST /api/rooms/[slug]/auth
 *   body: { password: string, username: string }
 *   → 200 { token: string } on success
 *   → 401 on wrong password
 *   → 403 if this password slot is locked to a different user
 *
 * DELETE /api/rooms/[slug]/auth
 *   header: x-auth-token: <token>
 *   → removes the password binding for this token's slot (if password_removable)
 */

import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function makeToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = getSupabase()
  const { password, username } = await req.json()
  if (!password?.trim() || !username?.trim())
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const { data: room, error } = await supabase
    .from('rooms')
    .select('id, expires_at, room_passwords, password_removable')
    .eq('slug', slug).single()
  if (error || !room) return NextResponse.json({ error: 'room not found' }, { status: 404 })
  if (new Date(room.expires_at) < new Date())
    return NextResponse.json({ error: 'room expired' }, { status: 410 })

  const pwHash = await sha256hex('noterooms-pw:' + password.trim())
  const userHash = await sha256hex(username.trim())
  const pwList: { hash: string; bound_to: string | null; token?: string }[] = room.room_passwords ?? []

  const idx = pwList.findIndex(p => p.hash === pwHash)
  if (idx === -1) return NextResponse.json({ error: 'wrong password' }, { status: 401 })

  const slot = pwList[idx]
  // enforce lock: if bound_to is set and doesn't match this user, deny
  if (slot.bound_to && slot.bound_to !== userHash)
    return NextResponse.json({ error: 'this password is locked to a different user' }, { status: 403 })

  // auto-bind on first use
  const newList = [...pwList]
  const token = makeToken()
  newList[idx] = {
    ...slot,
    bound_to: slot.bound_to ?? userHash,
    token,
  }

  await supabase.from('rooms').update({ room_passwords: newList }).eq('id', room.id)
  return NextResponse.json({ token })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const token = req.headers.get('x-auth-token')
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  const supabase = getSupabase()
  const { data: room } = await supabase
    .from('rooms').select('id, room_passwords, password_removable').eq('slug', slug).single()
  if (!room) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!room.password_removable)
    return NextResponse.json({ error: 'password removal not allowed for this room' }, { status: 403 })

  const pwList: { hash: string; bound_to: string | null; token?: string }[] = room.room_passwords ?? []
  const idx = pwList.findIndex(p => p.token === token)
  if (idx === -1) return NextResponse.json({ error: 'token not found' }, { status: 404 })

  const newList = [...pwList]
  newList[idx] = { ...newList[idx], bound_to: null, token: undefined }
  await supabase.from('rooms').update({ room_passwords: newList }).eq('id', room.id)
  return NextResponse.json({ ok: true })
}
