"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { PLAYER_COLORS, PLAYER_NAMES, STATUS_CLAIMED } from "@/lib/constants";
import { PixelButton } from "@/components/ui/PixelButton";
import * as gameService from "@/lib/gameService";
import type { FullGameState } from "@/lib/types";

interface GameOverModalProps {
  gameState: FullGameState;
  localPlayerIndex: number;
  gamePda?: PublicKey;
  wallet?: gameService.WalletAdapter;
}

export function GameOverModal({
  gameState,
  localPlayerIndex,
  gamePda,
  wallet,
}: GameOverModalProps) {
  const router = useRouter();
  const { players, config } = gameState;
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(config.status >= STATUS_CLAIMED);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Find winner (last alive or most SOL)
  const alive = players.filter((p) => p.alive);
  const winnerIdx =
    alive.length === 1
      ? alive[0].playerIndex
      : [...players]
          .sort(
            (a, b) =>
              parseInt(b.collectedSol.toString()) -
              parseInt(a.collectedSol.toString())
          )[0].playerIndex;

  const isLocalWinner = winnerIdx === localPlayerIndex;
  const prizePool = parseInt(config.prizePool.toString()) / 1e9;
  const fee = prizePool * (config.platformFeeBps / 10_000);
  const payout = prizePool - fee;

  const canClaim = isLocalWinner && !claimed && !claiming && !!gamePda && !!wallet && prizePool > 0;

  async function handleClaim() {
    if (!gamePda || !wallet) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const [playerPda] = gameService.derivePlayerPda(gamePda, localPlayerIndex);
      await gameService.claimPrize(wallet, gamePda, playerPda);
      setClaimed(true);
    } catch (e: any) {
      const msg = e?.message || "Claim failed";
      if (msg.includes("AlreadyClaimed")) {
        setClaimed(true);
      } else {
        setClaimError(msg.length > 60 ? msg.slice(0, 60) + "..." : msg);
      }
    } finally {
      setClaiming(false);
    }
  }

  // Sort players by performance
  const sorted = [...players].sort((a, b) => {
    if (a.playerIndex === winnerIdx) return -1;
    if (b.playerIndex === winnerIdx) return 1;
    return (
      parseInt(b.collectedSol.toString()) -
      parseInt(a.collectedSol.toString())
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        className="pixel-card-glow relative z-10 p-8 max-w-md w-full mx-4"
        style={{ animation: "fade-in-up 0.5s ease-out" }}
      >
        {/* Title */}
        <h2
          className="font-[family-name:var(--font-unifraktur)] text-4xl text-center mb-1 text-glow-red"
          style={{ color: "var(--explosion-red)" }}
        >
          Game Over
        </h2>
        <div className="pixel-separator mx-auto w-32 mb-6" />

        {/* Winner announcement */}
        <div className="text-center mb-6">
          <div
            className="text-4xl mb-2"
            style={{
              filter: `drop-shadow(0 0 10px ${PLAYER_COLORS[winnerIdx]})`,
            }}
          >
            {"\u2620"}
          </div>
          <p
            className="text-base mb-1"
            style={{ color: PLAYER_COLORS[winnerIdx] }}
          >
            {PLAYER_NAMES[winnerIdx]} WINS!
          </p>
          {isLocalWinner && (
            <p
              className="text-sm text-glow-gold"
              style={{ color: "var(--loot-gold)" }}
            >
              {claimed
                ? `CLAIMED ${payout.toFixed(3)} SOL!`
                : `THAT\u0027S YOU! PRIZE: ${payout.toFixed(3)} SOL`}
            </p>
          )}
        </div>

        {/* Final standings */}
        <div className="mb-6">
          <h3 className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            FINAL STANDINGS
          </h3>
          <div className="pixel-separator mb-2" />
          <div className="flex flex-col gap-1">
            {sorted.map((p, rank) => (
              <div
                key={p.playerIndex}
                className="flex items-center gap-3 px-3 py-1.5"
                style={{
                  backgroundColor:
                    rank === 0 ? "rgba(243,156,18,0.1)" : "transparent",
                  borderLeft:
                    rank === 0
                      ? "3px solid var(--loot-gold)"
                      : "3px solid transparent",
                }}
              >
                <span
                  className="text-xs w-5"
                  style={{
                    color: rank === 0 ? "var(--loot-gold)" : "var(--muted-dark)",
                  }}
                >
                  #{rank + 1}
                </span>
                <div
                  className="w-2.5 h-2.5"
                  style={{
                    backgroundColor: PLAYER_COLORS[p.playerIndex],
                  }}
                />
                <span
                  className="text-sm flex-1"
                  style={{ color: PLAYER_COLORS[p.playerIndex] }}
                >
                  {PLAYER_NAMES[p.playerIndex]}
                  {p.playerIndex === localPlayerIndex ? " (YOU)" : ""}
                </span>
                <span className="text-xs" style={{ color: "var(--sol-green)" }}>
                  {(parseInt(p.collectedSol.toString()) / 1e9).toFixed(3)}
                </span>
                <span className="text-xs" style={{ color: "var(--loot-gold)" }}>
                  {p.kills}K
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Claim Prize */}
        {canClaim && (
          <div className="mb-4 flex justify-center">
            <PixelButton variant="primary" onClick={handleClaim}>
              {claiming ? "CLAIMING..." : `CLAIM ${payout.toFixed(3)} SOL`}
            </PixelButton>
          </div>
        )}
        {claimed && isLocalWinner && (
          <p className="text-center text-xs mb-4" style={{ color: "var(--sol-green)" }}>
            PRIZE CLAIMED SUCCESSFULLY
          </p>
        )}
        {claimError && (
          <p className="text-center text-xs mb-4" style={{ color: "var(--explosion-red)" }}>
            {claimError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <PixelButton
            variant="primary"
            onClick={() => { window.location.href = "/game/demo"; }}
          >
            PLAY AGAIN
          </PixelButton>
          <PixelButton
            variant="secondary"
            onClick={() => router.push("/")}
          >
            LOBBY
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
