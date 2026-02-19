import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Deadmint } from "../target/types/deadmint";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";
import BN from "bn.js";

// ============================================================
// Helper: derive PDAs
// ============================================================
function findProtocolConfig(programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    programId
  );
}

function findBoss(id: BN, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("boss"), id.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

function findRaidTicket(
  boss: PublicKey,
  player: PublicKey,
  programId: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("raid_ticket"), boss.toBuffer(), player.toBuffer()],
    programId
  );
}

// ============================================================
// Helper: poll for attack resolution (VRF callback)
// ============================================================
async function waitForAttackResolved(
  program: Program<Deadmint>,
  raidTicketPda: PublicKey,
  timeoutMs = 30_000,
  pollMs = 2_000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ticket = await program.account.raidTicket.fetch(raidTicketPda);
    // pending_sol == 0 means VRF resolved
    if (ticket.pendingSol.toNumber() === 0) {
      return ticket;
    }
    console.log("    ... waiting for VRF callback");
    await sleep(pollMs);
  }
  throw new Error("Timed out waiting for VRF callback");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Tests
// ============================================================
describe("deadmint – Boss Fight AMM on devnet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Deadmint as Program<Deadmint>;
  const payer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  // Treasury wallet for protocol fees
  const treasury = Keypair.generate();

  // Boss config
  const bossId = new BN(Date.now()); // unique per run

  // Derived PDAs
  let protocolConfigPda: PublicKey;
  let bossPda: PublicKey;
  let raidTicketPda: PublicKey;

  // ----------------------------------------------------------
  //  Setup: derive PDAs
  // ----------------------------------------------------------
  before(async () => {
    console.log("Program ID:", program.programId.toBase58());
    console.log("Payer:     ", payer.publicKey.toBase58());

    [protocolConfigPda] = findProtocolConfig(program.programId);
    [bossPda] = findBoss(bossId, program.programId);
    [raidTicketPda] = findRaidTicket(
      bossPda,
      payer.publicKey,
      program.programId
    );
  });

  // ----------------------------------------------------------
  //  1. Initialize Protocol Config
  //     Auto-resolved: protocolConfig (PDA const), systemProgram
  // ----------------------------------------------------------
  it("initializes protocol config", async () => {
    const tx = await program.methods
      .initializeProtocolConfig(treasury.publicKey, 250) // 2.5% fee
      .accounts({
        admin: payer.publicKey,
      })
      .rpc();

    console.log("  initializeProtocolConfig tx:", tx);

    const config = await program.account.protocolConfig.fetch(
      protocolConfigPda
    );
    assert.ok(config.admin.equals(payer.publicKey));
    assert.ok(config.treasury.equals(treasury.publicKey));
    assert.equal(config.protocolFeeBps, 250);
    assert.equal(config.isActive, true);
  });

  // ----------------------------------------------------------
  //  2. Create Boss
  //     Auto-resolved: boss (PDA arg), bossVault (PDA), systemProgram
  //     Must pass: protocolConfig, creator
  // ----------------------------------------------------------
  it("creates a boss", async () => {
    const tx = await program.methods
      .createBoss(
        bossId,
        "Skeleton Lord",
        new BN(10_000),      // max_hp (small for testing)
        20,                   // defense
        new BN(1_000),        // base_price (lamports)
        new BN(10),           // slope
        0,                    // attack_fee_bps
        500                   // sell_fee_bps (5%)
      )
      .accounts({
        protocolConfig: protocolConfigPda,
        creator: payer.publicKey,
      })
      .rpc();

    console.log("  createBoss tx:", tx);

    const boss = await program.account.boss.fetch(bossPda);
    assert.equal(boss.name, "Skeleton Lord");
    assert.ok(boss.maxHp.eq(new BN(10_000)));
    assert.ok(boss.currentHp.eq(new BN(10_000)));
    assert.equal(boss.defense, 20);
    assert.ok((boss.status as any).alive !== undefined);
    assert.ok(boss.totalSupply.eq(new BN(0)));
    assert.ok(boss.reserveBalance.eq(new BN(0)));
    assert.ok(boss.lootPool.eq(new BN(0)));
  });

  // ----------------------------------------------------------
  //  3. Commit Attack (buy tokens + VRF)
  //     Auto-resolved: raidTicket (PDA), bossVault (PDA),
  //                    oracleQueue (address), systemProgram,
  //                    programIdentity (PDA), vrfProgram, slotHashes
  //     Must pass: boss, player
  // ----------------------------------------------------------
  it("commits attack — buys tokens + requests VRF", async () => {
    const solAmount = new BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL

    const tx = await program.methods
      .commitAttack(solAmount)
      .accounts({
        boss: bossPda,
        player: payer.publicKey,
      })
      .rpc();

    console.log("  commitAttack tx:", tx);

    // Verify boss state updated (tokens minted, reserve increased)
    const boss = await program.account.boss.fetch(bossPda);
    assert.ok(boss.totalSupply.gt(new BN(0)), "tokens should be minted");
    assert.ok(boss.reserveBalance.gt(new BN(0)), "reserve should increase");

    // Verify raid ticket has pending attack
    const ticket = await program.account.raidTicket.fetch(raidTicketPda);
    assert.ok(ticket.pendingSol.gt(new BN(0)), "should have pending SOL");
    assert.ok(ticket.pendingTokens.gt(new BN(0)), "should have pending tokens");

    console.log(
      `  Tokens minted: ${boss.totalSupply.toString()} | Reserve: ${boss.reserveBalance.toString()} lamports`
    );
    console.log("  VRF requested — waiting for oracle callback...");
  });

  // ----------------------------------------------------------
  //  4. Wait for VRF callback — attack resolves
  // ----------------------------------------------------------
  it("waits for VRF callback — attack resolved", async () => {
    const ticket = await waitForAttackResolved(
      program,
      raidTicketPda,
      30_000
    );

    assert.equal(ticket.pendingSol.toNumber(), 0, "pending should be cleared");
    assert.equal(
      ticket.pendingTokens.toNumber(),
      0,
      "pending tokens should be cleared"
    );
    assert.ok(ticket.tokensHeld.gt(new BN(0)), "should hold tokens");

    const boss = await program.account.boss.fetch(bossPda);
    console.log(
      `  Boss HP: ${boss.currentHp.toString()}/${boss.maxHp.toString()}`
    );
    console.log(`  Player tokens: ${ticket.tokensHeld.toString()}`);
    console.log(`  Player damage: ${ticket.totalDamage.toString()}`);
  });

  // ----------------------------------------------------------
  //  5. Sell tokens (partial)
  //     Auto-resolved: bossVault (PDA), systemProgram
  //     Must pass: boss, raidTicket, player
  // ----------------------------------------------------------
  it("sells tokens — boss heals", async () => {
    const ticket = await program.account.raidTicket.fetch(raidTicketPda);
    const sellAmount = ticket.tokensHeld.div(new BN(2)); // sell half

    if (sellAmount.eq(new BN(0))) {
      console.log("  No tokens to sell — skipping");
      return;
    }

    const bossBefore = await program.account.boss.fetch(bossPda);
    const playerBalBefore = await connection.getBalance(payer.publicKey);

    const tx = await program.methods
      .sell(sellAmount)
      .accounts({
        boss: bossPda,
        raidTicket: raidTicketPda,
        player: payer.publicKey,
      })
      .rpc();

    console.log("  sell tx:", tx);

    const bossAfter = await program.account.boss.fetch(bossPda);
    const ticketAfter = await program.account.raidTicket.fetch(raidTicketPda);
    const playerBalAfter = await connection.getBalance(payer.publicKey);

    // Boss should have healed
    console.log(
      `  Boss HP: ${bossBefore.currentHp.toString()} → ${bossAfter.currentHp.toString()}`
    );
    console.log(
      `  Tokens: ${ticket.tokensHeld.toString()} → ${ticketAfter.tokensHeld.toString()}`
    );
    console.log(
      `  Loot pool: ${bossAfter.lootPool.toString()} lamports`
    );
    console.log(
      `  Player SOL: ${playerBalBefore / LAMPORTS_PER_SOL} → ${playerBalAfter / LAMPORTS_PER_SOL}`
    );

    assert.ok(
      bossAfter.currentHp.gte(bossBefore.currentHp),
      "boss should heal on sell"
    );
    assert.ok(
      bossAfter.lootPool.gt(bossBefore.lootPool),
      "loot pool should grow from sell fee"
    );
  });

  // ----------------------------------------------------------
  //  6. Multiple attacks to kill boss
  // ----------------------------------------------------------
  it("attacks repeatedly until boss is defeated", async () => {
    const solPerAttack = new BN(0.05 * LAMPORTS_PER_SOL);
    let boss = await program.account.boss.fetch(bossPda);
    let attempts = 0;
    const maxAttempts = 20;

    while (
      (boss.status as any).alive !== undefined &&
      attempts < maxAttempts
    ) {
      attempts++;
      console.log(
        `  Attack #${attempts} | Boss HP: ${boss.currentHp.toString()}/${boss.maxHp.toString()}`
      );

      // commit attack
      await program.methods
        .commitAttack(solPerAttack)
        .accounts({
          boss: bossPda,
          player: payer.publicKey,
        })
        .rpc();

      // wait for VRF
      await waitForAttackResolved(program, raidTicketPda, 30_000);

      // refresh boss
      boss = await program.account.boss.fetch(bossPda);
    }

    if ((boss.status as any).defeated !== undefined) {
      console.log(
        `\n  BOSS DEFEATED in ${attempts} attacks! Loot pool: ${boss.lootPool.toString()} lamports`
      );
    } else {
      console.log(
        `  Boss still alive after ${maxAttempts} attacks — HP: ${boss.currentHp.toString()}`
      );
    }
  });

  // ----------------------------------------------------------
  //  7. Claim Loot (if boss is dead)
  //     Auto-resolved: bossVault (PDA), systemProgram
  //     Must pass: protocolConfig, boss, raidTicket, treasury, player
  // ----------------------------------------------------------
  it("claims loot after boss defeated", async () => {
    const boss = await program.account.boss.fetch(bossPda);
    if ((boss.status as any).alive !== undefined) {
      console.log("  Boss still alive — skipping loot claim");
      return;
    }

    const playerBalBefore = await connection.getBalance(payer.publicKey);

    const tx = await program.methods
      .claimLoot()
      .accounts({
        protocolConfig: protocolConfigPda,
        boss: bossPda,
        raidTicket: raidTicketPda,
        treasury: treasury.publicKey,
        player: payer.publicKey,
      })
      .rpc();

    console.log("  claimLoot tx:", tx);

    const ticket = await program.account.raidTicket.fetch(raidTicketPda);
    assert.equal(ticket.claimed, true);

    const playerBalAfter = await connection.getBalance(payer.publicKey);
    console.log(
      `  Player SOL: ${playerBalBefore / LAMPORTS_PER_SOL} → ${playerBalAfter / LAMPORTS_PER_SOL}`
    );
    console.log("\n  BOSS FIGHT COMPLETE!");
  });
});
