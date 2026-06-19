import type { Metadata } from "next";
import { Anton, Cormorant } from "next/font/google";
import { SiteHeader } from "@/components/nav/site-header";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SnapFocus — Focus, verified.",
  description:
    "SnapFocus by SeJo Labs: AI Room Checks, customized lesson plans, and a Master Focus Coach — all in one app for parents and individuals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-cream">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
