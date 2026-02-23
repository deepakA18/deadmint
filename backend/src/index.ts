import { PORT } from "./config";
import { getCrankKeypair } from "./solana";
import { handleRequest } from "./routes";
import { addToRoom, removeFromRoom, type WsData } from "./wsServer";
import { discoverAndRegisterAll, startCleanupLoop } from "./gameManager";

// ─── Startup ───────────────────────────────────────────────

console.log("=== Deadmint Backend Crank Service ===");

// Load crank keypair early to fail fast
const crank = getCrankKeypair();
console.log(`Crank wallet: ${crank.publicKey.toBase58()}`);

// Discover existing games
await discoverAndRegisterAll();

// Start periodic cleanup of finished games
startCleanupLoop();

// ─── Bun.serve (HTTP + WebSocket) ──────────────────────────

const server = Bun.serve<WsData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Upgrade WebSocket connections
    if (url.pathname === "/ws") {
      const gamePda = url.searchParams.get("game");
      if (!gamePda) {
        return new Response("Missing ?game= query parameter", { status: 400 });
      }

      const success = server.upgrade(req, {
        data: { gamePda },
      });

      if (success) return undefined; // Bun handles the upgrade
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // HTTP routes
    return handleRequest(req);
  },
  websocket: {
    open(ws) {
      const { gamePda } = ws.data;
      addToRoom(ws, gamePda);
      console.log(`[WS] Client connected to game ${gamePda.slice(0, 8)}...`);
    },
    message(_ws, _message) {
      // Clients don't send messages (one-way push)
    },
    close(ws) {
      const { gamePda } = ws.data;
      removeFromRoom(ws, gamePda);
    },
  },
});

console.log(`Server running on http://localhost:${server.port}`);
