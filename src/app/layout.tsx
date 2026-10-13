import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./vicus-system.css";

// DM Sans is the primary product typeface (navigation, headlines, body, UI).
// Geist Mono remains only for genuinely technical values (addresses, hashes).
const dmSans = DM_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "700"],
});

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
    <html lang="en" className={`${dmSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
