import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppFrame } from "@/components/app-frame";
import { PlanningPreparationProvider } from "@/components/planning/planning-preparation-context";
import { PlanningPushBootstrap } from "@/components/push/planning-push-bootstrap";
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

/**
 * Génère la balise viewport (équivalent HTML) :
 * `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />`
 * (Next.js émet `user-scalable=no`, équivalent iOS.)
 */
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full max-w-full overflow-x-hidden antialiased`}
    >
      <head>
        <link
          rel="apple-touch-icon"
          href="/icons/apple-touch-icon.png"
          sizes="180x180"
        />
      </head>
      <body className="flex min-h-full w-full max-w-full flex-col overflow-x-hidden">
        <PlanningPushBootstrap />
        <PlanningPreparationProvider>
          <AppFrame>{children}</AppFrame>
        </PlanningPreparationProvider>
      </body>
    </html>
  );
}
