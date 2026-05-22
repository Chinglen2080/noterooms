import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import CssGate from './css-gate'
import TrackingGate from './tracking-gate'

export const metadata: Metadata = {
  title: 'noterooms',
  description: 'Temporary chat rooms with end-to-end encryption',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <CssGate>{children}</CssGate>
        <TrackingGate>
          <Analytics />
          <SpeedInsights />
        </TrackingGate>
      </body>
    </html>
  )
}
