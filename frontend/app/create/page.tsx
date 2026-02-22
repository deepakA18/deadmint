"use client";

import { useRouter } from "next/navigation";
import { GraveyardBackground } from "@/components/GraveyardBackground";
import { ThemeSelector } from "@/components/ThemeSelector";
import { WalletButton } from "@/components/WalletButton";
import { PixelButton } from "@/components/ui/PixelButton";

export default function CreateGamePage() {
  const router = useRouter();

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
                defaultValue="0.05"
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
                  className="flex-1 py-3 text-sm text-center transition-colors"
                  style={{
                    backgroundColor:
                      n === 4 ? "var(--primary-dark)" : "var(--background)",
                    border: `3px solid ${n === 4 ? "var(--primary)" : "var(--border-8bit)"}`,
                    color:
                      n === 4 ? "var(--foreground)" : "var(--muted-dark)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Round Duration */}
          <div className="mb-8">
            <label
              className="block text-xs mb-2"
              style={{ color: "var(--muted)" }}
            >
              ROUND DURATION
            </label>
            <div
              className="px-4 py-3 text-sm"
              style={{
                backgroundColor: "var(--background)",
                border: "3px solid var(--border-8bit)",
                color: "var(--muted-dark)",
              }}
            >
              120 SECONDS
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
              0.20 SOL
            </span>
            <span className="text-xs block mt-1" style={{ color: "var(--muted-dark)" }}>
              (4 × 0.05 SOL)
            </span>
          </div>

          {/* Create Button */}
          <PixelButton
            variant="primary"
            size="lg"
            className="w-full"
          >
            {"\u2620"} CREATE GAME {"\u2620"}
          </PixelButton>

          <p
            className="text-xs mt-4 text-center"
            style={{ color: "var(--muted-dark)" }}
          >
            REQUIRES WALLET CONNECTION
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
