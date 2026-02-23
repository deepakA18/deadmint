import type { Metadata } from "next";
import {
  UnifrakturMaguntia,
  MedievalSharp,
  Press_Start_2P,
} from "next/font/google";
import { WalletProvider } from "@/providers/WalletProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import "./globals.css";

const unifraktur = UnifrakturMaguntia({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-unifraktur",
  display: "swap",
});

const medievalSharp = MedievalSharp({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-medieval-sharp",
  display: "swap",
});

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Deadmint",
  description:
    "Wager SOL, destroy blocks, collect loot, bomb your opponents. Last one standing wins the pot.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${unifraktur.variable} ${medievalSharp.variable} ${pressStart.variable} bg-background text-foreground antialiased`}
      >
        <WalletProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
