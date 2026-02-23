"use client";

import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/ui/PixelButton";

export function Lobby() {
  const router = useRouter();

  return (
    <div className="relative z-10 flex flex-col items-center min-h-screen">
      {/* Hero Section - full viewport */}
      <section className="flex flex-col items-center justify-center min-h-screen w-full px-4">
        {/* Hackathon badge */}
        <div
          className="pixel-card mb-8 px-5 py-2 text-sm tracking-wider"
          style={{ color: "var(--primary-light)" }}
        >
          GRAVEYARD HACKATHON 2026
        </div>

        {/* Title */}
        <h1
          className="font-[family-name:var(--font-unifraktur)] text-7xl sm:text-8xl md:text-9xl text-center leading-none mb-4"
          style={{
            color: "#fff",
            animation: "title-glow 4s ease-in-out infinite",
          }}
        >
          Deadmint
        </h1>

        {/* Subtitle */}
        <p
          className="font-[family-name:var(--font-medieval-sharp)] text-lg md:text-xl text-center max-w-xl mb-2"
          style={{
            color: "var(--primary-light)",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          Financialized Bomberman on Solana.
        </p>
        <p
          className="text-sm text-center max-w-lg mb-10"
          style={{
            color: "var(--muted-dark)",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          Wager SOL. Destroy blocks. Bomb opponents. Win the pot.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
          <PixelButton
            variant="primary"
            size="lg"
            onClick={() => router.push("/create")}
            style={{ animation: "pulse-glow 2.5s ease-in-out infinite" }}
          >
            {"\u2620"} CREATE GAME {"\u2620"}
          </PixelButton>
          <PixelButton
            variant="outline"
            size="lg"
            onClick={() => router.push("/games")}
          >
            {"\u2694"} BROWSE GAMES
          </PixelButton>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
          <PixelButton
            variant="secondary"
            size="lg"
            onClick={() => router.push("/game/demo")}
          >
            PLAY DEMO
          </PixelButton>
          <PixelButton
            variant="outline"
            size="lg"
            onClick={() => {
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            HOW IT WORKS {"\u2193"}
          </PixelButton>
        </div>

        {/* No wallet note */}
        <p
          className="text-xs tracking-widest"
          style={{
            color: "var(--muted-dark)",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}
        >
          NO WALLET NEEDED FOR DEMO
        </p>

        {/* Scroll indicator */}
        <div
          className="absolute bottom-8"
          style={{ animation: "float 2s ease-in-out infinite" }}
        >
          <div
            className="w-4 h-7 flex items-start justify-center pt-1.5"
            style={{ border: "2px solid color-mix(in srgb, var(--primary-light) 30%, transparent)" }}
          >
            <div
              className="w-1 h-1.5"
              style={{
                backgroundColor: "var(--primary-light)",
                animation: "scroll-dot 1.5s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </section>

      {/* Pixel separator */}
      <div className="pixel-separator-purple w-full max-w-3xl mx-auto" />

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="w-full max-w-3xl mx-auto px-6 py-16"
      >
        <div className="glass-panel p-8">
          <h2
            className="font-[family-name:var(--font-unifraktur)] text-4xl text-center mb-2 text-glow-purple"
            style={{ color: "#fff" }}
          >
            How It Works
          </h2>
          <div className="pixel-separator mx-auto w-32 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: "\u{1FA99}",
                title: "1. Wager SOL",
                desc: "Deposit SOL to enter a match. Prize pool = all entry fees combined.",
              },
              {
                icon: "\u{1F4A3}",
                title: "2. Destroy Blocks",
                desc: "Bomb destructible blocks to reveal SOL loot and powerups.",
              },
              {
                icon: "\u2620",
                title: "3. Eliminate",
                desc: "Catch enemies in your explosions. Kill = absorb their SOL.",
              },
              {
                icon: "\u{1F3C6}",
                title: "4. Win the Pot",
                desc: "Last standing claims the prize pool (minus 3% fee).",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="flex gap-4 items-start p-3"
                style={{
                  borderLeft: "3px solid color-mix(in srgb, var(--primary) 30%, transparent)",
                }}
              >
                <span className="text-2xl flex-shrink-0">{step.icon}</span>
                <div>
                  <h4
                    className="text-sm mb-1.5"
                    style={{ color: "var(--foreground)" }}
                  >
                    {step.title}
                  </h4>
                  <p
                    className="text-xs leading-relaxed font-[family-name:var(--font-medieval-sharp)]"
                    style={{ color: "var(--muted-dark)" }}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-6 text-center">
        <div className="pixel-separator w-full max-w-3xl mx-auto mb-6" />
        <div className="flex items-center justify-center gap-4">
          <span className="text-xs" style={{ color: "var(--muted-dark)" }}>
            BUILT ON SOLANA WITH ANCHOR
          </span>
          <span style={{ color: "var(--border-8bit)" }}>|</span>
          <span className="text-xs" style={{ color: "var(--muted-dark)" }}>
            GRAVEYARD HACKATHON 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
