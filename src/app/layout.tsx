import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Chat } from "@/components/chat/Chat";
import { ChatUIProvider } from "@/components/chat/chat-ui-provider";
import { PlanningPushBootstrap } from "@/components/push/planning-push-bootstrap";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_NAME = "Meltin Planning";
const APP_DESCRIPTION =
  "Planning d’équipe synchronisé avec Google Sheets pour environ 10 collaborateurs.";

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) }
    : {}),
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    description: APP_DESCRIPTION,
  },
  icons: {
    icon: [
      {
        url: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      data-env={process.env.NODE_ENV}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="apple-touch-icon"
          href="/icons/apple-touch-icon.png"
          sizes="180x180"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PlanningPushBootstrap />
        <ChatUIProvider>
          <SiteHeader />
          <div className="flex flex-1">
            <aside className="hidden md:block md:w-80 md:shrink-0 md:border-r md:border-border/80 md:bg-background">
              <div className="sticky top-14 h-[calc(100dvh-3.5rem)]">
                <Chat variant="desktop" />
              </div>
            </aside>
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
          <Chat variant="mobile" />
        </ChatUIProvider>
      </body>
    </html>
  );
}
