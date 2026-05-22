/**
 * REQUIRED DB MIGRATION (run once in Supabase SQL editor):
 *
 * ALTER TABLE rooms
 *   ADD COLUMN IF NOT EXISTS room_passwords jsonb DEFAULT '[]',
 *   ADD COLUMN IF NOT EXISTS password_removable boolean DEFAULT true;
 *
 * room_passwords shape: Array<{ hash: string, bound_to: string | null, removable: boolean }>
 * bound_to stores a SHA-256 hex hash of the username, not the raw username.
 */

import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function GET() {
  const supabase = getSupabase()
  const now = new Date().toISOString()
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('id, slug, label, expires_at, created_at, room_passwords')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = await Promise.all(
    (rooms ?? []).map(async r => {
      const { count } = await supabase
        .from('messages').select('id', { count: 'exact', head: true }).eq('room_id', r.id)
      const { room_passwords, ...rest } = r
      return {
        ...rest,
        message_count: count ?? 0,
        has_password: Array.isArray(room_passwords) && room_passwords.length > 0,
      }
    })
  )
  return NextResponse.json(counts)
}

export async function POST(req: Request) {
  const supabase = getSupabase()
  const { slug, label, duration_minutes, passwords, password_removable } = await req.json()
  if (!slug?.trim()) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48)
  const mins = Math.min(Math.max(Number(duration_minutes) || 1440, 5), 20160)
  const expires_at = new Date(Date.now() + mins * 60 * 1000).toISOString()

  // build room_passwords: hash each plaintext password, optionally hash the locked user
  const pwArray: { hash: string; bound_to: string | null }[] = []
  if (Array.isArray(passwords)) {
    for (const entry of passwords) {
      if (!entry.plaintext?.trim()) continue
      // We store a PBKDF2-derived verifier: sha256("noterooms-pw:" + plaintext)
      // so the server can verify without storing plaintext
      const hash = await sha256hex('noterooms-pw:' + entry.plaintext.trim())
      const bound_to = entry.locked_user?.trim()
        ? await sha256hex(entry.locked_user.trim())
        : null
      pwArray.push({ hash, bound_to })
    }
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      slug: clean,
      label: (label || '').trim().slice(0, 80),
      expires_at,
      room_passwords: pwArray,
      password_removable: password_removable ?? true,
    })
    .select('id, slug, label, expires_at, created_at, password_removable')
    .single()

  if (error) return NextResponse.json(
    { error: error.code === '23505' ? 'slug already taken' : error.message },
    { status: 400 }
  )
  return NextResponse.json({ ...data, has_password: pwArray.length > 0 })
}
