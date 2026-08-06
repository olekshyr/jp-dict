import "./globals.css";

import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { ThemeScript } from "./theme-script";

import { Toaster } from "@/components/ui/toast";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "jp-dict",
  description: "Search Japanese vocabulary and drill it as flashcards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
      // ThemeScript adds the `dark` class here before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      {/*
        ClerkProvider must be INSIDE <body>, not wrapping <html>. With
        `cacheComponents: true` the provider reads request data, and wrapping
        <html> pulls the whole document out of the static shell with an
        "Uncached data was accessed outside of <Suspense>" error.
      */}
      <body className="min-h-full flex flex-col">
        <ClerkProvider>{children}</ClerkProvider>
        <Analytics />
        <SpeedInsights />
        <Toaster />
      </body>
    </html>
  );
}
