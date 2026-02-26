import type { Metadata } from "next";
import {
  UnifrakturMaguntia,
  MedievalSharp,
  Press_Start_2P,
} from "next/font/google";
import { WalletProvider } from "@/providers/WalletProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { Toaster } from "sonner";
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
          <ThemeProvider>
            {children}
            <Toaster
              position="bottom-right"
              theme="dark"
              toastOptions={{
                style: {
                  fontFamily: "var(--font-press-start)",
                  fontSize: "10px",
                  background: "#1a1a2e",
                  border: "2px solid #7c3aed",
                  color: "#ededed",
                },
              }}
              visibleToasts={6}
            />
          </ThemeProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
