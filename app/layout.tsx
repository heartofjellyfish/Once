import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Once",
  description:
    "One small moment from somewhere in the world. Updated every hour.",
  icons: { icon: "data:," } // suppress the default favicon request quietly
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
