"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getOrCreateSessionKey } from "@/lib/sessionKey";
import { useWallet } from "@solana/wallet-adapter-react";
import { GameCanvas } from "@/components/GameCanvas";
import { GameHUD } from "@/components/GameHUD";
import { Leaderboard } from "@/components/Leaderboard";
import { GameOverModal } from "@/components/GameOverModal";
import { ThemeSelector } from "@/components/ThemeSelector";
import { WalletButton } from "@/components/WalletButton";
import { useGameState } from "@/hooks/useGameState";
import type { LiveModeConfig } from "@/hooks/useGameState";
import { usePlayerInput } from "@/hooks/usePlayerInput";
import {
  STATUS_ACTIVE,
  STATUS_FINISHED,
  STATUS_LOBBY,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/lib/constants";
import { deriveGamePda } from "@/lib/gameService";
import { loadSession, saveSession, type GameSession } from "@/lib/gameSession";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = useWallet();
  const isDemo = params.id === "demo";
  const gameId = params.id as string;

  // ─── Live mode session ────────────────────────────────────
  const [session, setSession] = useState<GameSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(!isDemo);

  useEffect(() => {
    if (isDemo) return;

    // Try loading from localStorage first
    let s = loadSession(gameId);

    // If we have URL params (from create/join flow), use those
    const gameParam = searchParams.get("game");
    const maxPlayersParam = searchParams.get("maxPlayers");

    if (gameParam) {
      s = {
        gamePda: gameParam,
        gameId,
        maxPlayers: maxPlayersParam ? parseInt(maxPlayersParam) : 4,
      };
      saveSession(s);
    }

    // If no session at all, try to derive the game PDA from the gameId
    if (!s) {
      try {
        const gameIdBn = new BN(gameId);
        const [gamePda] = deriveGamePda(gameIdBn);
        s = {
          gamePda: gamePda.toBase58(),
          gameId,
          maxPlayers: 4, // default, will be updated from on-chain data
        };
      } catch {
        // gameId may not be a valid BN — stay null
      }
    }

    setSession(s);
    setSessionLoading(false);
  }, [isDemo, gameId, searchParams]);

  // Load session key for zero-popup gameplay (per-wallet)
  const sessionKey = useMemo<Keypair | null>(() => {
    if (isDemo || !wallet.publicKey) return null;
    try {
      return getOrCreateSessionKey(wallet.publicKey);
    } catch {
      return null;
    }
  }, [isDemo, wallet.publicKey]);

  // Build liveConfig from session
  const liveConfig = useMemo<LiveModeConfig | undefined>(() => {
    if (isDemo || !session || !wallet.publicKey || !wallet.sendTransaction) return undefined;

    return {
      gamePda: new PublicKey(session.gamePda),
      maxPlayers: session.maxPlayers,
      wallet: {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        sendTransaction: wallet.sendTransaction,
      },
      sessionKey: sessionKey || undefined,
    };
  }, [isDemo, session, wallet.publicKey, wallet.signTransaction, wallet.sendTransaction, sessionKey]);

  const { gameState, localPlayerIndex, movePlayer, placeBomb, isLoading, isLocalPlayerDead } =
    useGameState({
      mode: isDemo ? "mock" : "live",
      liveConfig,
    });

  // Update session maxPlayers from on-chain data once we have it
  useEffect(() => {
    if (session && gameState && gameState.config.maxPlayers !== session.maxPlayers) {
      const updated = { ...session, maxPlayers: gameState.config.maxPlayers };
      setSession(updated);
      saveSession(updated);
    }
  }, [gameState?.config.maxPlayers]);

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

  // Auto-scale canvas to fill viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const computeScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
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

  // ─── Lobby UI (live mode, waiting for players) ────────────

  if (!isDemo && gameState && gameState.config.status === STATUS_LOBBY) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6">
        <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/games")}
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

        <div
          className="text-6xl"
          style={{
            animation: "float 2s ease-in-out infinite",
            filter: "drop-shadow(0 0 20px color-mix(in srgb, var(--primary) 50%, transparent))",
          }}
        >
          {"\u2694"}
        </div>
        <h2
          className="font-[family-name:var(--font-unifraktur)] text-3xl text-glow-purple"
          style={{ color: "#fff" }}
        >
          Waiting for Players
        </h2>
        <div className="glass-panel p-6 text-center">
          <p className="text-lg mb-2" style={{ color: "var(--foreground)" }}>
            {gameState.config.currentPlayers} / {gameState.config.maxPlayers}
          </p>
          <div className="flex gap-2 justify-center mb-4">
            {Array.from({ length: gameState.config.maxPlayers }).map((_, i) => (
              <div
                key={i}
                className="w-4 h-4"
                style={{
                  backgroundColor:
                    i < gameState.config.currentPlayers
                      ? ["#e74c3c", "#3498db", "#16c784", "#f1c40f"][i]
                      : "var(--border-8bit)",
                  transition: "background-color 0.3s",
                }}
              />
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--muted-dark)" }}>
            GAME STARTS WHEN LOBBY IS FULL
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--sol-green)" }}>
            ENTRY FEE: {(parseInt(gameState.config.entryFee.toString()) / 1e9).toFixed(2)} SOL
          </p>
        </div>

        {/* Share link */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
          }}
          className="text-xs tracking-wider hover:opacity-80 transition-opacity"
          style={{ color: "var(--primary-light)" }}
        >
          COPY GAME LINK TO SHARE
        </button>
      </div>
    );
  }

  // ─── Loading screen ─────────────────────────────────────

  if (isLoading || sessionLoading || !gameState) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        {!isDemo && !wallet.publicKey ? (
          <>
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
              Connect wallet to play
            </p>
            <WalletButton />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    );
  }

  // ─── Active game UI ─────────────────────────────────────

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
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="w-8 h-8" />
          <h1
            className="font-[family-name:var(--font-unifraktur)] text-xl text-glow-purple"
            style={{ color: "var(--primary)" }}
          >
            Deadmint
          </h1>
        </div>

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
        </div>

        <div className="flex items-center gap-2">
          <ThemeSelector />
          {!isDemo && <WalletButton />}
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
            width: "240px",
            borderRight: "3px solid var(--border-8bit)",
          }}
        >
          <GameHUD
            gameState={gameState}
            localPlayerIndex={localPlayerIndex}
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
          className="hidden lg:flex flex-col p-3 flex-shrink-0 overflow-hidden"
          style={{
            width: "240px",
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
          WASD / ARROWS MOVE &bull; SPACE BOMB
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

      {/* You Died overlay (player dead but game still active) */}
      {isLocalPlayerDead && gameState.config.status === STATUS_ACTIVE && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className="text-center pointer-events-auto p-8"
            style={{
              background: "color-mix(in srgb, var(--background) 85%, transparent)",
              border: "3px solid var(--explosion-red)",
            }}
          >
            <div className="text-6xl mb-4">{"\u2620"}</div>
            <h2
              className="font-[family-name:var(--font-unifraktur)] text-4xl mb-2"
              style={{ color: "var(--explosion-red)" }}
            >
              YOU DIED
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
              SPECTATING UNTIL GAME ENDS
            </p>
            <button
              onClick={() => router.push("/games")}
              className="px-4 py-2 text-xs"
              style={{
                backgroundColor: "var(--panel-light)",
                border: "2px solid var(--border-8bit)",
                color: "var(--muted)",
              }}
            >
              LEAVE GAME
            </button>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState.config.status >= STATUS_FINISHED && (
        <GameOverModal
          gameState={gameState}
          localPlayerIndex={localPlayerIndex}
          gamePda={liveConfig?.gamePda}
          wallet={liveConfig?.wallet as any}
        />
      )}
    </div>
  );
}
