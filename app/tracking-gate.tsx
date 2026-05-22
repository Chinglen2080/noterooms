'use client'

import { useEffect, useState } from 'react'

function isNoTrack(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('no-trac') === '1') return true
  if (navigator.doNotTrack === '1') return true
  // @ts-expect-error globalPrivacyControl is not in TS types yet
  if (navigator.globalPrivacyControl === true) return true
  return false
}

function isNoCss(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('no-css') === '1'
}

export default function TrackingGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false)
  const [toast, setToast] = useState(false)
  const [noCss, setNoCss] = useState(false)

  useEffect(() => {
    const nc = isNoCss()
    setNoCss(nc)
    if (isNoTrack()) {
      setBlocked(true)
      const t = setTimeout(() => {
        setToast(true)
        setTimeout(() => setToast(false), 1000)
      }, 600)
      return () => clearTimeout(t)
    }
  }, [])

  const toastStyle: React.CSSProperties = noCss
    ? {
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        background: '#000',
        color: '#fff',
        padding: '0.4rem 0.75rem',
        fontSize: '0.8rem',
        fontFamily: 'Courier New, monospace',
        zIndex: 9999,
        whiteSpace: 'nowrap',
      }
    : {
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--fg, #111)',
        color: 'var(--bg, #fff)',
        padding: '0.55rem 1.1rem',
        borderRadius: 8,
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 9999,
        whiteSpace: 'nowrap',
        animation: 'fadein 200ms ease',
      }

  return (
    <>
      {!blocked && children}
      {toast && (
        <div role="status" aria-live="polite" style={toastStyle}>
          tracking disabled
        </div>
      )}
      {!noCss && (
        <style>{`
          @keyframes fadein {
            from { opacity: 0; transform: translateX(-50%) translateY(6px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>
      )}
    </>
  )
}
