"use client";

import { useRouter } from "next/navigation";
import { GraveyardBackground } from "@/components/GraveyardBackground";
import { ThemeSelector } from "@/components/ThemeSelector";
import { WalletButton } from "@/components/WalletButton";
import { PixelButton } from "@/components/ui/PixelButton";

// Mock active games — will be replaced with on-chain data
const MOCK_GAMES = [
  { id: 1, fee: 0.05, players: 2, maxPlayers: 4, status: "waiting" as const },
  { id: 2, fee: 0.1, players: 3, maxPlayers: 4, status: "waiting" as const },
  { id: 3, fee: 0.01, players: 1, maxPlayers: 4, status: "waiting" as const },
  { id: 4, fee: 0.25, players: 4, maxPlayers: 4, status: "active" as const },
  { id: 5, fee: 0.05, players: 2, maxPlayers: 2, status: "active" as const },
];

export default function GamesPage() {
  const router = useRouter();

  const waitingGames = MOCK_GAMES.filter((g) => g.status === "waiting");
  const activeGames = MOCK_GAMES.filter((g) => g.status === "active");

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

            {waitingGames.length === 0 ? (
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
                  <span
                    className="text-xs flex-1"
                    style={{ color: "var(--muted-dark)" }}
                  >
                    GAME
                  </span>
                  <span
                    className="text-xs w-24 text-center"
                    style={{ color: "var(--muted-dark)" }}
                  >
                    FEE
                  </span>
                  <span
                    className="text-xs w-24 text-center"
                    style={{ color: "var(--muted-dark)" }}
                  >
                    PLAYERS
                  </span>
                  <span className="w-20" />
                </div>

                {/* Game rows */}
                {waitingGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center px-4 py-3"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--background) 60%, transparent)",
                      border: "2px solid var(--border-8bit)",
                    }}
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        #{game.id}
                      </span>
                    </div>
                    <span
                      className="text-xs w-24 text-center"
                      style={{ color: "var(--sol-green)" }}
                    >
                      {game.fee} SOL
                    </span>
                    <span
                      className="text-xs w-24 text-center"
                      style={{ color: "var(--foreground)" }}
                    >
                      {game.players}/{game.maxPlayers}
                    </span>
                    <div className="w-20 flex justify-end">
                      <PixelButton variant="secondary" size="sm">
                        JOIN
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
              CONNECT WALLET TO JOIN GAMES
            </p>
          </div>

          {/* In-Progress Games */}
          <div className="glass-panel p-6 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h2
                className="text-sm"
                style={{ color: "var(--muted)" }}
              >
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
                    key={game.id}
                    className="flex items-center px-4 py-3"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--background) 40%, transparent)",
                      border: "2px solid var(--border-8bit)",
                      opacity: 0.6,
                    }}
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        #{game.id}
                      </span>
                    </div>
                    <span
                      className="text-xs w-24 text-center"
                      style={{ color: "var(--sol-green)" }}
                    >
                      {game.fee} SOL
                    </span>
                    <span
                      className="text-xs w-24 text-center"
                      style={{ color: "var(--foreground)" }}
                    >
                      {game.players}/{game.maxPlayers}
                    </span>
                    <div className="w-20 flex justify-end">
                      <span
                        className="text-xs"
                        style={{ color: "var(--explosion-red)" }}
                      >
                        LIVE
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Link to create */}
          <div className="text-center">
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
