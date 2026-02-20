use bolt_lang::*;

declare_id!("B6aeQFgTVwCfjQiiDXbiZxcZbCBzzSFQV8h9CBDx1QqF");

/// Grid cell types:
/// 0 = Empty (walkable)
/// 1 = Indestructible wall (permanent)
/// 2 = Destructible block (drops loot when bombed)
/// 3 = Bomb (active bomb on this cell)
/// 4 = Explosion (temporary, damages players)
/// 5 = Loot (SOL pickup on this cell)
/// 6 = Powerup (speed/bomb range/extra bomb)
#[component]
pub struct Grid {
    /// Flat array: index = y * 13 + x. 13x11 = 143 cells.
    pub cells: [u8; 143],
    /// Powerup type per cell (only for type=6): 1=bomb_range, 2=extra_bomb, 3=speed
    pub powerup_types: [u8; 143],
}

impl Default for Grid {
    fn default() -> Self {
        Self {
            cells: [0u8; 143],
            powerup_types: [0u8; 143],
            bolt_metadata: BoltMetadata {
                authority: Pubkey::default(),
            },
        }
    }
}
