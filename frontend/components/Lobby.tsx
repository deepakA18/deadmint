"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/ui/PixelButton";

// ─── Steps data ──────────────────────────────────────────────

const STEPS = [
  {
    icon: "\u{1FA99}",
    title: "Wager SOL",
    desc: "Deposit SOL to enter a match.",
    accentColor: "var(--sol-green)",
    glowClass: "text-glow-green",
  },
  {
    icon: "\u{1F4A3}",
    title: "Destroy Blocks",
    desc: "Bomb destructible blocks to reveal hidden SOL loot and powerups.",
    accentColor: "var(--explosion-red)",
    glowClass: "text-glow-red",
  },
  {
    icon: "\u2620",
    title: "Eliminate",
    desc: "Catch enemies in your explosions. Every kill absorbs their SOL.",
    accentColor: "var(--primary-light)",
    glowClass: "text-glow-purple",
  },
  {
    icon: "\u{1F3C6}",
    title: "Win the Pot",
    desc: "Last player standing claims the entire prize pool.",
    accentColor: "var(--loot-gold)",
    glowClass: "text-glow-gold",
  },
];

export function Lobby() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPaused = useRef(false);

  // Auto-rotation
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!isPaused.current) {
        goToStep((prev) => (prev + 1) % STEPS.length);
      }
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const goToStep = useCallback((nextOrFn: number | ((prev: number) => number)) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveStep(nextOrFn);
      setIsTransitioning(false);
    }, 300);
  }, []);

  const handleDotClick = useCallback((index: number) => {
    if (index === activeStep) return;
    goToStep(index);
    // Reset auto-rotation timer
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!isPaused.current) {
        goToStep((prev) => (prev + 1) % STEPS.length);
      }
    }, 4000);
  }, [activeStep, goToStep]);

  const step = STEPS[activeStep];

  return (
    <div className="relative z-10 flex flex-col items-center min-h-screen">
      {/* Hero Section - full viewport */}
      <section className="flex flex-col items-center justify-center min-h-screen w-full px-4">
        {/* Tagline badge */}
        <div
          className="pixel-card mb-8 px-5 py-2 text-sm tracking-wider"
          style={{ color: "var(--primary-light)" }}
        >
          WAGER. BOMB. SURVIVE. WIN.
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
          Bomberman on Solana powered by Magicblock.
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
            TRY FREE
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

      {/* How It Works — Auto-Play Carousel */}
      <section
        id="how-it-works"
        className="w-full max-w-3xl mx-auto px-6 py-16"
        onMouseEnter={() => { isPaused.current = true; }}
        onMouseLeave={() => { isPaused.current = false; }}
      >
        <h2
          className="font-[family-name:var(--font-unifraktur)] text-4xl text-center mb-2 text-glow-purple"
          style={{ color: "#fff" }}
        >
          How It Works
        </h2>
        <div className="pixel-separator mx-auto w-32 mb-10" />

        {/* Carousel card */}
        <div className="relative" style={{ minHeight: 280 }}>
          <div
            className="relative overflow-hidden p-8 sm:p-10 flex flex-col items-center text-center"
            style={{
              opacity: isTransitioning ? 0 : 1,
              transform: isTransitioning ? "translateY(12px)" : "translateY(0)",
              transition: "opacity 0.3s ease, transform 0.3s ease",
            }}
          >
            {/* Step badge */}
            <div
              className="text-xs tracking-[0.3em] mb-6"
              style={{ color: "var(--primary-light)", opacity: 0.7 }}
            >
              STEP {activeStep + 1} OF {STEPS.length}
            </div>

            {/* Icon */}
            <div className="text-5xl sm:text-6xl mb-5">
              {step.icon}
            </div>

            {/* Title */}
            <h3
              className={`text-base sm:text-lg mb-4 ${step.glowClass}`}
              style={{ color: step.accentColor }}
            >
              {step.title}
            </h3>

            {/* Description */}
            <p
              className="text-sm sm:text-base leading-relaxed max-w-md font-[family-name:var(--font-medieval-sharp)]"
              style={{ color: "var(--muted)" }}
            >
              {step.desc}
            </p>

            {/* Corner bracket accents (theme-aware) */}
            <div
              className="absolute top-0 left-0 w-8 h-8"
              style={{
                borderTop: "3px solid var(--primary-light)",
                borderLeft: "3px solid var(--primary-light)",
                opacity: 0.5,
              }}
            />
            <div
              className="absolute top-0 right-0 w-8 h-8"
              style={{
                borderTop: "3px solid var(--primary-light)",
                borderRight: "3px solid var(--primary-light)",
                opacity: 0.5,
              }}
            />
            <div
              className="absolute bottom-0 left-0 w-8 h-8"
              style={{
                borderBottom: "3px solid var(--primary-light)",
                borderLeft: "3px solid var(--primary-light)",
                opacity: 0.5,
              }}
            />
            <div
              className="absolute bottom-0 right-0 w-8 h-8"
              style={{
                borderBottom: "3px solid var(--primary-light)",
                borderRight: "3px solid var(--primary-light)",
                opacity: 0.5,
              }}
            />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6 mx-auto max-w-xs">
          <div
            className="h-0.5 w-full"
            style={{ backgroundColor: "var(--border-8bit)", opacity: 0.3 }}
          >
            <div
              style={{
                height: "100%",
                width: `${((activeStep + 1) / STEPS.length) * 100}%`,
                backgroundColor: "var(--primary)",
                transition: "width 0.5s ease",
                boxShadow: "0 0 8px color-mix(in srgb, var(--primary) 60%, transparent)",
              }}
            />
          </div>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-4 mt-5">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleDotClick(i)}
              className="group relative p-1"
              aria-label={`Go to step ${i + 1}: ${s.title}`}
            >
              <div
                style={{
                  width: i === activeStep ? 28 : 10,
                  height: 10,
                  backgroundColor: i === activeStep ? "var(--primary)" : "transparent",
                  border: `2px solid ${i === activeStep ? "var(--primary)" : "var(--border-8bit)"}`,
                  boxShadow: i === activeStep
                    ? "0 0 10px color-mix(in srgb, var(--primary) 50%, transparent)"
                    : "none",
                  transition: "all 0.3s ease",
                }}
              />
            </button>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-6 text-center">
        <div className="pixel-separator w-full max-w-3xl mx-auto mb-6" />
        <div className="flex items-center justify-center gap-4">
          <span style={{ color: "var(--border-8bit)" }}>|</span>
          <span className="text-xs" style={{ color: "var(--muted-dark)" }}>
            DEADMINT.FUN
          </span>
          <span style={{ color: "var(--border-8bit)" }}>|</span>
        </div>
      </footer>
    </div>
  );
}
