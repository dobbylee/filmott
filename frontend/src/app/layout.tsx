import type { Metadata } from 'next';
import { Outfit, Noto_Sans_KR } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/contexts/AuthContext';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AuthModal from '@/components/auth/AuthModal';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

const SITE_URL = 'https://filmott.kr';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'filmott - 영화/드라마 리뷰',
    template: '%s | filmott',
  },
  description: '영화와 드라마 리뷰, 별점, 워치리스트. 나만의 시네마틱 경험을 기록하세요.',
  icons: {
    icon: [
      { url: '/icons/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon/apple-touch-icon.png' },
      { url: '/icons/apple-touch-icon/apple-touch-icon-180x180.png', sizes: '180x180' },
      { url: '/icons/apple-touch-icon/apple-touch-icon-152x152.png', sizes: '152x152' },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: 'filmott',
    title: 'filmott - 영화/드라마 리뷰',
    description: '영화와 드라마 리뷰, 별점, 워치리스트. 나만의 시네마틱 경험을 기록하세요.',
    images: [
      {
        url: '/icons/og/og-image.png',
        width: 1200,
        height: 630,
        alt: 'filmott',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'filmott - 영화/드라마 리뷰',
    description: '영화와 드라마 리뷰, 별점, 워치리스트. 나만의 시네마틱 경험을 기록하세요.',
    images: ['/icons/og/twitter-card.png'],
  },
  other: {
    'msapplication-TileColor': '#000000',
    'msapplication-config': '/browserconfig.xml',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`dark ${outfit.variable} ${notoSansKR.variable}`}>
      <body className="antialiased min-h-screen bg-background text-foreground selection:bg-primary/30">
        <GoogleAnalytics />
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          <AuthProvider>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="w-full flex-1 pb-10 pt-20">{children}</main>
              <Footer />
            </div>
            <AuthModal />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
