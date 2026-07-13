import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCB Real Estate — Site Plans",
  description: "Interactive property site plans (PoC)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="mark">MCB</span>
            <span>REAL ESTATE</span>
          </Link>
          <nav>
            <Link href="/">Properties</Link>
            <Link href="/property/new">+ Add property</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
