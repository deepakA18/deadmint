import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { FindComponentPda } from "@magicblock-labs/bolt-sdk";
import BN from "bn.js";
import { WORLD_PROGRAM_ID } from "./constants";
import type {
  GameConfig,
  GridState,
  PlayerState,
  BombState,
} from "./types";

// ─── Borsh Reader ──────────────────────────────────────────────

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
    const key = new PublicKey(
      this.data.subarray(this.offset, this.offset + 32)
    );
    this.offset += 32;
    return key;
  }

  readOptionPubkey(): PublicKey | null {
    const flag = this.readU8();
    if (flag === 0) return null;
    return this.readPubkey();
  }
}

// ─── Component Deserializers ──────────────────────────────────

export function parseGameConfig(data: Buffer): GameConfig {
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

export function parseGrid(data: Buffer): GridState {
  const r = new BorshReader(data);
  r.skip(8);
  const cells: number[] = [];
  for (let i = 0; i < 143; i++) cells.push(r.readU8());
  const powerupTypes: number[] = [];
  for (let i = 0; i < 143; i++) powerupTypes.push(r.readU8());
  return { cells, powerupTypes };
}

export function parsePlayer(data: Buffer): PlayerState {
  const r = new BorshReader(data);
  r.skip(8);
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

export function parseBomb(data: Buffer): BombState {
  const r = new BorshReader(data);
  r.skip(8);
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

// ─── Borsh Serializers ────────────────────────────────────────

export function serializeInitGameArgs(
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

export function serializeJoinGameArgs(playerAuthority: PublicKey): Buffer {
  const buf = Buffer.alloc(32);
  playerAuthority.toBuffer().copy(buf, 0);
  return buf;
}

export function serializeMoveArgs(direction: number): Buffer {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(direction, 0);
  return buf;
}

export function serializeCheckGameEndArgs(
  aliveCount: number,
  winner: PublicKey
): Buffer {
  const buf = Buffer.alloc(1 + 32);
  buf.writeUInt8(aliveCount, 0);
  winner.toBuffer().copy(buf, 1);
  return buf;
}

export function serializeClaimPrizeArgs(treasury: PublicKey): Buffer {
  const buf = Buffer.alloc(32);
  treasury.toBuffer().copy(buf, 0);
  return buf;
}

// ─── Instruction Builders ─────────────────────────────────────

export function buildApplyInstruction(
  authority: PublicKey,
  systemId: PublicKey,
  world: PublicKey,
  args: Buffer,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
): TransactionInstruction {
  // Discriminator = sha256("global:apply")[:8]
  const { createHash } = require("crypto");
  const disc = createHash("sha256")
    .update("global:apply")
    .digest()
    .subarray(0, 8);
  const argsLen = Buffer.alloc(4);
  argsLen.writeUInt32LE(args.length, 0);
  const data = Buffer.concat([disc, argsLen, args]);

  const keys = [
    { pubkey: systemId, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: true },
    {
      pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: world, isSigner: false, isWritable: true },
    ...remainingAccounts,
  ];

  return new TransactionInstruction({
    keys,
    programId: WORLD_PROGRAM_ID,
    data,
  });
}

export function buildApplySystemInstruction(opts: {
  authority: PublicKey;
  systemId: PublicKey;
  world: PublicKey;
  entities: {
    entity: PublicKey;
    components: { componentId: PublicKey }[];
  }[];
  args?: Buffer;
}): TransactionInstruction {
  const remainingAccounts: {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }[] = [];

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

  return buildApplyInstruction(
    opts.authority,
    opts.systemId,
    opts.world,
    opts.args || Buffer.alloc(0),
    remainingAccounts
  );
}
