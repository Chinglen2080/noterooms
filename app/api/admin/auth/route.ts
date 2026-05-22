import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPassword, verifyPassword } from '@/lib/crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'No password' }, { status: 400 })

  const adminToken = process.env.ADMIN_TOKEN
  if (!adminToken) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const supabase = getSupabase()

  const { data: adminPws } = await supabase.from('admin_passwords').select('*')
  if (adminPws) {
    for (const row of adminPws) {
      const match = await verifyPassword(password, row.password_hash)
      if (match) {
        if (row.is_duress) {
          // Rotate main password to a random unguessable hash, log the event
          const poisonHash = await hashPassword(`duress-${Date.now()}-${Math.random()}`)
          await supabase
            .from('admin_passwords')
            .update({ password_hash: poisonHash, requires_change: true })
            .eq('is_main', true)
          await supabase
            .from('duress_events')
            .insert({ triggered_at: new Date().toISOString() })
          // Return a valid token so the fake empty panel renders — attacker sees nothing
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
