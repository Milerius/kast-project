import './globals.css';
import type { ReactNode } from 'react';
import { Providers } from './providers.js';
import { inter, ibmMono } from './fonts.js';

export const metadata = { title: 'KAST DeFi' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`dark ${inter.variable} ${ibmMono.variable}`}
      lang="en"
      style={{ backgroundColor: '#131315', color: '#e5e1e4' }}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100..700,0..1,0&display=block"
        />
      </head>
      <body className="bg-surface text-on-surface bg-radial-glow min-h-screen font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
