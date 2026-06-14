import type { Metadata, Viewport } from "next";
import { Source_Code_Pro, Sixtyfour } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import { OfflineSync } from "@/components/OfflineSync";
import "./globals.css";

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

const sixtyfour = Sixtyfour({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Green Quest",
  description:
    "Quest-based learning for a hands-on, regenerative future. Six levels per topic, three AI-generated quests per level.",
  manifest: "/manifest.webmanifest",
  applicationName: "Green Quest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1F14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sourceCodePro.variable} ${sixtyfour.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('solar.theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-solar-bg font-sans text-solar-sage antialiased">
        <SessionProvider>
          <OfflineSync />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
