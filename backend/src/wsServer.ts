import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "./types";
import { getWorker } from "./gameManager";

// ─── Types ─────────────────────────────────────────────────

export interface WsData {
  gamePda: string;
}

// ─── Room Management ───────────────────────────────────────

const rooms = new Map<string, Set<ServerWebSocket<WsData>>>();

export function addToRoom(ws: ServerWebSocket<WsData>, gamePda: string) {
  let room = rooms.get(gamePda);
  if (!room) {
    room = new Set();
    rooms.set(gamePda, room);
  }
  room.add(ws);

  // Send cached state immediately if available
  const worker = getWorker(gamePda);
  if (worker?.lastWireState) {
    const msg: ServerMessage = { type: "state", data: worker.lastWireState };
    ws.send(JSON.stringify(msg));
  }
}

export function removeFromRoom(ws: ServerWebSocket<WsData>, gamePda: string) {
  const room = rooms.get(gamePda);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(gamePda);
  }
}

export function broadcastToGame(gamePda: string, message: ServerMessage) {
  const room = rooms.get(gamePda);
  if (!room || room.size === 0) return;

  const json = JSON.stringify(message);
  for (const ws of room) {
    try {
      ws.send(json);
    } catch {
      // Client disconnected — will be cleaned up on close
    }
  }
}

export function getRoomSize(gamePda: string): number {
  return rooms.get(gamePda)?.size ?? 0;
}

export function getTotalConnections(): number {
  let total = 0;
  for (const room of rooms.values()) {
    total += room.size;
  }
  return total;
}
