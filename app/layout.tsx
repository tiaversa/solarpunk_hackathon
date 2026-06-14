import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/components/SessionProvider";
import { OfflineSync } from "@/components/OfflineSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "Green Quest",
  description:
    "Mission-based learning for a hands-on, regenerative future. Six levels per topic, three AI-generated missions per level.",
  manifest: "/manifest.webmanifest",
  applicationName: "Green Quest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#4a8d3c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SessionProvider>
          <OfflineSync />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
