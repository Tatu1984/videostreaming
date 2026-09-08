import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Live Feed Portal',
  description: 'Live camera feeds for AI / computer-vision development.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
