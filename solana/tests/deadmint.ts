import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { expect } from "chai";
import BN from "bn.js";
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  FindComponentPda,
} from "@magicblock-labs/bolt-sdk";

const WORLD_PROGRAM_ID = new PublicKey(
  "WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n"
);

// Build the world program's `apply` instruction with raw borsh args
// (bypasses SDK's SerializeArgs which JSON-stringifies Buffer objects)
function buildApplyInstruction(
  authority: PublicKey,
  systemId: PublicKey,
  world: PublicKey,
  args: Buffer,
  remainingAccounts: anchor.web3.AccountMeta[]
): TransactionInstruction {
  // Discriminator = sha256("global:apply")[:8]
  const disc = createHash("sha256")
    .update("global:apply")
    .digest()
    .subarray(0, 8);
  // Borsh Vec<u8>: 4-byte LE length + raw bytes
  const argsLen = Buffer.alloc(4);
  argsLen.writeUInt32LE(args.length, 0);
  const data = Buffer.concat([disc, argsLen, args]);

  const keys: anchor.web3.AccountMeta[] = [
    { pubkey: systemId, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: world, isSigner: false, isWritable: true },
    ...remainingAccounts,
  ];

  return new TransactionInstruction({
    keys,
    programId: WORLD_PROGRAM_ID,
    data,
  });
}

// High-level helper matching the ApplySystem API but with raw borsh bytes
function applySystem(
  _provider: anchor.AnchorProvider,
  opts: {
    authority: PublicKey;
    systemId: PublicKey;
    entities: {
      entity: PublicKey;
      components: { componentId: PublicKey }[];
    }[];
    world: PublicKey;
    args?: Buffer;
  }
) {
  const remainingAccounts: anchor.web3.AccountMeta[] = [];
  for (const entity of opts.entities) {
    for (const component of entity.components) {
      const componentPda = FindComponentPda({
        componentId: component.componentId,
        entity: entity.entity,
      });
      remainingAccounts.push({
        pubkey: component.componentId,
        isSigner: false,
        isWritable: false,
      });
      remainingAccounts.push({
        pubkey: componentPda,
        isSigner: false,
        isWritable: true,
      });
    }
  }

  const instruction = buildApplyInstruction(
    opts.authority,
    opts.systemId,
    opts.world,
    opts.args || Buffer.alloc(0),
    remainingAccounts
  );

  return { instruction };
}

// Component program IDs
const GAME_CONFIG_ID = new PublicKey(
  "919ULGHVd8Ei2NCeCg3zfpNrCg5QKNh6dJtnTLdRp8DP"
);
const GRID_ID = new PublicKey(
  "B6aeQFgTVwCfjQiiDXbiZxcZbCBzzSFQV8h9CBDx1QqF"
);
const PLAYER_ID = new PublicKey(
  "22jhJmsR9JDRbbzy6TLuGkr7jMjSAgwMKtG2SJ3oATew"
);
const BOMB_ID = new PublicKey(
  "HPyYmnUfG2a1zhLMibMZGVF9UP8xcBvCKLU4e9FnYhu4"
);

// System program IDs
const INIT_GAME_ID = new PublicKey(
  "6LRsvRNMA9uFa3XnKi4tswXrgsJPzhGEaCQSCcc6tdht"
);
const JOIN_GAME_ID = new PublicKey(
  "B5KDtjkRhhGkUKmaZAyPDjeLF6bTBSxWrVu4pjHBpmvN"
);
const MOVE_PLAYER_ID = new PublicKey(
  "F7qDssjJp9USkMakyj8FbnyuV5HR2CMGP8PRx6bmL89T"
);
const PLACE_BOMB_ID = new PublicKey(
  "69QgbvubUeQ8V335u1pdpECXoMu3UU9Xp1sZtCGKH17T"
);
const CHECK_GAME_END_ID = new PublicKey(
  "7z2CQjGyDAv3REvjj1Y19sKM9edgE9tB3QFD8pAAji3N"
);
const CLAIM_PRIZE_ID = new PublicKey(
  "HSFH8eHW5cXpaCTsseCvrya6D4qfa98rXt4kC8S7nAAg"
);

// ─── Borsh Serialization Helpers ───────────────────────────────────

function serializeInitGameArgs(
  gameId: BN,
  authority: PublicKey,
  entryFee: BN
): Buffer {
  const buf = Buffer.alloc(8 + 32 + 8);
  buf.writeBigUInt64LE(BigInt(gameId.toString()), 0);
  authority.toBuffer().copy(buf, 8);
  buf.writeBigUInt64LE(BigInt(entryFee.toString()), 40);
  return buf;
}

function serializeJoinGameArgs(playerAuthority: PublicKey): Buffer {
  const buf = Buffer.alloc(32);
  playerAuthority.toBuffer().copy(buf, 0);
  return buf;
}

function serializeMoveArgs(direction: number): Buffer {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(direction, 0);
  return buf;
}

function serializeCheckGameEndArgs(
  aliveCount: number,
  winner: PublicKey
): Buffer {
  const buf = Buffer.alloc(1 + 32);
  buf.writeUInt8(aliveCount, 0);
  winner.toBuffer().copy(buf, 1);
  return buf;
}

function serializeClaimPrizeArgs(treasury: PublicKey): Buffer {
  const buf = Buffer.alloc(32);
  treasury.toBuffer().copy(buf, 0);
  return buf;
}

// ─── Deserialization Helpers ───────────────────────────────────────

class BorshReader {
  private offset: number;
  private data: Buffer;
  constructor(data: Buffer) {
    this.data = data;
    this.offset = 0;
  }

  skip(n: number) {
    this.offset += n;
  }

  readU8(): number {
    return this.data.readUInt8(this.offset++);
  }

  readU16(): number {
    const val = this.data.readUInt16LE(this.offset);
    this.offset += 2;
    return val;
  }

  readU32(): number {
    const val = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return val;
  }

  readU64(): BN {
    const slice = this.data.subarray(this.offset, this.offset + 8);
    this.offset += 8;
    return new BN(slice, "le");
  }

  readI64(): BN {
    const slice = this.data.subarray(this.offset, this.offset + 8);
    this.offset += 8;
    return new BN(slice, "le");
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readPubkey(): PublicKey {
    const key = new PublicKey(this.data.subarray(this.offset, this.offset + 32));
    this.offset += 32;
    return key;
  }

  readOptionPubkey(): PublicKey | null {
    const flag = this.readU8();
    if (flag === 0) return null;
    return this.readPubkey();
  }
}

function parseGameConfig(data: Buffer) {
  const r = new BorshReader(data);
  r.skip(8); // discriminator
  return {
    gameId: r.readU64(),
    authority: r.readOptionPubkey(),
    gridWidth: r.readU8(),
    gridHeight: r.readU8(),
    maxPlayers: r.readU8(),
    currentPlayers: r.readU8(),
    entryFee: r.readU64(),
    prizePool: r.readU64(),
    status: r.readU8(),
    winner: r.readOptionPubkey(),
    createdAt: r.readI64(),
    startedAt: r.readI64(),
    roundDuration: r.readU16(),
    platformFeeBps: r.readU16(),
  };
}

function parseGrid(data: Buffer) {
  const r = new BorshReader(data);
  r.skip(8); // discriminator
  const cells: number[] = [];
  for (let i = 0; i < 143; i++) cells.push(r.readU8());
  const powerupTypes: number[] = [];
  for (let i = 0; i < 143; i++) powerupTypes.push(r.readU8());
  return { cells, powerupTypes };
}

function parsePlayer(data: Buffer) {
  const r = new BorshReader(data);
  r.skip(8); // discriminator
  return {
    authority: r.readOptionPubkey(),
    x: r.readU8(),
    y: r.readU8(),
    alive: r.readBool(),
    collectedSol: r.readU64(),
    wager: r.readU64(),
    bombRange: r.readU8(),
    maxBombs: r.readU8(),
    activeBombs: r.readU8(),
    speed: r.readU8(),
    playerIndex: r.readU8(),
    lastMoveSlot: r.readU64(),
    kills: r.readU8(),
  };
}

function parseBomb(data: Buffer) {
  const r = new BorshReader(data);
  r.skip(8); // discriminator
  return {
    owner: r.readOptionPubkey(),
    x: r.readU8(),
    y: r.readU8(),
    range: r.readU8(),
    fuseSlots: r.readU8(),
    placedAtSlot: r.readU64(),
    detonated: r.readBool(),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("Deadmint Bomberman", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = provider.wallet.publicKey;

  let worldPda: PublicKey;
  let gameEntityPda: PublicKey;
  let playerEntityPdas: PublicKey[] = [];
  const ENTRY_FEE = new BN(100_000_000); // 0.1 SOL
  const GAME_ID = new BN(1);

  async function fetchGameConfig() {
    const pda = FindComponentPda({
      componentId: GAME_CONFIG_ID,
      entity: gameEntityPda,
    });
    const acc = await connection.getAccountInfo(pda);
    return parseGameConfig(acc!.data as Buffer);
  }

  async function fetchGrid() {
    const pda = FindComponentPda({
      componentId: GRID_ID,
      entity: gameEntityPda,
    });
    const acc = await connection.getAccountInfo(pda);
    return parseGrid(acc!.data as Buffer);
  }

  async function fetchPlayer(entityPda: PublicKey) {
    const pda = FindComponentPda({
      componentId: PLAYER_ID,
      entity: entityPda,
    });
    const acc = await connection.getAccountInfo(pda);
    return parsePlayer(acc!.data as Buffer);
  }

  // ─── 1. Initialize World ───────────────────────────────────────

  it("Initialize world", async () => {
    const { instruction, worldPda: wPda } = await InitializeNewWorld({
      payer,
      connection,
    });
    worldPda = wPda;
    const tx = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx);

    const acc = await connection.getAccountInfo(worldPda);
    expect(acc).to.not.be.null;
  });

  // ─── 2. Create Game Entity + Components ────────────────────────

  it("Create game entity with GameConfig and Grid", async () => {
    const { instruction: addEntityIx, entityPda } = await AddEntity({
      payer,
      world: worldPda,
      connection,
    });
    gameEntityPda = entityPda;
    const tx1 = new anchor.web3.Transaction().add(addEntityIx);
    await provider.sendAndConfirm(tx1);

    // Initialize GameConfig component
    const { instruction: initGameConfigIx } = await InitializeComponent({
      payer,
      entity: gameEntityPda,
      componentId: GAME_CONFIG_ID,
    });
    const tx2 = new anchor.web3.Transaction().add(initGameConfigIx);
    await provider.sendAndConfirm(tx2);

    // Initialize Grid component
    const { instruction: initGridIx } = await InitializeComponent({
      payer,
      entity: gameEntityPda,
      componentId: GRID_ID,
    });
    const tx3 = new anchor.web3.Transaction().add(initGridIx);
    await provider.sendAndConfirm(tx3);
  });

  // ─── 3. Init Game System ───────────────────────────────────────

  it("Init game - sets up config and grid", async () => {
    const args = serializeInitGameArgs(GAME_ID, payer, ENTRY_FEE);
    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: INIT_GAME_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [
            { componentId: GAME_CONFIG_ID },
            { componentId: GRID_ID },
          ],
        },
      ],
      args,
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx);

    // Verify GameConfig
    const gc = await fetchGameConfig();
    expect(gc.gameId.toNumber()).to.equal(1);
    expect(gc.gridWidth).to.equal(13);
    expect(gc.gridHeight).to.equal(11);
    expect(gc.maxPlayers).to.equal(4);
    expect(gc.currentPlayers).to.equal(0);
    expect(gc.entryFee.toNumber()).to.equal(100_000_000);
    expect(gc.status).to.equal(0); // Lobby
    expect(gc.roundDuration).to.equal(180);
    expect(gc.platformFeeBps).to.equal(300);
  });

  // ─── 4. Verify Grid Layout ────────────────────────────────────

  it("Grid has correct Bomberman layout", async () => {
    const grid = await fetchGrid();
    const cells = grid.cells;

    // All border cells should be walls (1)
    for (let x = 0; x < 13; x++) {
      expect(cells[0 * 13 + x]).to.equal(1, `Top border at x=${x}`);
      expect(cells[10 * 13 + x]).to.equal(1, `Bottom border at x=${x}`);
    }
    for (let y = 0; y < 11; y++) {
      expect(cells[y * 13 + 0]).to.equal(1, `Left border at y=${y}`);
      expect(cells[y * 13 + 12]).to.equal(1, `Right border at y=${y}`);
    }

    // Pillars at even x,y (interior)
    expect(cells[2 * 13 + 2]).to.equal(1, "Pillar at (2,2)");
    expect(cells[4 * 13 + 4]).to.equal(1, "Pillar at (4,4)");
    expect(cells[6 * 13 + 6]).to.equal(1, "Pillar at (6,6)");

    // Spawn corners should be empty (0)
    expect(cells[1 * 13 + 1]).to.equal(0, "Spawn (1,1)");
    expect(cells[1 * 13 + 11]).to.equal(0, "Spawn (11,1)");
    expect(cells[9 * 13 + 1]).to.equal(0, "Spawn (1,9)");
    expect(cells[9 * 13 + 11]).to.equal(0, "Spawn (11,9)");

    // Safe zone cells near spawn (1,1) - Manhattan dist <=2
    expect(cells[1 * 13 + 2]).to.equal(0, "Safe zone (2,1)");
    expect(cells[2 * 13 + 1]).to.equal(0, "Safe zone (1,2)");
    expect(cells[1 * 13 + 3]).to.equal(0, "Safe zone (3,1)");

    // Interior non-safe, non-pillar cells should be destructible (2)
    expect(cells[1 * 13 + 5]).to.equal(2, "Destructible at (5,1)");
    expect(cells[3 * 13 + 3]).to.equal(2, "Destructible at (3,3)");
  });

  // ─── 5. Create Player Entities ────────────────────────────────

  it("Create 4 player entities", async () => {
    for (let i = 0; i < 4; i++) {
      const { instruction, entityPda } = await AddEntity({
        payer,
        world: worldPda,
        connection,
      });
      playerEntityPdas.push(entityPda);
      const tx1 = new anchor.web3.Transaction().add(instruction);
      await provider.sendAndConfirm(tx1);

      const { instruction: initPlayerIx } = await InitializeComponent({
        payer,
        entity: entityPda,
        componentId: PLAYER_ID,
      });
      const tx2 = new anchor.web3.Transaction().add(initPlayerIx);
      await provider.sendAndConfirm(tx2);
    }
    expect(playerEntityPdas.length).to.equal(4);
  });

  // ─── 6. Join Game ─────────────────────────────────────────────

  it("Join game - 4 players join and game starts", async () => {
    for (let i = 0; i < 4; i++) {
      const args = serializeJoinGameArgs(payer);
      const { instruction } = await applySystem(provider, {
        authority: payer,
        systemId: JOIN_GAME_ID,
        world: worldPda,
        entities: [
          {
            entity: gameEntityPda,
            components: [{ componentId: GAME_CONFIG_ID }],
          },
          {
            entity: playerEntityPdas[i],
            components: [{ componentId: PLAYER_ID }],
          },
        ],
        args,
      });
      const tx = new anchor.web3.Transaction().add(instruction);
      await provider.sendAndConfirm(tx);
    }

    // Verify game is now active
    const gc = await fetchGameConfig();
    expect(gc.currentPlayers).to.equal(4);
    expect(gc.status).to.equal(1); // Active
    expect(gc.prizePool.toNumber()).to.equal(4 * 100_000_000);
    expect(gc.startedAt.toNumber()).to.be.greaterThan(0);
  });

  it("Players have correct spawn positions", async () => {
    const spawns = [
      [1, 1],
      [11, 1],
      [1, 9],
      [11, 9],
    ];
    for (let i = 0; i < 4; i++) {
      const p = await fetchPlayer(playerEntityPdas[i]);
      expect(p.x).to.equal(spawns[i][0], `Player ${i} x`);
      expect(p.y).to.equal(spawns[i][1], `Player ${i} y`);
      expect(p.alive).to.be.true;
      expect(p.bombRange).to.equal(1);
      expect(p.maxBombs).to.equal(1);
      expect(p.speed).to.equal(1);
      expect(p.playerIndex).to.equal(i);
    }
  });

  // ─── 7. Move Player ──────────────────────────────────────────

  it("Move player right (direction=3)", async () => {
    // Player 0 is at (1,1), move right to (2,1)
    const args = serializeMoveArgs(3); // Right
    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: MOVE_PLAYER_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [
            { componentId: GAME_CONFIG_ID },
            { componentId: GRID_ID },
          ],
        },
        {
          entity: playerEntityPdas[0],
          components: [{ componentId: PLAYER_ID }],
        },
      ],
      args,
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx);

    const p = await fetchPlayer(playerEntityPdas[0]);
    expect(p.x).to.equal(2);
    expect(p.y).to.equal(1);
    expect(p.alive).to.be.true;
  });

  it("Move player blocked by pillar", async () => {
    // Player 0 is at (2,1), moving down to (2,2) which is a pillar
    const args = serializeMoveArgs(1); // Down
    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: MOVE_PLAYER_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [
            { componentId: GAME_CONFIG_ID },
            { componentId: GRID_ID },
          ],
        },
        {
          entity: playerEntityPdas[0],
          components: [{ componentId: PLAYER_ID }],
        },
      ],
      args,
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    try {
      await provider.sendAndConfirm(tx);
      expect.fail("Should have rejected - cell not walkable");
    } catch (e: any) {
      // Expected: CellNotWalkable or MoveTooFast error
      expect(e.toString()).to.include("custom program error");
    }
  });

  // ─── 8. Place Bomb ───────────────────────────────────────────

  let bombEntityPda: PublicKey;

  it("Place bomb at player position", async () => {
    // Create bomb entity
    const { instruction: addBombIx, entityPda } = await AddEntity({
      payer,
      world: worldPda,
      connection,
    });
    bombEntityPda = entityPda;
    const tx1 = new anchor.web3.Transaction().add(addBombIx);
    await provider.sendAndConfirm(tx1);

    const { instruction: initBombIx } = await InitializeComponent({
      payer,
      entity: bombEntityPda,
      componentId: BOMB_ID,
    });
    const tx2 = new anchor.web3.Transaction().add(initBombIx);
    await provider.sendAndConfirm(tx2);

    // Place bomb - system_input order: GameConfig, Grid, Player, Bomb
    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: PLACE_BOMB_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [
            { componentId: GAME_CONFIG_ID },
            { componentId: GRID_ID },
          ],
        },
        {
          entity: playerEntityPdas[0],
          components: [{ componentId: PLAYER_ID }],
        },
        {
          entity: bombEntityPda,
          components: [{ componentId: BOMB_ID }],
        },
      ],
      args: Buffer.alloc(0),
    });
    const tx3 = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx3);

    // Verify grid cell has bomb
    const grid = await fetchGrid();
    const p = await fetchPlayer(playerEntityPdas[0]);
    const idx = p.y * 13 + p.x;
    expect(grid.cells[idx]).to.equal(3, "Cell should be bomb (3)");

    // Verify bomb component
    const bombPda = FindComponentPda({
      componentId: BOMB_ID,
      entity: bombEntityPda,
    });
    const bombAcc = await connection.getAccountInfo(bombPda);
    const bomb = parseBomb(bombAcc!.data as Buffer);
    expect(bomb.x).to.equal(p.x);
    expect(bomb.y).to.equal(p.y);
    expect(bomb.range).to.equal(1);
    expect(bomb.fuseSlots).to.equal(6);
    expect(bomb.detonated).to.be.false;

    // Player should have 1 active bomb
    expect(p.activeBombs).to.equal(1);
  });

  // ─── 9. Check Game End ───────────────────────────────────────

  it("Check game end - still active (4 alive)", async () => {
    const args = serializeCheckGameEndArgs(4, PublicKey.default);
    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: CHECK_GAME_END_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [{ componentId: GAME_CONFIG_ID }],
        },
        {
          entity: playerEntityPdas[0],
          components: [{ componentId: PLAYER_ID }],
        },
      ],
      args,
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx);

    const gc = await fetchGameConfig();
    expect(gc.status).to.equal(1); // Still Active
  });

  it("Check game end - declares winner (1 alive)", async () => {
    const args = serializeCheckGameEndArgs(1, payer);
    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: CHECK_GAME_END_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [{ componentId: GAME_CONFIG_ID }],
        },
        {
          entity: playerEntityPdas[0],
          components: [{ componentId: PLAYER_ID }],
        },
      ],
      args,
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx);

    const gc = await fetchGameConfig();
    expect(gc.status).to.equal(2); // Finished
    expect(gc.winner!.toBase58()).to.equal(payer.toBase58());
  });

  // ─── 10. Claim Prize ─────────────────────────────────────────

  it("Claim prize - winner receives payout", async () => {
    const treasury = Keypair.generate().publicKey;
    const args = serializeClaimPrizeArgs(treasury);

    const { instruction } = await applySystem(provider, {
      authority: payer,
      systemId: CLAIM_PRIZE_ID,
      world: worldPda,
      entities: [
        {
          entity: gameEntityPda,
          components: [{ componentId: GAME_CONFIG_ID }],
        },
        {
          entity: playerEntityPdas[0],
          components: [{ componentId: PLAYER_ID }],
        },
      ],
      args,
    });
    const tx = new anchor.web3.Transaction().add(instruction);
    await provider.sendAndConfirm(tx);

    const gc = await fetchGameConfig();
    expect(gc.status).to.equal(3); // Claimed
    expect(gc.prizePool.toNumber()).to.equal(0);

    // Verify winner payout on player component
    const p = await fetchPlayer(playerEntityPdas[0]);
    const expectedPrizePool = 4 * 100_000_000;
    const expectedFee = Math.floor((expectedPrizePool * 300) / 10_000);
    const expectedPayout = expectedPrizePool - expectedFee;
    expect(p.collectedSol.toNumber()).to.equal(expectedPayout);
  });
});
