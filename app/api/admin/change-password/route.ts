import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPassword, verifyPassword } from '@/lib/crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

function getSupabase(): AnySupabase {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function checkAuth(req: Request) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { type, currentPassword, newPassword } = await req.json()
  if (!type || !newPassword)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (type !== 'main' && type !== 'duress')
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const supabase: AnySupabase = getSupabase()

  // For main password change, verify current password first
  if (type === 'main') {
    if (!currentPassword)
      return NextResponse.json({ error: 'Current password required' }, { status: 400 })
    const { data: rows } = await supabase.from('admin_passwords').select('*').eq('is_main', true).limit(1)
    if (!rows || rows.length === 0)
      return NextResponse.json({ error: 'No main password found' }, { status: 500 })
    const match = await verifyPassword(currentPassword, rows[0].password_hash)
    if (!match)
      return NextResponse.json({ error: 'Current password incorrect' }, { status: 401 })
  }

  // Check new password doesn't match the other one
  const otherType = type === 'main' ? 'duress' : 'main'
  const { data: otherRows } = await supabase
    .from('admin_passwords').select('password_hash')
    .eq(type === 'main' ? 'is_duress' : 'is_main', true).limit(1)
  if (otherRows && otherRows.length > 0) {
    const clash = await verifyPassword(newPassword, otherRows[0].password_hash)
    if (clash)
      return NextResponse.json({ error: `New password cannot match the ${otherType} password` }, { status: 400 })
  }

  const newHash = await hashPassword(newPassword)
  await supabase
    .from('admin_passwords')
    .update({ password_hash: newHash, requires_change: false })
    .eq(type === 'main' ? 'is_main' : 'is_duress', true)

  return NextResponse.json({ ok: true })
}
