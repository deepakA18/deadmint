"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { RPC_URL } from "@/lib/constants";

import "@solana/wallet-adapter-react-ui/styles.css";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    if (RPC_URL.startsWith("http")) return RPC_URL;
    // Relative path like /api/rpc — construct absolute URL
    if (typeof window !== "undefined") return `${window.location.origin}${RPC_URL}`;
    return `http://localhost:3000${RPC_URL}`;
  }, []);
  // If using /api/rpc proxy, WS isn't supported — use public devnet WS endpoint
  const wsEndpoint = useMemo(
    () => (endpoint.includes("/api/rpc") ? "wss://api.devnet.solana.com" : undefined),
    [endpoint]
  );
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ wsEndpoint, commitment: "confirmed" }}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
