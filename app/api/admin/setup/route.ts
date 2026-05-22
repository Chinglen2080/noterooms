import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPassword } from '@/lib/crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET: check if setup is needed
export async function GET() {
  const supabase = getSupabase()
  const { data } = await supabase.from('admin_passwords').select('id').limit(1)
  return NextResponse.json({ needsSetup: !data || data.length === 0 })
}

// POST: set initial passwords (only works if table is empty)
export async function POST(req: Request) {
  const supabase = getSupabase()

  // Guard: only allowed if no passwords exist yet
  const { data: existing } = await supabase.from('admin_passwords').select('id').limit(1)
  if (existing && existing.length > 0)
    return NextResponse.json({ error: 'Already set up' }, { status: 403 })

  const { mainPassword, duressPassword } = await req.json()
  if (!mainPassword || !duressPassword)
    return NextResponse.json({ error: 'Both passwords required' }, { status: 400 })
  if (mainPassword === duressPassword)
    return NextResponse.json({ error: 'Passwords must be different' }, { status: 400 })

  const mainHash = await hashPassword(mainPassword)
  const duressHash = await hashPassword(duressPassword)

  await supabase.from('admin_passwords').insert([
    { password_hash: mainHash, is_main: true, is_duress: false },
    { password_hash: duressHash, is_main: false, is_duress: true },
  ])

  return NextResponse.json({ ok: true })
}
