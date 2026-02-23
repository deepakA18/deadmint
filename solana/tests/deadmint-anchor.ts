import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { Deadmint } from "../target/types/deadmint";

// Helper: wait for N slots to advance
async function waitSlots(connection: anchor.web3.Connection, n: number) {
  const start = await connection.getSlot();
  while ((await connection.getSlot()) < start + n) {
    await new Promise((r) => setTimeout(r, 400));
  }
}

describe("deadmint", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.deadmint as Program<Deadmint>;
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  // Game params
  const gameId = new anchor.BN(Date.now());
  const entryFee = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
  const maxPlayers = 2;

  // Session keys
  const sessionKey1 = Keypair.generate();
  const sessionKey2 = Keypair.generate();
  const player2Wallet = Keypair.generate();

  // PDAs
  let gamePda: PublicKey;
  let player0Pda: PublicKey;
  let player1Pda: PublicKey;

  before(async () => {
    [gamePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Airdrop
    const sig = await connection.requestAirdrop(player2Wallet.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    for (const sk of [sessionKey1, sessionKey2]) {
      const fundSig = await connection.requestAirdrop(sk.publicKey, 0.5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(fundSig);
    }
  });

  it("initializes a game", async () => {
    await program.methods
      .initializeGame(gameId, entryFee, maxPlayers)
      .accounts({
        game: gamePda,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.gameId.toString()).to.equal(gameId.toString());
    expect(game.maxPlayers).to.equal(maxPlayers);
    expect(game.currentPlayers).to.equal(0);
    expect(game.status).to.equal(0); // Lobby
    expect(game.gridWidth).to.equal(13);
    expect(game.gridHeight).to.equal(11);

    // Borders should be walls
    expect(game.cells[0]).to.equal(1);

    // Spawn safe zone should be empty — (1,1)
    expect(game.cells[1 * 13 + 1]).to.equal(0);

    // An interior cell outside safe zones should be a block
    // (5,3): Manhattan from all spawns > 2 → NOT safe. x=5 odd, y=3 odd → block
    expect(game.cells[3 * 13 + 5]).to.equal(2);
  });

  it("player 1 joins the game", async () => {
    [player0Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), gamePda.toBuffer(), Buffer.from([0])],
      program.programId
    );

    await program.methods
      .joinGame(sessionKey1.publicKey)
      .accounts({
        game: gamePda,
        player: player0Pda,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const player = await program.account.player.fetch(player0Pda);
    expect(player.authority.toBase58()).to.equal(sessionKey1.publicKey.toBase58());
    expect(player.x).to.equal(1);
    expect(player.y).to.equal(1);
    expect(player.alive).to.equal(true);
    expect(player.playerIndex).to.equal(0);

    const game = await program.account.game.fetch(gamePda);
    expect(game.currentPlayers).to.equal(1);
    expect(game.status).to.equal(0); // Still lobby
  });

  it("player 2 joins and game auto-starts", async () => {
    [player1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), gamePda.toBuffer(), Buffer.from([1])],
      program.programId
    );

    await program.methods
      .joinGame(sessionKey2.publicKey)
      .accounts({
        game: gamePda,
        player: player1Pda,
        payer: player2Wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player2Wallet])
      .rpc();

    const player = await program.account.player.fetch(player1Pda);
    expect(player.authority.toBase58()).to.equal(sessionKey2.publicKey.toBase58());
    expect(player.x).to.equal(11);
    expect(player.y).to.equal(1);

    const game = await program.account.game.fetch(gamePda);
    expect(game.currentPlayers).to.equal(2);
    expect(game.status).to.equal(1); // Active!
    expect(game.prizePool.toString()).to.equal(entryFee.mul(new anchor.BN(2)).toString());
  });

  it("player 1 moves down (session key, no popup)", async () => {
    await program.methods
      .movePlayer(1) // Down → (1,2)
      .accounts({
        game: gamePda,
        player: player0Pda,
        authority: sessionKey1.publicKey,
      })
      .signers([sessionKey1])
      .rpc();

    const player = await program.account.player.fetch(player0Pda);
    expect(player.x).to.equal(1);
    expect(player.y).to.equal(2);
  });

  it("rejects move into wall", async () => {
    await waitSlots(connection, 3);

    try {
      await program.methods
        .movePlayer(2) // Left → (0,2) which is a wall
        .accounts({
          game: gamePda,
          player: player0Pda,
          authority: sessionKey1.publicKey,
        })
        .signers([sessionKey1])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.error?.errorCode?.code || e.message).to.include("CellNotWalkable");
    }
  });

  it("player 1 moves to (1,3) and places a bomb", async () => {
    await waitSlots(connection, 3);

    // Move down to (1,3)
    await program.methods
      .movePlayer(1) // Down → (1,3)
      .accounts({
        game: gamePda,
        player: player0Pda,
        authority: sessionKey1.publicKey,
      })
      .signers([sessionKey1])
      .rpc();

    // Place bomb at (1,3)
    await program.methods
      .placeBomb()
      .accounts({
        game: gamePda,
        player: player0Pda,
        authority: sessionKey1.publicKey,
      })
      .signers([sessionKey1])
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    const player = await program.account.player.fetch(player0Pda);
    expect(player.activeBombs).to.equal(1);
    expect(game.bombCount).to.equal(1);
    expect(game.bombs[0].active).to.equal(true);
    expect(game.bombs[0].x).to.equal(1);
    expect(game.bombs[0].y).to.equal(3);
  });

  it("rejects placing second bomb (max_bombs = 1)", async () => {
    // Move away from bomb — up to (1,2) which is empty (spawn safe zone)
    await waitSlots(connection, 3);
    await program.methods
      .movePlayer(0) // Up → (1,2)
      .accounts({
        game: gamePda,
        player: player0Pda,
        authority: sessionKey1.publicKey,
      })
      .signers([sessionKey1])
      .rpc();

    try {
      await program.methods
        .placeBomb()
        .accounts({
          game: gamePda,
          player: player0Pda,
          authority: sessionKey1.publicKey,
        })
        .signers([sessionKey1])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.error?.errorCode?.code || e.message).to.include("NoBombsAvailable");
    }
  });

  it("rejects premature detonation", async () => {
    try {
      await program.methods
        .detonateBomb(0)
        .accounts({
          game: gamePda,
          authority: sessionKey1.publicKey,
        })
        .remainingAccounts([
          { pubkey: player0Pda, isSigner: false, isWritable: true },
          { pubkey: player1Pda, isSigner: false, isWritable: true },
        ])
        .signers([sessionKey1])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.error?.errorCode?.code || e.message).to.include("FuseNotExpired");
    }
  });

  it("detonates bomb — kills player1 standing in range", async () => {
    // Player1 is at (1,2), bomb at (1,3) with range=1.
    // Explosion up from (1,3) → (1,2) = player1's position → player1 dies!
    const game = await program.account.game.fetch(gamePda);
    const bomb = game.bombs[0];
    const targetSlot = parseInt(bomb.placedAtSlot.toString()) + bomb.fuseSlots + 1;

    let currentSlot = await connection.getSlot();
    while (currentSlot < targetSlot) {
      await new Promise((r) => setTimeout(r, 400));
      currentSlot = await connection.getSlot();
    }

    await program.methods
      .detonateBomb(0)
      .accounts({
        game: gamePda,
        authority: sessionKey1.publicKey,
      })
      .remainingAccounts([
        { pubkey: player0Pda, isSigner: false, isWritable: true },
        { pubkey: player1Pda, isSigner: false, isWritable: true },
      ])
      .signers([sessionKey1])
      .rpc();

    const gameAfter = await program.account.game.fetch(gamePda);
    expect(gameAfter.bombs[0].active).to.equal(false);
    expect(gameAfter.bombs[0].detonated).to.equal(true);

    const p1 = await program.account.player.fetch(player0Pda);
    expect(p1.activeBombs).to.equal(0);
    // Player1 at (1,2) was hit by explosion from (1,3) range 1 going up
    expect(p1.alive).to.equal(false);
    console.log("  ✓ On-chain kill detection: player1 killed by own bomb!");
  });

  it("check_game_end detects last player standing", async () => {
    await program.methods
      .checkGameEnd()
      .accounts({
        game: gamePda,
        authority: sessionKey2.publicKey,
      })
      .remainingAccounts([
        { pubkey: player0Pda, isSigner: false, isWritable: false },
        { pubkey: player1Pda, isSigner: false, isWritable: false },
      ])
      .signers([sessionKey2])
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.status).to.equal(2); // Finished
    expect(game.winner.toBase58()).to.equal(sessionKey2.publicKey.toBase58());
    console.log("  ✓ Game ended. Winner: Player 2");
  });

  it("winner claims prize", async () => {
    const balBefore = await connection.getBalance(sessionKey2.publicKey);

    await program.methods
      .claimPrize()
      .accounts({
        game: gamePda,
        player: player1Pda,
        winner: sessionKey2.publicKey,
      })
      .signers([sessionKey2])
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.status).to.equal(3); // Claimed
    expect(game.prizePool.toString()).to.equal("0");

    const balAfter = await connection.getBalance(sessionKey2.publicKey);
    const payout = balAfter - balBefore;
    expect(payout).to.be.greaterThan(0.09 * LAMPORTS_PER_SOL);
    console.log("  ✓ Winner received", (payout / LAMPORTS_PER_SOL).toFixed(4), "SOL");
  });
});
