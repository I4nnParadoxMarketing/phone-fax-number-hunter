import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phone & Fax Number Hunter",
  description: "Search entire websites for phone numbers, fax numbers, or custom text.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
