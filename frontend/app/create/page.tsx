"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { GraveyardBackground } from "@/components/GraveyardBackground";
import { ThemeSelector } from "@/components/ThemeSelector";
import { WalletButton } from "@/components/WalletButton";
import { PixelButton } from "@/components/ui/PixelButton";
import { createGameAndJoin, getBaseConnection } from "@/lib/gameService";
import { getOrCreateSessionKey, fundSessionKey } from "@/lib/sessionKey";
import { saveGame } from "@/app/games/page";
import { registerGameWithBackend } from "@/lib/backendWs";

export default function CreateGamePage() {
  const router = useRouter();
  const wallet = useWallet();
  const [entryFee, setEntryFee] = useState(0.05);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedPool = (entryFee * maxPlayers).toFixed(2);

  async function handleCreate() {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      setError("Please connect your wallet first");
      return;
    }
    setError(null);
    setIsCreating(true);
    try {
      const walletAdapter = { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction, sendTransaction: wallet.sendTransaction };
      const entryFeeLamports = new BN(Math.floor(entryFee * 1e9));

      // Generate session key — player authority on-chain will be this key
      const sessionKey = getOrCreateSessionKey(wallet.publicKey);
      const result = await createGameAndJoin(walletAdapter, entryFeeLamports, maxPlayers, sessionKey.publicKey);

      // Fund session key with small SOL for base-layer tx fees
      try {
        await fundSessionKey(walletAdapter, getBaseConnection(), sessionKey);
      } catch (e) {
        console.warn("Session key funding skipped:", e);
      }

      // Register with backend for cranking (best-effort)
      registerGameWithBackend(
        result.gamePda.toBase58(),
        result.gameId.toString(),
        maxPlayers
      );

      // Save to localStorage for game discovery
      saveGame(
        result.gamePda.toBase58(),
        result.gameId.toString(),
        maxPlayers
      );
      // Navigate to game page
      const params = new URLSearchParams({
        game: result.gamePda.toBase58(),
        maxPlayers: maxPlayers.toString(),
      });
      router.push(`/game/${result.gameId.toString()}?${params.toString()}`);
    } catch (e: unknown) {
      console.error("Create game failed:", e);
      setError(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <GraveyardBackground />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="text-xs tracking-wider hover:opacity-80 transition-opacity"
          style={{ color: "var(--primary-light)" }}
        >
          {"\u2190"} BACK
        </button>
        <div className="flex items-center gap-3">
          <ThemeSelector />
          <WalletButton />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-16">
        <div className="glass-panel p-8 w-full max-w-md">
          {/* Title */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-2xl">{"\u26B0"}</span>
            <h1
              className="font-[family-name:var(--font-unifraktur)] text-3xl text-glow-purple"
              style={{ color: "#fff" }}
            >
              Create Game
            </h1>
            <span className="text-2xl">{"\u26B0"}</span>
          </div>
          <div className="pixel-separator mx-auto w-48 mb-8" />

          {/* Entry Fee */}
          <div className="mb-6">
            <label
              className="block text-xs mb-2"
              style={{ color: "var(--muted)" }}
            >
              ENTRY FEE
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0.01"
                className="w-full px-4 py-3 text-sm"
                style={{
                  backgroundColor: "var(--background)",
                  border: "3px solid var(--border-8bit)",
                  color: "var(--sol-green)",
                  outline: "none",
                }}
              />
              <span
                className="text-sm flex-shrink-0"
                style={{ color: "var(--sol-green)" }}
              >
                SOL
              </span>
            </div>
          </div>

          {/* Max Players */}
          <div className="mb-6">
            <label
              className="block text-xs mb-2"
              style={{ color: "var(--muted)" }}
            >
              MAX PLAYERS
            </label>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className="flex-1 py-3 text-sm text-center transition-colors"
                  style={{
                    backgroundColor:
                      n === maxPlayers ? "var(--primary-dark)" : "var(--background)",
                    border: `3px solid ${n === maxPlayers ? "var(--primary)" : "var(--border-8bit)"}`,
                    color:
                      n === maxPlayers ? "var(--foreground)" : "var(--muted-dark)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Prize Pool Preview */}
          <div
            className="mb-6 p-4 text-center"
            style={{
              backgroundColor: "color-mix(in srgb, var(--background) 60%, transparent)",
              border: "2px solid var(--border-8bit)",
            }}
          >
            <span className="text-xs block mb-1" style={{ color: "var(--muted)" }}>
              ESTIMATED PRIZE POOL
            </span>
            <span className="text-lg" style={{ color: "var(--sol-green)" }}>
              {estimatedPool} SOL
            </span>
            <span className="text-xs block mt-1" style={{ color: "var(--muted-dark)" }}>
              ({maxPlayers} × {entryFee.toFixed(2)} SOL)
            </span>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-4 p-3 text-xs text-center"
              style={{
                backgroundColor: "color-mix(in srgb, var(--explosion-red) 15%, transparent)",
                border: "2px solid var(--explosion-red)",
                color: "var(--explosion-red)",
              }}
            >
              {error}
            </div>
          )}

          {/* Create Button */}
          <PixelButton
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating
              ? "CREATING & JOINING..."
              : `\u2620 CREATE GAME \u2620`}
          </PixelButton>

          <p
            className="text-xs mt-4 text-center"
            style={{ color: "var(--muted-dark)" }}
          >
            {wallet.publicKey
              ? `WALLET: ${wallet.publicKey.toBase58().slice(0, 4)}...${wallet.publicKey.toBase58().slice(-4)}`
              : "CONNECT WALLET TO CREATE"}
          </p>
        </div>

        {/* Link to games */}
        <button
          onClick={() => router.push("/games")}
          className="mt-6 text-xs tracking-wider hover:opacity-80 transition-opacity"
          style={{ color: "var(--primary-light)" }}
        >
          or BROWSE ACTIVE GAMES {"\u2192"}
        </button>
      </main>
    </div>
  );
}
