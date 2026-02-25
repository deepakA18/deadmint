/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/deadmint.json`.
 */
export type Deadmint = {
  "address": "Aj2fUK4fdw6Y6BCgtuUPsBL761AAgFjNjzt5Zd3Sp2Qb",
  "metadata": {
    "name": "deadmint",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Deadmint - Financialized Bomberman on Solana"
  },
  "instructions": [
    {
      "name": "checkGameEnd",
      "discriminator": [
        86,
        79,
        62,
        221,
        255,
        185,
        211,
        253
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "claimPrize",
      "discriminator": [
        157,
        233,
        139,
        121,
        246,
        62,
        234,
        235
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player"
        },
        {
          "name": "winner",
          "docs": [
            "The winner's wallet (receives SOL payout)"
          ],
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "delegate",
      "docs": [
        "Delegate a PDA (Game or Player) to the Ephemeral Rollup validator.",
        "Seeds are passed as instruction data so the SDK can verify PDA ownership."
      ],
      "discriminator": [
        90,
        147,
        75,
        178,
        85,
        88,
        4,
        137
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                144,
                125,
                116,
                254,
                115,
                159,
                220,
                207,
                113,
                184,
                36,
                252,
                85,
                221,
                29,
                139,
                203,
                77,
                128,
                151,
                30,
                123,
                190,
                92,
                225,
                235,
                177,
                68,
                211,
                125,
                120,
                164
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "Aj2fUK4fdw6Y6BCgtuUPsBL761AAgFjNjzt5Zd3Sp2Qb"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "seeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "detonateBomb",
      "discriminator": [
        33,
        102,
        122,
        203,
        170,
        213,
        123,
        58
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "authority",
          "docs": [
            "Anyone can call detonate (crank-able). Payer just pays tx fee."
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "bombIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializeGame",
      "discriminator": [
        44,
        62,
        102,
        247,
        126,
        208,
        130,
        215
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        },
        {
          "name": "entryFee",
          "type": "u64"
        },
        {
          "name": "maxPlayers",
          "type": "u8"
        }
      ]
    },
    {
      "name": "joinGame",
      "discriminator": [
        107,
        112,
        18,
        38,
        56,
        173,
        60,
        128
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "playerAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "movePlayer",
      "discriminator": [
        17,
        58,
        68,
        221,
        186,
        117,
        140,
        231
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "direction",
          "type": "u8"
        }
      ]
    },
    {
      "name": "placeBomb",
      "discriminator": [
        165,
        31,
        36,
        156,
        19,
        206,
        89,
        188
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "undelegate",
      "docs": [
        "Commit state and undelegate a PDA from the Ephemeral Rollup."
      ],
      "discriminator": [
        131,
        148,
        180,
        198,
        91,
        104,
        42,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "gameNotInLobby",
      "msg": "Game is not in lobby state"
    },
    {
      "code": 6001,
      "name": "gameNotActive",
      "msg": "Game is not active"
    },
    {
      "code": 6002,
      "name": "gameNotFinished",
      "msg": "Game is not finished"
    },
    {
      "code": 6003,
      "name": "gameFull",
      "msg": "Game is full"
    },
    {
      "code": 6004,
      "name": "playerNotAlive",
      "msg": "Player is not alive"
    },
    {
      "code": 6005,
      "name": "playerGameMismatch",
      "msg": "Player does not belong to this game"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Unauthorized — signer does not match player authority"
    },
    {
      "code": 6007,
      "name": "invalidDirection",
      "msg": "Invalid direction (must be 0-3)"
    },
    {
      "code": 6008,
      "name": "cellNotWalkable",
      "msg": "Cell is not walkable"
    },
    {
      "code": 6009,
      "name": "outOfBounds",
      "msg": "Move out of bounds"
    },
    {
      "code": 6010,
      "name": "moveTooFast",
      "msg": "Moving too fast — wait for cooldown"
    },
    {
      "code": 6011,
      "name": "noBombsAvailable",
      "msg": "No bombs available"
    },
    {
      "code": 6012,
      "name": "cellOccupied",
      "msg": "Cell is occupied by a bomb"
    },
    {
      "code": 6013,
      "name": "bombSlotsFull",
      "msg": "All bomb slots are full"
    },
    {
      "code": 6014,
      "name": "invalidBombIndex",
      "msg": "Invalid bomb index"
    },
    {
      "code": 6015,
      "name": "bombNotActive",
      "msg": "Bomb is not active"
    },
    {
      "code": 6016,
      "name": "bombAlreadyDetonated",
      "msg": "Bomb already detonated"
    },
    {
      "code": 6017,
      "name": "fuseNotExpired",
      "msg": "Fuse has not expired yet"
    },
    {
      "code": 6018,
      "name": "noWinner",
      "msg": "No winner set"
    },
    {
      "code": 6019,
      "name": "notWinner",
      "msg": "Not the winner"
    },
    {
      "code": 6020,
      "name": "alreadyClaimed",
      "msg": "Prize already claimed"
    },
    {
      "code": 6021,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "bombSlot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "x",
            "type": "u8"
          },
          {
            "name": "y",
            "type": "u8"
          },
          {
            "name": "range",
            "type": "u8"
          },
          {
            "name": "fuseSlots",
            "type": "u8"
          },
          {
            "name": "placedAtSlot",
            "type": "u64"
          },
          {
            "name": "detonated",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "gridWidth",
            "type": "u8"
          },
          {
            "name": "gridHeight",
            "type": "u8"
          },
          {
            "name": "maxPlayers",
            "type": "u8"
          },
          {
            "name": "currentPlayers",
            "type": "u8"
          },
          {
            "name": "entryFee",
            "type": "u64"
          },
          {
            "name": "prizePool",
            "type": "u64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "roundDuration",
            "type": "u16"
          },
          {
            "name": "platformFeeBps",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "cells",
            "type": {
              "array": [
                "u8",
                143
              ]
            }
          },
          {
            "name": "powerupTypes",
            "type": {
              "array": [
                "u8",
                143
              ]
            }
          },
          {
            "name": "bombs",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "bombSlot"
                  }
                },
                12
              ]
            }
          },
          {
            "name": "bombCount",
            "type": "u8"
          },
          {
            "name": "lastDetonateSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "player",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "playerIndex",
            "type": "u8"
          },
          {
            "name": "x",
            "type": "u8"
          },
          {
            "name": "y",
            "type": "u8"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "collectedSol",
            "type": "u64"
          },
          {
            "name": "wager",
            "type": "u64"
          },
          {
            "name": "bombRange",
            "type": "u8"
          },
          {
            "name": "maxBombs",
            "type": "u8"
          },
          {
            "name": "activeBombs",
            "type": "u8"
          },
          {
            "name": "speed",
            "type": "u8"
          },
          {
            "name": "lastMoveSlot",
            "type": "u64"
          },
          {
            "name": "kills",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
