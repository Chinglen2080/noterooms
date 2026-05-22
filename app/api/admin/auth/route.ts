import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { secret } = await req.json()
  if (!secret || secret !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
