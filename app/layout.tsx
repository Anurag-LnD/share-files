import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FastDrop – P2P File Sharing',
  description:
    'Zero-login, serverless peer-to-peer file sharing powered by WebRTC & Nostr.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0f]">{children}</body>
    </html>
  );
}
