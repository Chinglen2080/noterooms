'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Room = {
  id: string
  slug: string
  label: string
  expires_at: string
  created_at: string
  message_count?: number
  has_password?: boolean
}

const DURATION_PRESETS = [
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
  btn: { padding: '0.5rem 1.25rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { padding: '0.35rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer' } as React.CSSProperties,
  roomRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', marginBottom: '0.4rem', cursor: 'pointer', transition: 'border-color 150ms' } as React.CSSProperties,
  tag: { fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 99, border: '1px solid var(--border)', color: 'var(--muted)', background: 'transparent' } as React.CSSProperties,
}

export default function Lobby() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState(DURATION_PRESETS[2].value)
  const [customDuration, setCustomDuration] = useState('')
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days'>('hours')
  const [useCustom, setUseCustom] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [passwords, setPasswords] = useState<{ pw: string; lockedUser: string }[]>([])
  const [passwordRemovable, setPasswordRemovable] = useState(true)
  const [importError, setImportError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/rooms')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRooms(d) })
      .finally(() => setLoading(false))
  }, [])

  function effectiveDuration(): number {
    if (useCustom) {
      const v = parseFloat(customDuration) || 0
      if (customUnit === 'minutes') return Math.round(v)
      if (customUnit === 'hours') return Math.round(v * 60)
      return Math.round(v * 1440)
    }
    return duration
  }

  function addPassword() {
    setPasswords(p => [...p, { pw: '', lockedUser: '' }])
  }

  function removePassword(i: number) {
    setPasswords(p => p.filter((_, idx) => idx !== i))
  }

  function updatePassword(i: number, field: 'pw' | 'lockedUser', val: string) {
    setPasswords(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!slug.trim() || creating) return
    const mins = effectiveDuration()
    if (mins < 5) { setError('minimum duration is 5 minutes'); return }
    if (mins > 20160) { setError('maximum duration is 14 days'); return }
    setCreating(true); setError('')
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const validPws = passwords.filter(p => p.pw.trim())
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: cleanSlug,
        label: label.trim(),
        duration_minutes: mins,
        passwords: validPws.map(p => ({
          plaintext: p.pw.trim(),
          locked_user: p.lockedUser.trim() || null,
        })),
        password_removable: passwordRemovable,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'failed to create'); setCreating(false); return }
    router.push(`/room/${data.slug}`)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        if (!json.room?.slug) throw new Error('invalid export file')
        // if room still exists, navigate; otherwise show import error
        fetch(`/api/rooms/${json.room.slug}`)
          .then(r => r.json())
          .then(d => {
            if (d.error) {
              setImportError(`Room "/${json.room.slug}" no longer exists (expired or deleted). The export contained ${json.messages?.length ?? 0} messages.`)
            } else {
              router.push(`/room/${json.room.slug}`)
            }
          })
      } catch {
        setImportError('invalid export file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <main style={s.page}>
      <h1 style={s.h1}>noterooms</h1>
      <p style={s.sub}>temporary chat rooms. pick a duration, share the link.</p>

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
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: useCustom ? '0.5rem' : 0 }}>
              {DURATION_PRESETS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => { setDuration(opt.value); setUseCustom(false) }}
                  style={{
                    padding: '0.3rem 0.75rem', borderRadius: 6,
                    border: `1px solid ${(!useCustom && duration === opt.value) ? 'var(--accent)' : 'var(--border)'}`,
                    background: (!useCustom && duration === opt.value) ? 'var(--accent-dim)' : 'transparent',
                    color: (!useCustom && duration === opt.value) ? 'var(--accent)' : 'var(--muted)',
                    fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  {opt.label}
                </button>
              ))}
              <button type="button"
                onClick={() => setUseCustom(true)}
                style={{
                  padding: '0.3rem 0.75rem', borderRadius: 6,
                  border: `1px solid ${useCustom ? 'var(--accent)' : 'var(--border)'}`,
                  background: useCustom ? 'var(--accent-dim)' : 'transparent',
                  color: useCustom ? 'var(--accent)' : 'var(--muted)',
                  fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer',
                }}>
                custom
              </button>
            </div>
            {useCustom && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="number" min={1} step={1}
                  value={customDuration}
                  onChange={e => setCustomDuration(e.target.value)}
                  placeholder="amount"
                  style={{ ...s.input, width: 100 }}
                />
                <select
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                  style={{ ...s.input, width: 'auto', paddingRight: '0.5rem' }}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            )}
          </div>

          {/* advanced options */}
          <div>
            <button type="button"
              onClick={() => setShowAdvanced(a => !a)}
              style={{ fontSize: '0.78rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ display: 'inline-block', transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>▶</span>
              advanced options
            </button>

            {showAdvanced && (
              <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)' }}>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={s.label as React.CSSProperties}>passwords (E2E encrypted)</span>
                    <button type="button" onClick={addPassword}
                      style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      + add password
                    </button>
                  </div>
                  {passwords.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>no passwords — room is public and messages are plaintext.</p>
                  )}
                  {passwords.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                      <input
                        type="password"
                        placeholder={`password ${i + 1}`}
                        value={p.pw}
                        onChange={e => updatePassword(i, 'pw', e.target.value)}
                        style={{ ...s.input, flex: 1 }}
                      />
                      <input
                        placeholder="lock to user (optional)"
                        value={p.lockedUser}
                        onChange={e => updatePassword(i, 'lockedUser', e.target.value)}
                        style={{ ...s.input, flex: 1 }}
                      />
                      <button type="button" onClick={() => removePassword(i)}
                        style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                  {passwords.length > 0 && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                      messages are encrypted in your browser. the server never sees plaintext.
                      if "lock to user" is blank, the first person to use that password claims it.
                    </p>
                  )}
                </div>

                {passwords.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" id="pw-removable" checked={passwordRemovable}
                      onChange={e => setPasswordRemovable(e.target.checked)} />
                    <label htmlFor="pw-removable" style={{ fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer' }}>
                      allow users to remove their own password
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p style={{ fontSize: '0.8rem', color: 'var(--error)' }}>{error}</p>}
          <button type="submit" style={s.btn} disabled={creating}>{creating ? 'creating...' : 'create room →'}</button>
        </form>
      </div>

      {/* import */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        <button style={s.btnGhost} onClick={() => importRef.current?.click()}>↑ import chat</button>
        {importError && <p style={{ fontSize: '0.78rem', color: 'var(--error)', marginTop: '0.35rem' }}>{importError}</p>}
      </div>

      <div>
        <p style={{ ...s.label as React.CSSProperties, marginBottom: '0.75rem' }}>active rooms ({rooms.length})</p>
        {loading && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>loading...</p>}
        {!loading && rooms.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>no active rooms yet. create one above.</p>}
        {rooms.map(room => (
          <div key={room.id} style={s.roomRow} onClick={() => router.push(`/room/${room.slug}`)}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{room.label || room.slug}</span>
              {room.label && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>/{room.slug}</span>}
              {room.message_count !== undefined && (
                <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{room.message_count} msg{room.message_count !== 1 ? 's' : ''}</span>
              )}
              {room.has_password && (
                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: 99, border: '1px solid var(--border)', color: 'var(--muted)' }}>🔒</span>
              )}
            </div>
            <span style={s.tag}>{timeLeft(room.expires_at)}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
