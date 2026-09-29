import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Naya — Gestion locative",
  description: "La gestion locative simplifiée pour vos immeubles en Afrique.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
