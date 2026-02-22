"use client";

import { useRef, useEffect } from "react";

// Full-viewport wide atmospheric Bomberman background
export function GraveyardBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Wide canvas — pixelated scaling handles the rest
    const W = 640;
    const H = 360;
    canvas.width = W;
    canvas.height = H;

    function px(x: number, y: number, color: string) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }

    function rect(x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }

    // ─── Tile size for the subtle background grid ───
    const T = 10;

    // Tile the entire canvas with a subtle bomberman-style grid
    const cols = Math.ceil(W / T);
    const rows = Math.ceil(H / T);

    // Pre-generate which cells are walls/blocks (sparse, atmospheric)
    const cells: number[] = []; // 0=floor, 1=wall, 2=block
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        // Indestructible pillars in classic bomberman pattern (even x, even y)
        if (gx % 2 === 0 && gy % 2 === 0) {
          cells.push(1);
        } else {
          // Sparse blocks — only ~20% density for a spacious feel
          const seed = gx * 31 + gy * 17;
          cells.push(seed % 5 === 0 ? 2 : 0);
        }
      }
    }

    // ─── Animated bomb-planting scenes ───
    // Each scene: player walks in → plants bomb → walks away → bomb explodes → repeat
    const CYCLE = 240; // frames per full cycle (~4s at 60fps)
    const scenes = [
      { bombX: 9,  bombY: 5,  color: "#e74c3c", fromX: 7,  fromY: 5,  toX: 11, toY: 5,  range: 2, offset: 0 },
      { bombX: 27, bombY: 11, color: "#3498db", fromX: 27, fromY: 9,  toX: 27, toY: 13, range: 1, offset: 80 },
      { bombX: 43, bombY: 7,  color: "#16c784", fromX: 45, fromY: 7,  toX: 41, toY: 7,  range: 2, offset: 160 },
      { bombX: 55, bombY: 17, color: "#f1c40f", fromX: 53, fromY: 17, toX: 57, toY: 17, range: 1, offset: 40 },
      { bombX: 17, bombY: 21, color: "#e74c3c", fromX: 17, fromY: 19, toX: 17, toY: 23, range: 2, offset: 120 },
      { bombX: 37, bombY: 3,  color: "#3498db", fromX: 35, fromY: 3,  toX: 39, toY: 3,  range: 1, offset: 200 },
    ];

    function drawFloorTile(gx: number, gy: number, sx: number, sy: number) {
      const isLight = (gx + gy) % 2 === 0;
      rect(sx, sy, T, T, isLight ? "#0c0c18" : "#08080f");
    }

    function drawWallTile(sx: number, sy: number) {
      rect(sx, sy, T, T, "#1a1a2e");
      // Top highlight
      rect(sx, sy, T, 1, "#242440");
      // Bottom shadow
      rect(sx, sy + T - 1, T, 1, "#111122");
      // Mortar line
      rect(sx, sy + Math.floor(T / 2), T, 1, "#111122");
    }

    function drawBlockTile(sx: number, sy: number) {
      rect(sx, sy, T, T, "#2a1f15");
      rect(sx, sy, T, 1, "#1f1610");
      rect(sx, sy + T - 1, T, 1, "#1f1610");
      rect(sx, sy, 1, T, "#1f1610");
      rect(sx + T - 1, sy, 1, T, "#1f1610");
      // Cross hatch
      for (let i = 1; i < T - 1; i++) {
        px(sx + i, sy + i, "#352a1e");
        if (T - 1 - i > 0) px(sx + T - 1 - i, sy + i, "#352a1e");
      }
    }

    function drawBombMini(sx: number, sy: number, f: number) {
      // Bomb body
      rect(sx + 2, sy + 2, 6, 6, "#0e0e0e");
      rect(sx + 3, sy + 1, 4, 1, "#0e0e0e");
      // Fuse spark
      if (f % 8 < 4) {
        px(sx + 6, sy, "#f39c12");
        px(sx + 7, sy - 1 < 0 ? 0 : sy, "#fff");
      } else {
        px(sx + 6, sy, "#ff4444");
      }
    }

    function drawExplosionMini(sx: number, sy: number, f: number) {
      const phase = f % 12;
      if (phase < 4) {
        rect(sx, sy, T, T, "rgba(231, 76, 60, 0.6)");
        rect(sx + 3, sy + 3, 4, 4, "rgba(255, 255, 255, 0.5)");
      } else if (phase < 8) {
        rect(sx, sy, T, T, "rgba(255, 107, 53, 0.5)");
        rect(sx + 2, sy + 2, 6, 6, "rgba(255, 215, 0, 0.4)");
      } else {
        rect(sx, sy, T, T, "rgba(255, 215, 0, 0.3)");
      }
    }

    function darken(hex: string): string {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgb(${r >> 1},${g >> 1},${b >> 1})`;
    }

    function drawPlayerMini(pxPos: number, pyPos: number, color: string, walkFrame: number) {
      const cx = Math.floor(pxPos) + Math.floor(T / 2);
      const cy = Math.floor(pyPos) + Math.floor(T / 2);
      // Head
      rect(cx - 2, cy - 3, 4, 2, color);
      // Body
      rect(cx - 2, cy - 1, 4, 3, color);
      // Eyes
      px(cx - 1, cy - 2, "#fff");
      px(cx + 1, cy - 2, "#fff");
      // Legs (animated walk)
      const step = Math.floor(walkFrame / 6) % 2;
      if (step === 0) {
        px(cx - 1, cy + 2, darken(color));
        px(cx + 1, cy + 3, darken(color));
      } else {
        px(cx - 1, cy + 3, darken(color));
        px(cx + 1, cy + 2, darken(color));
      }
    }

    // Lerp helper for smooth movement
    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * Math.max(0, Math.min(1, t));
    }

    function drawScene(scene: typeof scenes[0], f: number) {
      const phase = (f + scene.offset) % CYCLE;
      const bsx = scene.bombX * T;
      const bsy = scene.bombY * T;

      // Timeline:
      //   0-60:   player walks from "from" to bomb spot
      //  60-70:   player stands at bomb, bomb appears
      //  70-130:  player walks from bomb spot to "to"
      // 130-170:  bomb ticks (fuse flicker)
      // 170-210:  explosion
      // 210-240:  cooldown (nothing)

      if (phase < 60) {
        // Walking toward bomb spot
        const t = phase / 60;
        const ppx = lerp(scene.fromX * T, bsx, t);
        const ppy = lerp(scene.fromY * T, bsy, t);
        drawPlayerMini(ppx, ppy, scene.color, phase);
      } else if (phase < 70) {
        // Standing at bomb spot — bomb just placed
        drawPlayerMini(bsx, bsy, scene.color, 0);
        drawBombMini(bsx, bsy, phase);
      } else if (phase < 130) {
        // Walking away from bomb spot
        const t = (phase - 70) / 60;
        const ppx = lerp(bsx, scene.toX * T, t);
        const ppy = lerp(bsy, scene.toY * T, t);
        drawPlayerMini(ppx, ppy, scene.color, phase);
        drawBombMini(bsx, bsy, phase);
      } else if (phase < 170) {
        // Player at destination, bomb ticking
        drawPlayerMini(scene.toX * T, scene.toY * T, scene.color, 0);
        drawBombMini(bsx, bsy, phase);
      } else if (phase < 210) {
        // Explosion!
        drawPlayerMini(scene.toX * T, scene.toY * T, scene.color, 0);
        drawExplosionMini(bsx, bsy, phase);
        for (let r = 1; r <= scene.range; r++) {
          drawExplosionMini(bsx + r * T, bsy, phase);
          drawExplosionMini(bsx - r * T, bsy, phase);
          drawExplosionMini(bsx, bsy + r * T, phase);
          drawExplosionMini(bsx, bsy - r * T, phase);
        }
      } else {
        // Cooldown — player standing, no bomb
        drawPlayerMini(scene.toX * T, scene.toY * T, scene.color, 0);
      }
    }

    let raf = 0;

    function render() {
      frameRef.current++;
      const f = frameRef.current;

      // Dark background
      rect(0, 0, W, H, "#050510");

      // Draw the full-width grid (very dim)
      ctx.globalAlpha = 0.35;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const sx = gx * T;
          const sy = gy * T;
          const cell = cells[gy * cols + gx];

          if (cell === 1) {
            drawWallTile(sx, sy);
          } else if (cell === 2) {
            drawBlockTile(sx, sy);
          } else {
            drawFloorTile(gx, gy, sx, sy);
          }
        }
      }
      ctx.globalAlpha = 1;

      // Draw animated bomb-planting scenes
      ctx.globalAlpha = 0.5;
      for (const scene of scenes) {
        drawScene(scene, f);
      }
      ctx.globalAlpha = 1;

      // Floating SOL coins (spread wide)
      for (let i = 0; i < 8; i++) {
        const angle = f * 0.006 + i * Math.PI / 4;
        const radius = 120 + Math.sin(f * 0.015 + i * 1.2) * 30;
        const cx = W / 2 + Math.cos(angle) * radius;
        const cy = H / 2 + Math.sin(angle) * radius * 0.5;
        ctx.globalAlpha = 0.15 + Math.sin(f * 0.03 + i * 0.7) * 0.08;
        ctx.fillStyle = "#16c784";
        ctx.fillRect(cx - 1, cy - 1, 3, 3);
        px(Math.floor(cx), Math.floor(cy), "#0a4a2a");
      }
      ctx.globalAlpha = 1;

      // Floating skull particles (slow drift)
      for (let i = 0; i < 5; i++) {
        const gx = ((f * (0.06 + i * 0.02) + i * 130) % (W + 40)) - 20;
        const gy = 30 + Math.sin(f * 0.01 + i * 2.5) * 15 + i * 20;
        ctx.globalAlpha = 0.04 + Math.sin(f * 0.02 + i) * 0.02;
        ctx.fillStyle = "#a78bfa";
        ctx.fillRect(gx, gy, 4, 3);
        ctx.fillRect(gx + 1, gy + 3, 2, 1);
        px(Math.floor(gx), Math.floor(gy + 1), "#0a0a14");
        px(Math.floor(gx + 3), Math.floor(gy + 1), "#0a0a14");
      }
      ctx.globalAlpha = 1;

      // Subtle accent glow in center
      const glow = ctx.createRadialGradient(
        W / 2, H / 2, 30,
        W / 2, H / 2, W * 0.5
      );
      glow.addColorStop(0, "rgba(124, 58, 237, 0.04)");
      glow.addColorStop(0.5, "rgba(124, 58, 237, 0.01)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Vignette — strong to keep edges dark and center readable
      const vignette = ctx.createRadialGradient(
        W / 2, H * 0.42, W * 0.12,
        W / 2, H * 0.42, W * 0.6
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.5, "rgba(0,0,0,0.3)");
      vignette.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ imageRendering: "pixelated", zIndex: 0 }}
    />
  );
}
