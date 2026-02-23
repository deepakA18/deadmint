// ─── transactions.ts ─────────────────────────────────────────
// With the Anchor rewrite, all Borsh parsing and manual instruction
// building has been replaced by the Anchor IDL client in gameService.ts.
//
// This file now re-exports PDA helpers and types for backwards compat.
// ──────────────────────────────────────────────────────────────

export {
  deriveGamePda,
  derivePlayerPda,
  fetchGameConfig,
  fetchFullGameState,
} from "./gameService";
