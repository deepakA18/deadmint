use bolt_lang::*;

declare_id!("HPyYmnUfG2a1zhLMibMZGVF9UP8xcBvCKLU4e9FnYhu4");

#[component]
#[derive(Default)]
pub struct Bomb {
    pub owner: Option<Pubkey>,
    pub x: u8,
    pub y: u8,
    pub range: u8,
    pub fuse_slots: u8,
    pub placed_at_slot: u64,
    pub detonated: bool,
}
