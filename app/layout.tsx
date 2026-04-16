import type { Metadata, Viewport } from "next";
import { Fraunces, Caveat } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
  display: "swap",
  variable: "--font-fraunces"
});

// Caveat — a calm cursive used only for the "From <place> —" greeting
// and a couple of tiny flourishes. Pulls the whole page toward
// "handwritten postcard" without tipping into cartoonish.
const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-caveat"
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
    { media: "(prefers-color-scheme: light)", color: "#efe4cb" },
    { media: "(prefers-color-scheme: dark)", color: "#191511" }
  ]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
