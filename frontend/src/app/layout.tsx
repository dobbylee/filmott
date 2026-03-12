import type { Metadata } from 'next';
import { Outfit, Noto_Sans_KR } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/contexts/AuthContext';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AuthModal from '@/components/auth/AuthModal';
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

export const metadata: Metadata = {
  title: 'filmott - 영화/드라마 리뷰',
  description: '최고의 프리미엄 시네마틱 경험, 영화/드라마 리뷰과 별점',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`dark ${outfit.variable} ${notoSansKR.variable}`}>
      <body className="antialiased min-h-screen bg-background text-foreground selection:bg-primary/30">
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
