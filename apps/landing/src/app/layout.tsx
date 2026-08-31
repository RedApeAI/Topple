import type { Metadata } from "next";
import {
  Manrope,
  Inter,
  Urbanist,
  Geist,
  DM_Sans,
  Poppins,
  Work_Sans,
  Ms_Madi,
  Caveat,
} from "next/font/google";
import SmoothScroll from "@/components/SmoothScroll";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-urbanist" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
});
const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
});
const msMadi = Ms_Madi({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-ms-madi",
});
// Substitute for the proprietary "Figma Hand" handwriting font used in the design.
const caveat = Caveat({ subsets: ["latin"], variable: "--font-hand" });

export const metadata: Metadata = {
  title: "RedApeAI — Meet Your AI Business Operator",
  description:
    "Understands buyer intent, detects opportunities, engages. And your sales pipeline keeps moving.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} ${urbanist.variable} ${geist.variable} ${dmSans.variable} ${poppins.variable} ${workSans.variable} ${msMadi.variable} ${caveat.variable}`}
    >
      <body suppressHydrationWarning>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
