'use client'

import { useEffect } from 'react'

export default function CssGate({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('no-css') === '1') {
      const style = document.createElement('style')
      style.textContent = `* { font-family: 'Courier New', Courier, monospace; }`
      document.head.appendChild(style)
    } else {
      // inject globals
      const style = document.createElement('style')
      style.textContent = `
        :root {
          --bg: #0f0f0f;
          --fg: #e8e8e8;
          --muted: #666;
          --border: #222;
          --accent: #4f98a3;
          --accent-dim: rgba(79,152,163,0.12);
          --error: #d163a7;
          --surface: #161616;
          --surface2: #1c1c1c;
          --radius: 8px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
        body {
          font-family: 'Inter', 'Helvetica Neue', sans-serif;
          background: var(--bg);
          color: var(--fg);
          font-size: 14px;
          line-height: 1.6;
        }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; }
        button { cursor: pointer; font-family: inherit; }
        input, textarea { font-family: inherit; color: var(--fg); background: transparent; font-size: 0.875rem; }
        ::placeholder { color: var(--muted); }
        ::selection { background: rgba(79,152,163,0.25); }
        :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
        @media (prefers-color-scheme: light) {
          :root {
            --bg: #f7f6f2;
            --fg: #28251d;
            --muted: #7a7974;
            --border: #dcd9d5;
            --surface: #f9f8f5;
            --surface2: #f3f0ec;
            --accent: #01696f;
            --accent-dim: rgba(1,105,111,0.08);
            --error: #a12c7b;
          }
        }
      `
      document.head.appendChild(style)

      // load Inter
      const preconnect1 = document.createElement('link')
      preconnect1.rel = 'preconnect'
      preconnect1.href = 'https://fonts.googleapis.com'
      document.head.appendChild(preconnect1)

      const preconnect2 = document.createElement('link')
      preconnect2.rel = 'preconnect'
      preconnect2.href = 'https://fonts.gstatic.com'
      preconnect2.setAttribute('crossorigin', 'anonymous')
      document.head.appendChild(preconnect2)

      const font = document.createElement('link')
      font.rel = 'stylesheet'
      font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
      document.head.appendChild(font)
    }
  }, [])

  return <>{children}</>
}
