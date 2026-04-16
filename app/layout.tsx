import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
  display: "swap",
  variable: "--font-fraunces"
});

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
  icons: { icon: "data:," }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe3" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" }
  ]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body>{children}</body>
    </html>
  );
}
