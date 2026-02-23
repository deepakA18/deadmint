"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { GraveyardBackground } from "@/components/GraveyardBackground";
import { ThemeSelector } from "@/components/ThemeSelector";
import { WalletButton } from "@/components/WalletButton";
import { PixelButton } from "@/components/ui/PixelButton";
import {
  getBaseConnection,
  joinGame,
  fetchGameConfig,
  discoverGames,
} from "@/lib/gameService";
import { getOrCreateSessionKey, fundSessionKey } from "@/lib/sessionKey";
import { STATUS_LOBBY, STATUS_ACTIVE } from "@/lib/constants";
import type { GameConfig } from "@/lib/types";
import { fetchGamesFromBackend } from "@/lib/backendWs";

// Persist created games in localStorage for discovery
interface SavedGame {
  gamePda: string;
  gameId: string;
  maxPlayers: number;
}

function getSavedGames(): SavedGame[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("deadmint_games") || "[]");
  } catch {
    return [];
  }
}

export function saveGame(gamePda: string, gameId: string, maxPlayers: number) {
  if (typeof window === "undefined") return;
  const games = getSavedGames();
  if (!games.find((g) => g.gamePda === gamePda)) {
    games.push({ gamePda, gameId, maxPlayers });
    localStorage.setItem("deadmint_games", JSON.stringify(games));
  }
}

interface GameEntry {
  gamePda: PublicKey;
  gameId: string;
  maxPlayers: number;
  config: GameConfig;
}

export default function GamesPage() {
  const router = useRouter();
  const wallet = useWallet();
  const [games, setGames] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    const connection = getBaseConnection();
    const results: GameEntry[] = [];
    const seenPdas = new Set<string>();

    // 1. Try backend API first (fast, no RPC load)
    try {
      const backendGames = await fetchGamesFromBackend();
      for (const bg of backendGames) {
        try {
          const gamePda = new PublicKey(bg.gamePda);
          const config = await fetchGameConfig(connection, gamePda);
          if (config) {
            results.push({ gamePda, gameId: bg.gameId, maxPlayers: bg.maxPlayers, config });
            seenPdas.add(bg.gamePda);
          }
        } catch {}
      }
    } catch {}

    // 2. Saved games from localStorage
    const saved = getSavedGames();
    for (const sg of saved) {
      if (seenPdas.has(sg.gamePda)) continue;
      try {
        const gamePda = new PublicKey(sg.gamePda);
        const config = await fetchGameConfig(connection, gamePda);
        if (config) {
          results.push({ gamePda, gameId: sg.gameId, maxPlayers: sg.maxPlayers, config });
          seenPdas.add(sg.gamePda);
        }
      } catch {}
    }

    // 3. Fallback: discover games on-chain via getProgramAccounts
    try {
      const discovered = await discoverGames(connection);
      for (const d of discovered) {
        if (seenPdas.has(d.gamePda.toBase58())) continue;
        results.push({
          gamePda: d.gamePda,
          gameId: d.config.gameId.toString(),
          maxPlayers: d.config.maxPlayers,
          config: d.config,
        });
      }
    } catch {}

    setGames(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  async function handleJoin(game: GameEntry) {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      setError("Please connect your wallet first");
      return;
    }
    setError(null);
    setJoiningId(game.gameId);
    try {
      const walletAdapter = { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction, sendTransaction: wallet.sendTransaction };
      const sessionKey = getOrCreateSessionKey(wallet.publicKey);
      await joinGame(
        walletAdapter,
        game.gamePda,
        sessionKey.publicKey
      );

      // Fund session key for base-layer tx fees
      try {
        await fundSessionKey(walletAdapter, getBaseConnection(), sessionKey);
      } catch (e) {
        console.warn("Session key funding skipped:", e);
      }

      // Save to localStorage
      saveGame(game.gamePda.toBase58(), game.gameId, game.maxPlayers);

      const params = new URLSearchParams({
        game: game.gamePda.toBase58(),
        maxPlayers: game.maxPlayers.toString(),
      });
      router.push(`/game/${game.gameId}?${params.toString()}`);
    } catch (e: unknown) {
      console.error("Join failed:", e);
      setError(e instanceof Error ? e.message : "Failed to join game");
    } finally {
      setJoiningId(null);
    }
  }

  const waitingGames = games.filter((g) => g.config.status === STATUS_LOBBY);
  const activeGames = games.filter((g) => g.config.status === STATUS_ACTIVE);

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
      <main className="relative z-10 flex flex-col items-center min-h-screen px-4 pt-20 pb-12">
        <div className="w-full max-w-2xl">
          {/* Title */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-2xl">{"\u2694"}</span>
            <h1
              className="font-[family-name:var(--font-unifraktur)] text-3xl text-glow-purple"
              style={{ color: "#fff" }}
            >
              Active Games
            </h1>
            <span className="text-2xl">{"\u2694"}</span>
          </div>
          <div className="pixel-separator mx-auto w-48 mb-8" />

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

          {/* Joinable Games */}
          <div className="glass-panel p-6 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h2
                className="text-sm text-glow-purple"
                style={{ color: "var(--primary-light)" }}
              >
                WAITING FOR PLAYERS
              </h2>
              <span className="text-xs" style={{ color: "var(--muted-dark)" }}>
                {waitingGames.length} GAME{waitingGames.length !== 1 ? "S" : ""}
              </span>
            </div>
            <div className="pixel-separator mb-4" />

            {loading ? (
              <div
                className="py-8 text-center text-xs"
                style={{ color: "var(--muted-dark)" }}
              >
                LOADING GAMES...
              </div>
            ) : waitingGames.length === 0 ? (
              <div
                className="py-8 text-center text-xs"
                style={{ color: "var(--muted-dark)" }}
              >
                NO GAMES AVAILABLE — CREATE ONE!
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Table header */}
                <div className="flex items-center px-4 py-1">
                  <span className="text-xs flex-1" style={{ color: "var(--muted-dark)" }}>
                    GAME
                  </span>
                  <span className="text-xs w-24 text-center" style={{ color: "var(--muted-dark)" }}>
                    FEE
                  </span>
                  <span className="text-xs w-24 text-center" style={{ color: "var(--muted-dark)" }}>
                    PLAYERS
                  </span>
                  <span className="w-20" />
                </div>

                {/* Game rows */}
                {waitingGames.map((game) => (
                  <div
                    key={game.gameId}
                    className="flex items-center px-4 py-3"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--background) 60%, transparent)",
                      border: "2px solid var(--border-8bit)",
                    }}
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        #{game.gameId.slice(-6)}
                      </span>
                    </div>
                    <span className="text-xs w-24 text-center" style={{ color: "var(--sol-green)" }}>
                      {(parseInt(game.config.entryFee.toString()) / 1e9).toFixed(2)} SOL
                    </span>
                    <span className="text-xs w-24 text-center" style={{ color: "var(--foreground)" }}>
                      {game.config.currentPlayers}/{game.config.maxPlayers}
                    </span>
                    <div className="w-20 flex justify-end">
                      <PixelButton
                        variant="secondary"
                        size="sm"
                        onClick={() => handleJoin(game)}
                        disabled={joiningId === game.gameId}
                      >
                        {joiningId === game.gameId ? "..." : "JOIN"}
                      </PixelButton>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p
              className="text-xs mt-4 text-center"
              style={{ color: "var(--muted-dark)" }}
            >
              {wallet.publicKey
                ? "REFRESH TO SEE NEW GAMES"
                : "CONNECT WALLET TO JOIN GAMES"}
            </p>
          </div>

          {/* In-Progress Games */}
          <div className="glass-panel p-6 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm" style={{ color: "var(--muted)" }}>
                IN PROGRESS
              </h2>
              <span className="text-xs" style={{ color: "var(--muted-dark)" }}>
                {activeGames.length} GAME{activeGames.length !== 1 ? "S" : ""}
              </span>
            </div>
            <div className="pixel-separator mb-4" />

            {activeGames.length === 0 ? (
              <div
                className="py-4 text-center text-xs"
                style={{ color: "var(--muted-dark)" }}
              >
                NO ACTIVE GAMES
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {activeGames.map((game) => (
                  <div
                    key={game.gameId}
                    className="flex items-center px-4 py-3"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--background) 40%, transparent)",
                      border: "2px solid var(--border-8bit)",
                      opacity: 0.6,
                    }}
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        #{game.gameId.slice(-6)}
                      </span>
                    </div>
                    <span className="text-xs w-24 text-center" style={{ color: "var(--sol-green)" }}>
                      {(parseInt(game.config.entryFee.toString()) / 1e9).toFixed(2)} SOL
                    </span>
                    <span className="text-xs w-24 text-center" style={{ color: "var(--foreground)" }}>
                      {game.config.currentPlayers}/{game.config.maxPlayers}
                    </span>
                    <div className="w-20 flex justify-end">
                      <span className="text-xs" style={{ color: "var(--explosion-red)" }}>
                        LIVE
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Refresh + Create */}
          <div className="flex items-center justify-center gap-4">
            <PixelButton
              variant="outline"
              size="sm"
              onClick={() => fetchGames()}
            >
              REFRESH
            </PixelButton>
            <button
              onClick={() => router.push("/create")}
              className="text-xs tracking-wider hover:opacity-80 transition-opacity"
              style={{ color: "var(--primary-light)" }}
            >
              or CREATE NEW GAME {"\u2192"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
