'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Room = {
  id: string
  slug: string
  label: string
  expires_at: string
  created_at: string
  message_count?: number
}

const DURATION_OPTIONS = [
  { label: '1 hour', value: 60 },
  { label: '6 hours', value: 360 },
  { label: '24 hours', value: 1440 },
  { label: '3 days', value: 4320 },
  { label: '7 days', value: 10080 },
]

function timeLeft(expiresAt: string): string {
  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  if (diff <= 0) return 'expired'
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`
  if (diff < 86400) return `${(diff / 3600).toFixed(1)}h left`
  return `${Math.floor(diff / 86400)}d left`
}

const s = {
  page: { minHeight: '100dvh', maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' } as React.CSSProperties,
  h1: { fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '0.25rem' } as React.CSSProperties,
  sub: { color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '2.5rem' } as React.CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', background: 'var(--surface)', marginBottom: '2rem' } as React.CSSProperties,
  label: { fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.35rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' } as React.CSSProperties,
  input: { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--fg)', fontSize: '0.875rem' } as React.CSSProperties,
  btn: { padding: '0.5rem 1.25rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500 } as React.CSSProperties,
  roomRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', marginBottom: '0.4rem', cursor: 'pointer', transition: 'border-color 150ms' } as React.CSSProperties,
  tag: { fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 99, border: '1px solid var(--border)', color: 'var(--muted)', background: 'transparent' } as React.CSSProperties,
}

export default function Lobby() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState(DURATION_OPTIONS[2].value)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/rooms')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRooms(d) })
      .finally(() => setLoading(false))
  }, [])

  async function createRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!slug.trim() || creating) return
    setCreating(true); setError('')
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'), label: label.trim(), duration_minutes: duration }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'failed to create'); setCreating(false); return }
    router.push(`/room/${data.slug}`)
  }

  return (
    <main style={s.page}>
      <h1 style={s.h1}>noterooms</h1>
      <p style={s.sub}>temporary public chat rooms. pick a duration, share the link.</p>

      <div style={s.card}>
        <form onSubmit={createRoom} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={s.label}>room slug</label>
            <input style={s.input} value={slug} onChange={e => setSlug(e.target.value)}
              placeholder="e.g. study-group-cs101" maxLength={48} required />
            {slug && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              noterooms.app/room/{slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}
            </p>}
          </div>
          <div>
            <label style={s.label}>display name (optional)</label>
            <input style={s.input} value={label} onChange={e => setLabel(e.target.value)} placeholder="CS101 Study Group" maxLength={80} />
          </div>
          <div>
            <label style={s.label}>expires in</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {DURATION_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setDuration(opt.value)}
                  style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: `1px solid ${duration === opt.value ? 'var(--accent)' : 'var(--border)'}`, background: duration === opt.value ? 'var(--accent-dim)' : 'transparent', color: duration === opt.value ? 'var(--accent)' : 'var(--muted)', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p style={{ fontSize: '0.8rem', color: 'var(--error)' }}>{error}</p>}
          <button type="submit" style={s.btn} disabled={creating}>{creating ? 'creating...' : 'create room →'}</button>
        </form>
      </div>

      <div>
        <p style={{ ...s.label, marginBottom: '0.75rem' }}>active rooms ({rooms.length})</p>
        {loading && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>loading...</p>}
        {!loading && rooms.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>no active rooms yet. create one above.</p>}
        {rooms.map(room => (
          <div key={room.id} style={s.roomRow} onClick={() => router.push(`/room/${room.slug}`)}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
            <div>
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{room.label || room.slug}</span>
              {room.label && <span style={{ color: 'var(--muted)', fontSize: '0.78rem', marginLeft: '0.5rem' }}>/{room.slug}</span>}
              {room.message_count !== undefined && (
                <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{room.message_count} msg{room.message_count !== 1 ? 's' : ''}</span>
              )}
            </div>
            <span style={s.tag}>{timeLeft(room.expires_at)}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
