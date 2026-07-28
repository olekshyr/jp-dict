import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        ClerkProvider must be INSIDE <body>, not wrapping <html>. With
        `cacheComponents: true` the provider reads request data, and wrapping
        <html> pulls the whole document out of the static shell with an
        "Uncached data was accessed outside of <Suspense>" error.
      */}
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
