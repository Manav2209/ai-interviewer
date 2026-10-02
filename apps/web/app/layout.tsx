import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Link from "next/link";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "AI Technical Interview",
  description: "Get interviewed on your actual project.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <header className="app-header">
          <Link
            className="brand"
            href="/"
            aria-label="AI Technical Interview home"
          >
            <span className="brand-mark" aria-hidden="true">
              &gt;_
            </span>
            <span>
              Interview<span className="brand-light"> / AI</span>
            </span>
          </Link>
          <span className="header-note">Built around your code.</span>
        </header>
        {children}
      </body>
    </html>
  );
}
