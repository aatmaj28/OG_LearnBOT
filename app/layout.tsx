import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'LearnBot',
  description: 'Created by the amazing team at DASH Lab',
  generator: 'v0.app',
  icons: {
    icon: '/learnbot-logo.png',
    apple: '/learnbot-logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`} suppressHydrationWarning={true}>
        {children}
        <Toaster position="top-right" richColors closeButton />
        <Analytics />
      </body>
    </html>
  )
}
