import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPassword, verifyPassword } from '@/lib/crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function ensureDefaultPasswords(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from('admin_passwords').select('id').limit(1)
  if (data && data.length > 0) return
  // Seed defaults so the site works immediately after deploy
  const mainHash = await hashPassword('password')
  const duressHash = await hashPassword('duresspassword')
  await supabase.from('admin_passwords').insert([
    { password_hash: mainHash, is_main: true, is_duress: false },
    { password_hash: duressHash, is_main: false, is_duress: true },
  ])
}

export async function POST(req: Request) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'No password' }, { status: 400 })

  const adminToken = process.env.ADMIN_TOKEN
  if (!adminToken) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const supabase = getSupabase()
  await ensureDefaultPasswords(supabase)

  const { data: adminPws } = await supabase.from('admin_passwords').select('*')
  if (adminPws) {
    for (const row of adminPws) {
      const match = await verifyPassword(password, row.password_hash)
      if (match) {
        if (row.is_duress) {
          const poisonHash = await hashPassword(`duress-${Date.now()}-${Math.random()}`)
          await supabase
            .from('admin_passwords')
            .update({ password_hash: poisonHash, requires_change: true })
            .eq('is_main', true)
          await supabase
            .from('duress_events')
            .insert({ triggered_at: new Date().toISOString() })
          return NextResponse.json({ ok: true, duress: true, token: adminToken })
        }
        return NextResponse.json({
          ok: true,
          duress: false,
          requiresChange: row.requires_change ?? false,
          token: adminToken,
        })
      }
    }
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}
