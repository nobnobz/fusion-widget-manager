import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConfigProvider } from "@/context/ConfigContext";
import { ThemeChromeSync } from "@/components/theme-chrome-sync";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import IconImage from '@/../public/icon.png';
import FaviconImage from '@/../public/favicon.png';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Widget Manager",
  description: "A clean, visual editor for fusionWidgets JSON",
  icons: {
    icon: IconImage.src,
    shortcut: FaviconImage.src,
    apple: IconImage.src,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Widget Manager",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen text-foreground selection:bg-primary/30 overflow-x-hidden relative`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeChromeSync />
          
          {/* Global Background Stack */}
          <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden isolate">
            <div className="absolute inset-0 bg-background" />
            
            {/* Grid pattern */}
            <div
              className="absolute inset-[-100px] opacity-[0.11] dark:opacity-[0.095]"
              style={{
                backgroundImage: `linear-gradient(to right, oklch(0.60 0 0 / 0.15) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.60 0 0 / 0.15) 1px, transparent 1px)`,
                backgroundSize: "32px 32px"
              }}
            />

            {/* Decorative Blobs */}
            <div
              className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] animate-pulse"
              style={{ animationDuration: "10s", backgroundColor: "var(--page-blob-info)" }}
            />
            <div
              className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] animate-pulse"
              style={{ animationDuration: "7s", backgroundColor: "var(--page-blob-warning)" }}
            />
            <div
              className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full blur-[100px] animate-pulse"
              style={{ animationDuration: "12s", backgroundColor: "var(--page-blob-success)" }}
            />
          </div>

          <div className="relative z-10 flex flex-col min-h-screen">
            <ConfigProvider>
              {children}
            </ConfigProvider>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
