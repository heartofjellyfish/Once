import type { Metadata, Viewport } from "next";
import "./globals.css";

const description =
  "One small moment from somewhere in the world. Updated every hour.";

export const metadata: Metadata = {
  title: {
    default: "Once",
    template: "%s — Once"
  },
  description,
  applicationName: "Once",
  openGraph: {
    title: "Once",
    description,
    type: "website",
    siteName: "Once"
  },
  twitter: {
    card: "summary_large_image",
    title: "Once",
    description
  },
  icons: { icon: "data:," } // suppress the default favicon request quietly
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" }
  ]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
