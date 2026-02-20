use bolt_lang::*;

declare_id!("22jhJmsR9JDRbbzy6TLuGkr7jMjSAgwMKtG2SJ3oATew");

#[component]
#[derive(Default)]
pub struct Player {
    pub authority: Option<Pubkey>,
    pub x: u8,
    pub y: u8,
    pub alive: bool,
    pub collected_sol: u64,
    pub wager: u64,
    pub bomb_range: u8,
    pub max_bombs: u8,
    pub active_bombs: u8,
    pub speed: u8,
    pub player_index: u8,
    pub last_move_slot: u64,
    pub kills: u8,
}
