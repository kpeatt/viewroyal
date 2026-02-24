import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import '../tailwind.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider search={{ options: { type: 'static' } }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
