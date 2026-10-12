import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import "./vicus-system.css";

// One coherent editorial monospace family across the whole product.
const geistMono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Vicus — Where assets find their people",
    template: "%s — Vicus",
  },
  description:
    "Vicus is the community layer for tokenized assets: explore, understand, watch, and find a verified way in.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geistMono.variable}>
      <body>{children}</body>
    </html>
  );
}
