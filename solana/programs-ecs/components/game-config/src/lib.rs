use bolt_lang::*;

declare_id!("919ULGHVd8Ei2NCeCg3zfpNrCg5QKNh6dJtnTLdRp8DP");

#[component]
#[derive(Default)]
pub struct GameConfig {
    pub game_id: u64,
    pub authority: Option<Pubkey>,
    pub grid_width: u8,
    pub grid_height: u8,
    pub max_players: u8,
    pub current_players: u8,
    pub entry_fee: u64,
    pub prize_pool: u64,
    /// 0=Lobby, 1=Active, 2=Finished, 3=Claimed
    pub status: u8,
    pub winner: Option<Pubkey>,
    pub created_at: i64,
    pub started_at: i64,
    pub round_duration: u16,
    pub platform_fee_bps: u16,
}
