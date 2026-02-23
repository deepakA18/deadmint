import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAllWorkers, registerGame, getActiveGameCount } from "./gameManager";
import { getCrankKeypair, getConnection } from "./solana";
import { getTotalConnections } from "./wsServer";

// ─── CORS Headers ──────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Route Handler ─────────────────────────────────────────

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check
  if (path === "/health" && req.method === "GET") {
    let crankBalance = "unknown";
    try {
      const conn = getConnection();
      const crank = getCrankKeypair();
      const lamports = await conn.getBalance(crank.publicKey);
      crankBalance = `${(lamports / 1e9).toFixed(4)} SOL`;
    } catch {}

    return json({
      ok: true,
      games: getActiveGameCount(),
      connections: getTotalConnections(),
      crankBalance,
    });
  }

  // List all registered games
  if (path === "/api/games" && req.method === "GET") {
    const workers = getAllWorkers();
    const games = workers.map((w) => ({
      gamePda: w.gamePdaStr,
      gameId: w.gameId.toString(),
      maxPlayers: w.maxPlayers,
      status: w.status,
    }));
    return json({ games });
  }

  // Register a game for cranking
  if (path === "/api/games/register" && req.method === "POST") {
    try {
      const body = await req.json();
      const { gamePda, gameId, maxPlayers } = body;

      if (!gamePda || !gameId || !maxPlayers) {
        return json({ error: "Missing gamePda, gameId, or maxPlayers" }, 400);
      }

      const pk = new PublicKey(gamePda);
      const id = new BN(gameId);
      const isNew = registerGame(pk, id, maxPlayers);

      return json({ registered: isNew, gamePda });
    } catch (e: any) {
      return json({ error: e.message || "Invalid request" }, 400);
    }
  }

  return json({ error: "Not found" }, 404);
}
