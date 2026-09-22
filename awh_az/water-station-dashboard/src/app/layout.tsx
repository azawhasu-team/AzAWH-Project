import React from 'react';
import Script from 'next/script';
import ClientWrapper from '@/components/ClientWrapper';
import { COLOR_MODE_INIT_SCRIPT } from '@/lib/colorMode';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>AzAWH — Atmospheric Water Harvesting Dashboard</title>
        <meta name="description" content="Arizona Atmospheric Water Harvesting (AzAWH) station monitoring dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@500;600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap"
        />
      </head>
      <body>
        {/* Next's beforeInteractive Script must live in <body>, not a manually
            rendered <head> — Next hoists it into the initial HTML itself, and
            placing it inside <head> instead defeats that hoisting, so React
            sees it as a plain <script> tag and warns/mismatches on hydration. */}
        <Script
          id="color-mode-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: COLOR_MODE_INIT_SCRIPT }}
        />
        <ClientWrapper>
          {children}
        </ClientWrapper>
      </body>
    </html>
  );
}
