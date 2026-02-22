"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { GameCanvas } from "@/components/GameCanvas";
import { GameHUD } from "@/components/GameHUD";
import { Leaderboard } from "@/components/Leaderboard";
import { GameOverModal } from "@/components/GameOverModal";
import { ThemeSelector } from "@/components/ThemeSelector";
import { useGameState } from "@/hooks/useGameState";
import { usePlayerInput } from "@/hooks/usePlayerInput";
import {
  STATUS_ACTIVE,
  STATUS_FINISHED,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/lib/constants";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const isDemo = params.id === "demo";

  const { gameState, localPlayerIndex, movePlayer, placeBomb, isLoading } =
    useGameState({
      mode: isDemo ? "mock" : "live",
    });

  const { lastDirection } = usePlayerInput({
    onMove: movePlayer,
    onBomb: placeBomb,
    enabled: gameState?.config.status === STATUS_ACTIVE,
  });

  // Track all player facings (local from input, others default to down)
  const [playerFacings, setPlayerFacings] = useState([1, 1, 1, 1]);
  useEffect(() => {
    setPlayerFacings((prev) => {
      const next = [...prev];
      next[localPlayerIndex] = lastDirection;
      return next;
    });
  }, [lastDirection, localPlayerIndex]);

  // Timer countdown
  const [timeLeft, setTimeLeft] = useState(180);
  useEffect(() => {
    if (!gameState || gameState.config.status !== STATUS_ACTIVE) return;
    const interval = setInterval(() => {
      const startedAt = parseInt(gameState.config.startedAt.toString());
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - startedAt;
      const remaining = Math.max(0, gameState.config.roundDuration - elapsed);
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState?.config.status, gameState?.config.startedAt]);

  // Auto-scale canvas to fill viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const computeScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Leave some padding for HUD elements
    const availW = rect.width - 32;
    const availH = rect.height - 16;
    const scaleX = availW / CANVAS_WIDTH;
    const scaleY = availH / CANVAS_HEIGHT;
    setScale(Math.min(scaleX, scaleY, 2.5));
  }, []);

  useEffect(() => {
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, [computeScale]);

  // Loading screen
  if (isLoading || !gameState) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <div
          className="text-6xl"
          style={{
            animation: "float 2s ease-in-out infinite",
            filter: "drop-shadow(0 0 20px color-mix(in srgb, var(--primary) 50%, transparent))",
          }}
        >
          {"\u2620"}
        </div>
        <p
          className="font-[family-name:var(--font-medieval-sharp)] text-lg"
          style={{ color: "var(--primary-light)" }}
        >
          Summoning the dead...
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Compact Header */}
      <header
        className="flex items-center justify-between px-4 py-1.5 flex-shrink-0"
        style={{
          borderBottom: "3px solid var(--border-8bit)",
          background: "var(--panel)",
        }}
      >
        <h1
          className="font-[family-name:var(--font-unifraktur)] text-xl text-glow-purple"
          style={{ color: "var(--primary)" }}
        >
          Deadmint
        </h1>

        {/* Inline stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              PRIZE
            </span>
            <span
              className="text-sm text-glow-green"
              style={{ color: "var(--sol-green)" }}
            >
              {(
                parseInt(gameState.config.prizePool.toString()) / 1e9
              ).toFixed(2)}{" "}
              SOL
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              TIME
            </span>
            <span
              className={`text-sm ${
                timeLeft < 30 ? "text-glow-red" : ""
              }`}
              style={{ color: timeLeft < 30 ? "var(--explosion-red)" : "var(--foreground)" }}
            >
              {Math.floor(timeLeft / 60)}:
              {(timeLeft % 60).toString().padStart(2, "0")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSelector />
          <button
            onClick={() => router.push("/")}
            className="px-3 py-1 text-xs transition-all hover:brightness-125 active:translate-y-0.5"
            style={{
              backgroundColor: "var(--panel-light)",
              border: "2px solid var(--border-8bit)",
              color: "var(--muted)",
            }}
          >
            LEAVE
          </button>
        </div>
      </header>

      {/* Main game area - fills remaining space */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar - player stats */}
        <aside
          className="hidden xl:flex flex-col gap-2 p-3 flex-shrink-0"
          style={{
            width: "200px",
            borderRight: "3px solid var(--border-8bit)",
          }}
        >
          <GameHUD
            gameState={gameState}
            localPlayerIndex={localPlayerIndex}
            timeLeft={timeLeft}
          />
        </aside>

        {/* Center - Scaled Canvas */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center min-h-0 min-w-0"
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            <GameCanvas
              gameState={gameState}
              localPlayerIndex={localPlayerIndex}
              playerFacings={playerFacings}
            />
          </div>
        </div>

        {/* Right sidebar - leaderboard */}
        <aside
          className="hidden lg:flex flex-col p-3 flex-shrink-0"
          style={{
            width: "200px",
            borderLeft: "3px solid var(--border-8bit)",
          }}
        >
          <Leaderboard players={gameState.players} />
        </aside>
      </div>

      {/* Bottom bar - controls + mobile info */}
      <footer
        className="flex items-center justify-between px-4 py-1.5 flex-shrink-0"
        style={{
          borderTop: "3px solid var(--border-8bit)",
          background: "var(--panel)",
        }}
      >
        <div className="text-xs" style={{ color: "var(--muted-dark)" }}>
          WASD MOVE &bull; SPACE BOMB
        </div>

        {/* Mobile player stats inline */}
        <div className="flex xl:hidden items-center gap-3">
          {gameState.players.map((p, i) => (
            <div key={i} className="flex items-center gap-1">
              <div
                className="w-2 h-2"
                style={{
                  backgroundColor: p.alive
                    ? ["#e74c3c", "#3498db", "#16c784", "#f1c40f"][i]
                    : "var(--border-8bit)",
                }}
              />
              <span
                className="text-xs"
                style={{ color: p.alive ? "var(--muted)" : "var(--border-8bit)" }}
              >
                {(parseInt(p.collectedSol.toString()) / 1e9).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div
          className="text-xs"
          style={{
            color:
              gameState.config.status === STATUS_ACTIVE ? "var(--sol-green)" : "var(--loot-gold)",
          }}
        >
          {gameState.config.status === STATUS_ACTIVE ? "LIVE" : "ENDED"}
        </div>
      </footer>

      {/* Game Over Modal */}
      {gameState.config.status >= STATUS_FINISHED && (
        <GameOverModal
          gameState={gameState}
          localPlayerIndex={localPlayerIndex}
        />
      )}
    </div>
  );
}
