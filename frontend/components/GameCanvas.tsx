"use client";

import { useRef, useEffect } from "react";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/constants";
import { initTileCache, resetTileCache, renderFrame } from "@/lib/gameRenderer";
import { useTheme } from "@/providers/ThemeProvider";
import type { FullGameState } from "@/lib/types";

interface GameCanvasProps {
  gameState: FullGameState;
  localPlayerIndex: number;
  playerFacings: number[];
}

export function GameCanvas({
  gameState,
  localPlayerIndex,
  playerFacings,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const { activeTheme } = useTheme();

  useEffect(() => {
    initTileCache();
  }, []);

  // Re-build tile cache when theme changes
  useEffect(() => {
    resetTileCache();
    initTileCache();
  }, [activeTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      frameRef.current++;
      renderFrame(ctx, gameState, localPlayerIndex, frameRef.current, playerFacings);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, localPlayerIndex, playerFacings]);

  return (
    <div className="stone-border inline-block">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
      />
    </div>
  );
}
