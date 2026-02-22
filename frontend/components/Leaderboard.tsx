"use client";

import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/constants";
import type { PlayerState } from "@/lib/types";

interface LeaderboardProps {
  players: PlayerState[];
}

export function Leaderboard({ players }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => {
    if (a.alive && !b.alive) return -1;
    if (!a.alive && b.alive) return 1;
    const aSOL = parseInt(a.collectedSol.toString());
    const bSOL = parseInt(b.collectedSol.toString());
    return bSOL - aSOL;
  });

  return (
    <div className="pixel-card p-3 w-48">
      <h3
        className="text-sm mb-1 text-center text-glow-purple"
        style={{ color: "var(--primary-light)" }}
      >
        LEADERBOARD
      </h3>
      <div className="pixel-separator mb-3" />
      <div className="flex flex-col gap-1.5">
        {sorted.map((p, rank) => (
          <div
            key={p.playerIndex}
            className={`flex items-center gap-2 px-2 py-1 ${
              !p.alive ? "opacity-40" : ""
            }`}
            style={{
              backgroundColor:
                rank === 0 ? "rgba(243,156,18,0.1)" : "transparent",
              borderLeft:
                rank === 0
                  ? "2px solid var(--loot-gold)"
                  : "2px solid transparent",
            }}
          >
            <span
              className="text-xs w-4"
              style={{ color: rank === 0 ? "var(--loot-gold)" : "var(--muted-dark)" }}
            >
              {rank === 0 ? "\u265A" : `${rank + 1}`}
            </span>
            <div
              className="w-2 h-2 flex-shrink-0"
              style={{ backgroundColor: PLAYER_COLORS[p.playerIndex] }}
            />
            <span
              className="text-xs flex-1"
              style={{ color: PLAYER_COLORS[p.playerIndex] }}
            >
              {PLAYER_NAMES[p.playerIndex]}
            </span>
            <span className="text-xs" style={{ color: "var(--sol-green)" }}>
              {(parseInt(p.collectedSol.toString()) / 1e9).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
