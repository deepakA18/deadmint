"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT } from "@/lib/constants";

interface UsePlayerInputOptions {
  onMove: (direction: number) => void;
  onBomb: () => void;
  enabled: boolean;
}

export function usePlayerInput({ onMove, onBomb, enabled }: UsePlayerInputOptions) {
  const [lastDirection, setLastDirection] = useState(DIR_DOWN);
  const lastActionTime = useRef(0);
  const DEBOUNCE_MS = 100;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const now = Date.now();
      if (now - lastActionTime.current < DEBOUNCE_MS) return;

      let dir = -1;
      switch (e.key.toLowerCase()) {
        case "w":
        case "arrowup":
          dir = DIR_UP;
          break;
        case "s":
        case "arrowdown":
          dir = DIR_DOWN;
          break;
        case "a":
        case "arrowleft":
          dir = DIR_LEFT;
          break;
        case "d":
        case "arrowright":
          dir = DIR_RIGHT;
          break;
        case " ":
          e.preventDefault();
          lastActionTime.current = now;
          onBomb();
          return;
      }

      if (dir >= 0) {
        e.preventDefault();
        lastActionTime.current = now;
        setLastDirection(dir);
        onMove(dir);
      }
    },
    [enabled, onMove, onBomb]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return { lastDirection };
}
