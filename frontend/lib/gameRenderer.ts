import {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  CELL_EMPTY,
  CELL_WALL,
  CELL_BLOCK,
  CELL_BOMB,
  CELL_EXPLOSION,
  CELL_LOOT,
  CELL_POWERUP,
  COLORS,
  PLAYER_COLORS,
  POWERUP_BOMB_RANGE,
  POWERUP_EXTRA_BOMB,
} from "./constants";
import type { FullGameState, PlayerState } from "./types";

const PX = 4; // Each art "pixel" = 4x4 CSS pixels
const ART_SIZE = TILE_SIZE / PX; // 12x12 art grid per tile

// ─── Theme-aware Tile Colors ────────────────────────────────

interface TileColors {
  floorDark: string;
  floorLight: string;
  wallBase: string;
  wallHighlight: string;
  wallDark: string;
  wallDetail: string;
  blockBase: string;
  blockHighlight: string;
  blockDark: string;
  fogAccent: string;
}

let themeColors: TileColors = getDefaultTileColors();

function getDefaultTileColors(): TileColors {
  return {
    floorDark: COLORS.floorDark,
    floorLight: COLORS.floorLight,
    wallBase: COLORS.wallBase,
    wallHighlight: COLORS.wallHighlight,
    wallDark: COLORS.wallDark,
    wallDetail: "#353550",
    blockBase: COLORS.blockBase,
    blockHighlight: COLORS.blockHighlight,
    blockDark: COLORS.blockDark,
    fogAccent: COLORS.purpleAccent,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.min(255, Math.floor(r + (255 - r) * amount)),
    Math.min(255, Math.floor(g + (255 - g) * amount)),
    Math.min(255, Math.floor(b + (255 - b) * amount))
  );
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.floor(r * (1 - amount)),
    Math.floor(g * (1 - amount)),
    Math.floor(b * (1 - amount))
  );
}

function readCssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function computeThemeTileColors(): TileColors {
  const bg = readCssVar("--background") || "#0a0a0a";
  const panel = readCssVar("--panel") || "#1a1a2e";
  const primary = readCssVar("--primary") || "#7c3aed";

  // Floor: slightly lighter/darker than background
  const floorDark = bg;
  const floorLight = lighten(bg, 0.04);

  // Wall: based on panel color
  const wallBase = panel;
  const wallHighlight = lighten(panel, 0.12);
  const wallDark = darkenHex(panel, 0.25);
  const wallDetail = lighten(panel, 0.08);

  // Block: warm brown tinted toward primary
  const [pr, pg, pb] = hexToRgb(primary);
  const blockR = Math.floor(74 * 0.6 + pr * 0.4);
  const blockG = Math.floor(55 * 0.6 + pg * 0.2);
  const blockB = Math.floor(40 * 0.6 + pb * 0.2);
  const blockBase = rgbToHex(
    Math.min(255, blockR),
    Math.min(255, blockG),
    Math.min(255, blockB)
  );
  const blockHighlight = lighten(blockBase, 0.15);
  const blockDark = darkenHex(blockBase, 0.3);

  return {
    floorDark,
    floorLight,
    wallBase,
    wallHighlight,
    wallDark,
    wallDetail,
    blockBase,
    blockHighlight,
    blockDark,
    fogAccent: primary,
  };
}

// ─── Tile Cache ─────────────────────────────────────────────

let tileCache: Map<string, HTMLCanvasElement> = new Map();
let cacheInitialized = false;

// Screen shake state
let shakeX = 0;
let shakeY = 0;
let shakeFrames = 0;

// Particles
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}
let particles: Particle[] = [];

// Previous explosion cells for detecting new explosions
let prevExplosionCells: Set<number> = new Set();

function createOffscreenCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  return c;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * PX, y * PX, PX, PX);
}

function fillTile(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
}

// ─── Tile Drawers ───────────────────────────────────────────

function drawFloorTile(gridX: number, gridY: number): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;
  // Checkerboard with slight variation
  for (let y = 0; y < ART_SIZE; y++) {
    for (let x = 0; x < ART_SIZE; x++) {
      const isLight = (x + y + gridX + gridY) % 2 === 0;
      px(ctx, x, y, isLight ? themeColors.floorLight : themeColors.floorDark);
    }
  }
  // Random cracks
  const seed = gridX * 17 + gridY * 31;
  const crackColor = darkenHex(themeColors.floorDark, 0.3);
  if (seed % 5 === 0) px(ctx, 3, 5, crackColor);
  if (seed % 7 === 0) px(ctx, 8, 3, crackColor);
  if (seed % 11 === 0) px(ctx, 6, 9, crackColor);
  return c;
}

function drawWallTile(): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;
  fillTile(ctx, themeColors.wallBase);

  // Top highlight
  for (let x = 0; x < ART_SIZE; x++) px(ctx, x, 0, themeColors.wallHighlight);
  // Bottom shadow
  for (let x = 0; x < ART_SIZE; x++) px(ctx, x, ART_SIZE - 1, themeColors.wallDark);

  // Brick mortar lines
  for (let x = 0; x < ART_SIZE; x++) {
    px(ctx, x, 4, themeColors.wallDark);
    px(ctx, x, 8, themeColors.wallDark);
  }
  // Vertical mortar (offset for brick pattern)
  for (let y = 0; y < 4; y++) px(ctx, 6, y, themeColors.wallDark);
  for (let y = 5; y < 8; y++) px(ctx, 3, y, themeColors.wallDark);
  for (let y = 9; y < ART_SIZE; y++) px(ctx, 9, y, themeColors.wallDark);

  // Subtle skull engraving (center)
  px(ctx, 5, 2, themeColors.wallDetail);
  px(ctx, 6, 2, themeColors.wallDetail);
  px(ctx, 5, 3, themeColors.wallDetail);
  px(ctx, 6, 3, themeColors.wallDetail);
  px(ctx, 4, 6, themeColors.wallDetail);
  px(ctx, 7, 6, themeColors.wallDetail);
  px(ctx, 5, 6, themeColors.wallDetail);
  px(ctx, 6, 6, themeColors.wallDetail);
  px(ctx, 5, 7, themeColors.wallDetail);

  return c;
}

function drawBlockTile(): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;
  fillTile(ctx, themeColors.blockBase);

  // Border
  for (let i = 0; i < ART_SIZE; i++) {
    px(ctx, i, 0, themeColors.blockDark);
    px(ctx, i, ART_SIZE - 1, themeColors.blockDark);
    px(ctx, 0, i, themeColors.blockDark);
    px(ctx, ART_SIZE - 1, i, themeColors.blockDark);
  }

  // Cross-hatch pattern (X)
  for (let i = 1; i < ART_SIZE - 1; i++) {
    px(ctx, i, i, themeColors.blockHighlight);
    px(ctx, ART_SIZE - 1 - i, i, themeColors.blockHighlight);
  }

  // Corner nails
  px(ctx, 2, 2, "#888888");
  px(ctx, ART_SIZE - 3, 2, "#888888");
  px(ctx, 2, ART_SIZE - 3, "#888888");
  px(ctx, ART_SIZE - 3, ART_SIZE - 3, "#888888");

  return c;
}

function drawBombTile(frame: number): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;

  // Draw floor underneath
  for (let y = 0; y < ART_SIZE; y++) {
    for (let x = 0; x < ART_SIZE; x++) {
      px(ctx, x, y, (x + y) % 2 === 0 ? themeColors.floorLight : themeColors.floorDark);
    }
  }

  // Bomb body (circle approximation)
  const bombPixels = [
    [4, 3], [5, 3], [6, 3], [7, 3],
    [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
    [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5],
    [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
    [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7],
    [4, 8], [5, 8], [6, 8], [7, 8],
  ];
  for (const [bx, by] of bombPixels) {
    px(ctx, bx, by, COLORS.bombBlack);
  }

  // Highlight
  px(ctx, 5, 4, "#333333");
  px(ctx, 6, 4, "#333333");
  px(ctx, 5, 5, "#2a2a2a");

  // Skull on bomb
  px(ctx, 5, 6, "#444");
  px(ctx, 6, 6, "#444");
  px(ctx, 5, 7, "#333");

  // Fuse
  px(ctx, 6, 2, "#8B4513");
  px(ctx, 7, 1, "#8B4513");

  // Spark (animated flicker)
  if (frame % 8 < 4) {
    px(ctx, 8, 0, COLORS.bombFuse);
    px(ctx, 7, 0, "#fff");
  } else {
    px(ctx, 8, 1, "#ff4444");
  }

  return c;
}

function drawExplosionTile(frame: number): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;
  const phase = frame % 12;

  if (phase < 4) {
    // Phase 1: Red core
    fillTile(ctx, COLORS.explosionRed);
    // Orange cross center
    for (let i = 3; i < 9; i++) {
      px(ctx, 6, i, COLORS.explosionOrange);
      px(ctx, i, 6, COLORS.explosionOrange);
    }
    // White hot center
    px(ctx, 5, 5, "#fff");
    px(ctx, 6, 5, "#fff");
    px(ctx, 5, 6, "#fff");
    px(ctx, 6, 6, "#fff");
  } else if (phase < 8) {
    // Phase 2: Orange spread
    fillTile(ctx, COLORS.explosionOrange);
    for (let i = 2; i < 10; i++) {
      px(ctx, 6, i, COLORS.explosionYellow);
      px(ctx, i, 6, COLORS.explosionYellow);
    }
    px(ctx, 5, 5, "#fff");
    px(ctx, 6, 6, "#fff");
    // Scatter pixels
    px(ctx, 2, 2, COLORS.explosionRed);
    px(ctx, 9, 3, COLORS.explosionYellow);
    px(ctx, 3, 9, COLORS.explosionRed);
    px(ctx, 10, 10, COLORS.explosionYellow);
  } else {
    // Phase 3: Fade out
    for (let y = 0; y < ART_SIZE; y++) {
      for (let x = 0; x < ART_SIZE; x++) {
        const dist = Math.abs(x - 6) + Math.abs(y - 6);
        if (dist < 4) {
          px(ctx, x, y, COLORS.explosionYellow);
        } else if (dist < 7) {
          px(ctx, x, y, "#3a1a08");
        } else {
          px(ctx, x, y, themeColors.floorDark);
        }
      }
    }
  }

  return c;
}

function drawLootTile(frame: number): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;

  // Floor base
  for (let y = 0; y < ART_SIZE; y++) {
    for (let x = 0; x < ART_SIZE; x++) {
      px(ctx, x, y, (x + y) % 2 === 0 ? themeColors.floorLight : themeColors.floorDark);
    }
  }

  // Float offset
  const floatY = Math.sin(frame * 0.12) > 0 ? 0 : 1;

  // Glow ring
  const glowPixels = [
    [4, 2], [5, 2], [6, 2], [7, 2],
    [3, 3], [8, 3],
    [3, 8], [8, 8],
    [4, 9], [5, 9], [6, 9], [7, 9],
  ];
  for (const [gx, gy] of glowPixels) {
    ctx.fillStyle = "rgba(22, 199, 132, 0.3)";
    ctx.fillRect(gx * PX, (gy + floatY) * PX, PX, PX);
  }

  // Coin body
  const coinPixels = [
    [5, 3], [6, 3],
    [4, 4], [5, 4], [6, 4], [7, 4],
    [4, 5], [5, 5], [6, 5], [7, 5],
    [4, 6], [5, 6], [6, 6], [7, 6],
    [4, 7], [5, 7], [6, 7], [7, 7],
    [5, 8], [6, 8],
  ];
  for (const [cx, cy] of coinPixels) {
    px(ctx, cx, cy + floatY, COLORS.solGreen);
  }

  // S symbol
  px(ctx, 6, 4 + floatY, "#0a4a2a");
  px(ctx, 5, 5 + floatY, "#0a4a2a");
  px(ctx, 6, 6 + floatY, "#0a4a2a");
  px(ctx, 5, 7 + floatY, "#0a4a2a");

  // Highlight
  px(ctx, 5, 4 + floatY, "#2aff9a");

  return c;
}

function drawPowerupTile(powerupType: number, frame: number): HTMLCanvasElement {
  const c = createOffscreenCanvas();
  const ctx = c.getContext("2d")!;

  // Floor base
  for (let y = 0; y < ART_SIZE; y++) {
    for (let x = 0; x < ART_SIZE; x++) {
      px(ctx, x, y, (x + y) % 2 === 0 ? themeColors.floorLight : themeColors.floorDark);
    }
  }

  const floatY = Math.sin(frame * 0.12) > 0 ? 0 : 1;

  // Color by type
  let color: string;
  let symbol: [number, number][];
  if (powerupType === POWERUP_BOMB_RANGE) {
    color = COLORS.explosionRed;
    // Arrow symbol (range)
    symbol = [[6, 3], [5, 4], [6, 4], [7, 4], [6, 5], [6, 6], [6, 7]];
  } else if (powerupType === POWERUP_EXTRA_BOMB) {
    color = "#3498db";
    // + symbol (extra)
    symbol = [[6, 4], [5, 5], [6, 5], [7, 5], [6, 6], [6, 7]];
  } else {
    color = COLORS.solGreen;
    // Lightning symbol (speed)
    symbol = [[7, 3], [6, 4], [5, 5], [6, 5], [7, 5], [6, 6], [5, 7]];
  }

  // Gem shape
  const gemPixels = [
    [5, 3], [6, 3],
    [4, 4], [5, 4], [6, 4], [7, 4],
    [4, 5], [5, 5], [6, 5], [7, 5],
    [4, 6], [5, 6], [6, 6], [7, 6],
    [5, 7], [6, 7],
  ];
  for (const [gx, gy] of gemPixels) {
    px(ctx, gx, gy + floatY, color);
  }
  // Symbol overlay
  for (const [sx, sy] of symbol) {
    px(ctx, sx, sy + floatY, "#fff");
  }

  // Themed aura
  const [ar, ag, ab] = hexToRgb(themeColors.fogAccent);
  ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.2)`;
  ctx.fillRect(3 * PX, (2 + floatY) * PX, 7 * PX, 8 * PX);

  return c;
}

// ─── Player Drawing ────────────────────────────────────────

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  colorHex: string,
  frameCount: number,
  facing: number
) {
  const sx = player.x * TILE_SIZE;
  const sy = player.y * TILE_SIZE;

  if (!player.alive) {
    // Dead: ghost rising animation
    ctx.globalAlpha = 0.4;
    drawPlayerSprite(ctx, sx, sy, "#666666", facing);
    ctx.globalAlpha = 1;

    // Floating skull
    const floatOffset = Math.sin(frameCount * 0.05) * 3;
    ctx.fillStyle = "#888";
    ctx.fillRect(sx + 18, sy + 10 + floatOffset, 12, 12);
    ctx.fillStyle = "#333";
    ctx.fillRect(sx + 20, sy + 13 + floatOffset, 3, 3);
    ctx.fillRect(sx + 25, sy + 13 + floatOffset, 3, 3);
    ctx.fillRect(sx + 22, sy + 18 + floatOffset, 4, 2);
    return;
  }

  drawPlayerSprite(ctx, sx, sy, colorHex, facing);

  // Breathing animation
  if (frameCount % 60 < 30) {
    ctx.fillStyle = colorHex;
    ctx.fillRect(sx + 16, sy + 12, PX, PX);
    ctx.fillRect(sx + 28, sy + 12, PX, PX);
  }
}

function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  color: string,
  facing: number
) {
  // Body outline (black)
  const darker = darkenColor(color, 0.5);

  // Head (6 wide, centered)
  for (let x = 3; x < 9; x++) px2(ctx, sx, sy, x, 1, darker);
  for (let x = 3; x < 9; x++) px2(ctx, sx, sy, x, 2, color);
  for (let x = 3; x < 9; x++) px2(ctx, sx, sy, x, 3, color);

  // Eyes
  let eyeL = 4, eyeR = 7;
  if (facing === 2) { eyeL = 3; eyeR = 6; }
  if (facing === 3) { eyeL = 5; eyeR = 8; }
  px2(ctx, sx, sy, eyeL, 2, "#ffffff");
  px2(ctx, sx, sy, eyeR, 2, "#ffffff");
  px2(ctx, sx, sy, eyeL, 3, "#111");
  px2(ctx, sx, sy, eyeR, 3, "#111");

  // Torso
  for (let y = 4; y < 7; y++) {
    for (let x = 2; x < 10; x++) {
      px2(ctx, sx, sy, x, y, color);
    }
  }
  // Belt
  for (let x = 2; x < 10; x++) px2(ctx, sx, sy, x, 5, darker);

  // Arms
  px2(ctx, sx, sy, 1, 4, color);
  px2(ctx, sx, sy, 1, 5, color);
  px2(ctx, sx, sy, 10, 4, color);
  px2(ctx, sx, sy, 10, 5, color);

  // Legs
  for (let y = 7; y < 10; y++) {
    px2(ctx, sx, sy, 3, y, color);
    px2(ctx, sx, sy, 4, y, color);
    px2(ctx, sx, sy, 7, y, color);
    px2(ctx, sx, sy, 8, y, color);
  }

  // Feet
  px2(ctx, sx, sy, 2, 10, darker);
  px2(ctx, sx, sy, 3, 10, darker);
  px2(ctx, sx, sy, 4, 10, darker);
  px2(ctx, sx, sy, 7, 10, darker);
  px2(ctx, sx, sy, 8, 10, darker);
  px2(ctx, sx, sy, 9, 10, darker);
}

function px2(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  artX: number,
  artY: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(sx + artX * PX, sy + artY * PX, PX, PX);
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
}

// ─── Cache Initialization ──────────────────────────────────

export function resetTileCache() {
  tileCache.clear();
  cacheInitialized = false;
}

export function initTileCache() {
  if (cacheInitialized) return;
  tileCache.clear();

  // Compute theme-aware colors from CSS variables
  themeColors = computeThemeTileColors();

  // Floor tiles (unique per position due to crack patterns)
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      tileCache.set(`floor_${x}_${y}`, drawFloorTile(x, y));
    }
  }

  tileCache.set("wall", drawWallTile());
  tileCache.set("block", drawBlockTile());

  // Animated tiles: cache multiple frames
  for (let f = 0; f < 16; f++) {
    tileCache.set(`bomb_${f}`, drawBombTile(f));
    tileCache.set(`explosion_${f}`, drawExplosionTile(f));
    tileCache.set(`loot_${f}`, drawLootTile(f));
    tileCache.set(`powerup_1_${f}`, drawPowerupTile(1, f));
    tileCache.set(`powerup_2_${f}`, drawPowerupTile(2, f));
    tileCache.set(`powerup_3_${f}`, drawPowerupTile(3, f));
  }

  cacheInitialized = true;
}

// ─── Vignette & Atmosphere ─────────────────────────────────

function drawVignette(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createRadialGradient(
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    CANVAS_WIDTH * 0.3,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    CANVAS_WIDTH * 0.7
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawFog(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.globalAlpha = 0.03;
  const offset = (frame * 0.2) % CANVAS_WIDTH;
  ctx.fillStyle = themeColors.fogAccent;
  ctx.fillRect(offset - CANVAS_WIDTH, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillRect(offset, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.globalAlpha = 1;
}

// ─── Particles ─────────────────────────────────────────────

function spawnExplosionParticles(cellX: number, cellY: number) {
  const cx = cellX * TILE_SIZE + TILE_SIZE / 2;
  const cy = cellY * TILE_SIZE + TILE_SIZE / 2;
  const colors = [COLORS.explosionRed, COLORS.explosionOrange, COLORS.explosionYellow, "#fff"];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 20 + Math.floor(Math.random() * 10),
    });
  }
}

function updateAndDrawParticles(ctx: CanvasRenderingContext2D) {
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // gravity
    p.vx *= 0.95; // friction
    p.life--;

    ctx.globalAlpha = Math.min(1, p.life / 10);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

// ─── Main Render ───────────────────────────────────────────

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: FullGameState,
  localPlayerIndex: number,
  frameCount: number,
  playerFacings: number[]
) {
  initTileCache();

  // Detect new explosions for particles & screen shake
  const currentExplosions = new Set<number>();
  state.grid.cells.forEach((cell, idx) => {
    if (cell === CELL_EXPLOSION) currentExplosions.add(idx);
  });
  currentExplosions.forEach((idx) => {
    if (!prevExplosionCells.has(idx)) {
      const cx = idx % GRID_WIDTH;
      const cy = Math.floor(idx / GRID_WIDTH);
      spawnExplosionParticles(cx, cy);
      shakeFrames = 6;
    }
  });
  prevExplosionCells = currentExplosions;

  // Update screen shake
  if (shakeFrames > 0) {
    shakeX = (Math.random() - 0.5) * 6;
    shakeY = (Math.random() - 0.5) * 6;
    shakeFrames--;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Clear
  ctx.fillStyle = themeColors.floorDark;
  ctx.fillRect(-10, -10, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);

  // Draw grid tiles
  const f = frameCount % 16;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const idx = y * GRID_WIDTH + x;
      const cell = state.grid.cells[idx];
      const dx = x * TILE_SIZE;
      const dy = y * TILE_SIZE;

      let tile: HTMLCanvasElement | undefined;
      switch (cell) {
        case CELL_EMPTY:
          tile = tileCache.get(`floor_${x}_${y}`);
          break;
        case CELL_WALL:
          tile = tileCache.get("wall");
          break;
        case CELL_BLOCK:
          tile = tileCache.get("block");
          break;
        case CELL_BOMB:
          tile = tileCache.get(`bomb_${f}`);
          break;
        case CELL_EXPLOSION:
          tile = tileCache.get(`explosion_${f}`);
          break;
        case CELL_LOOT:
          tile = tileCache.get(`loot_${f}`);
          break;
        case CELL_POWERUP: {
          const pType = state.grid.powerupTypes[idx] || 1;
          tile = tileCache.get(`powerup_${pType}_${f}`);
          break;
        }
      }

      if (tile) {
        ctx.drawImage(tile, dx, dy);
      }
    }
  }

  // Fog atmosphere
  drawFog(ctx, frameCount);

  // Draw players (alive last so they render on top)
  const sortedPlayers = [...state.players].sort((a, b) => {
    if (a.alive && !b.alive) return 1;
    if (!a.alive && b.alive) return -1;
    return 0;
  });

  for (const player of sortedPlayers) {
    if (player.playerIndex >= 0 && player.playerIndex < PLAYER_COLORS.length) {
      const facing = playerFacings[player.playerIndex] ?? 1;
      drawPlayer(ctx, player, PLAYER_COLORS[player.playerIndex], frameCount, facing);
    }
  }

  // Particles
  updateAndDrawParticles(ctx);

  // Vignette
  drawVignette(ctx);

  // Local player highlight (subtle glow under their character)
  const lp = state.players[localPlayerIndex];
  if (lp && lp.alive) {
    ctx.globalAlpha = 0.15 + Math.sin(frameCount * 0.08) * 0.05;
    ctx.fillStyle = PLAYER_COLORS[localPlayerIndex];
    const lpx = lp.x * TILE_SIZE + TILE_SIZE / 2;
    const lpy = lp.y * TILE_SIZE + TILE_SIZE;
    ctx.beginPath();
    ctx.ellipse(lpx, lpy, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
