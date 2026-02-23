"use client";

import { PLAYER_COLORS, PLAYER_NAMES, STATUS_ACTIVE } from "@/lib/constants";
import type { FullGameState } from "@/lib/types";

interface GameHUDProps {
  gameState: FullGameState;
  localPlayerIndex: number;
}

export function GameHUD({
  gameState,
  localPlayerIndex,
}: GameHUDProps) {
  const { config, players } = gameState;
  const prizePool = parseInt(config.prizePool.toString()) / 1e9;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Stats Bar - stacked to fit sidebar */}
      <div className="pixel-card px-3 py-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
              PRIZE
            </span>
            <span
              className="text-xs text-glow-green"
              style={{ color: "var(--sol-green)" }}
            >
              {prizePool.toFixed(2)} SOL
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
              STATUS
            </span>
            <span
              className="text-[10px]"
              style={{
                color:
                  config.status === STATUS_ACTIVE ? "var(--sol-green)" : "var(--loot-gold)",
              }}
            >
              {config.status === STATUS_ACTIVE ? "ACTIVE" : "ENDED"}
            </span>
          </div>
        </div>
      </div>

      {/* Player Stats */}
      <div className="flex flex-col gap-2">
        {players.map((p, i) => (
          <div
            key={i}
            className={`pixel-card px-3 py-2 ${!p.alive ? "opacity-40" : ""}`}
            style={{
              borderColor:
                i === localPlayerIndex ? "var(--primary)" : undefined,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2.5 h-2.5"
                style={{ backgroundColor: PLAYER_COLORS[i] }}
              />
              <span
                className="text-[10px] flex-1 truncate"
                style={{ color: PLAYER_COLORS[i] }}
              >
                {PLAYER_NAMES[i]}
                {i === localPlayerIndex ? " (YOU)" : ""}
              </span>
              {!p.alive && (
                <span className="text-[10px] flex-shrink-0" style={{ color: "var(--explosion-red)" }}>
                  DEAD
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "var(--sol-green)" }}>
                {(parseInt(p.collectedSol.toString()) / 1e9).toFixed(3)}
              </span>
              <span className="text-[10px]" style={{ color: "var(--loot-gold)" }}>
                {p.kills}K
              </span>
            </div>
            {/* Powerup indicators */}
            {(p.bombRange > 1 || p.maxBombs > 1 || p.speed > 1) && (
              <div className="flex gap-1 mt-1">
                {p.bombRange > 1 && (
                  <span
                    className="text-[10px] px-1"
                    style={{
                      backgroundColor: "rgba(231,76,60,0.3)",
                      color: "var(--explosion-red)",
                      border: "1px solid var(--explosion-red)",
                    }}
                  >
                    R{p.bombRange}
                  </span>
                )}
                {p.maxBombs > 1 && (
                  <span
                    className="text-[10px] px-1"
                    style={{
                      backgroundColor: "rgba(52,152,219,0.3)",
                      color: "#3498db",
                      border: "1px solid #3498db",
                    }}
                  >
                    B{p.maxBombs}
                  </span>
                )}
                {p.speed > 1 && (
                  <span
                    className="text-[10px] px-1"
                    style={{
                      backgroundColor: "rgba(22,199,132,0.3)",
                      color: "var(--sol-green)",
                      border: "1px solid var(--sol-green)",
                    }}
                  >
                    S{p.speed}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div className="text-center text-[10px] leading-relaxed" style={{ color: "var(--muted-dark)" }}>
        WASD MOVE<br />SPACE BOMB
      </div>
    </div>
  );
}
