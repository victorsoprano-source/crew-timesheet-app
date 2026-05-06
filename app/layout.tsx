import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0b2f1f',
}

export const metadata: Metadata = {
  title: 'Crew Timesheet',
  description: 'Crew management and timesheet tracking for Ahern Painting Contractors Inc.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Crew Timesheet',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icons/icon-512x512.jpg',
    apple: '/apple-touch-icon.jpg',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* PWA meta tags */}
        <meta name="theme-color" content="#0b2f1f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.jpg" />
        {/* Critical inline styles to prevent flash of unstyled content */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* Ahern Painting Contractors Inc. - Base dark theme colors */
          html, body {
            background-color: #0B1F17 !important;
            color: #F5F1E8 !important;
            font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          html.dark, html.dark body {
            background-color: #0B1F17 !important;
            color: #F5F1E8 !important;
          }
          /* Hide content until CSS is fully loaded */
          .css-loading-guard {
            visibility: hidden;
          }
          /* Ensure flexbox and grid work immediately */
          .flex { display: flex !important; }
          .flex-col { flex-direction: column !important; }
          .items-center { align-items: center !important; }
          .justify-center { justify-content: center !important; }
          .gap-4 { gap: 1rem !important; }
          .gap-6 { gap: 1.5rem !important; }
          .min-h-screen { min-height: 100vh !important; }
          /* Loading screen styles */
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .animate-spin {
            animation: spin 1s linear infinite;
          }
          /* PWA safe-area support for iPhone notch and home indicator */
          body {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
          }
        `}} />
      </head>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
